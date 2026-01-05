import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { ArtifactsManager } from "../utils/artifacts.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
  PlanNotFoundError,
  StagingNotFoundError,
  StagingPlanMismatchError,
  TaskNotFoundError,
} from "../errors/index.js";
import type { TaskOutput, Memory, RelatedStagingArtifacts, SessionBudget, SessionGuidance } from "../state/types.js";
import {
  textResponse,
  textErrorResponse,
  formatStagingComplete,
  formatTaskOutputSaved,
  getStatusIcon,
} from "../utils/format.js";

/**
 * Register staging-related tools
 */
export function registerStagingTools(server: McpServer, projectRoot: string): void {
  const artifactsManager = new ArtifactsManager(projectRoot);

  // ============ zscode:start ============
  server.tool(
    "zscode:start",
    "Start a specific staging phase of a plan. Sets the staging status to 'in_progress' and prepares the artifacts directory. Automatically includes artifacts from dependent stagings and relevant memories. Use this when you're ready to begin work on a staging.",
    {
      planId: z.string().describe("Plan ID (e.g., plan-abc12345)"),
      stagingId: z.string().describe("Staging ID to start (e.g., staging-0001)"),
      includeArtifacts: z.boolean().default(true).describe("Include artifacts from dependent stagings"),
      includeMemories: z.boolean().default(true).describe("Include relevant staging-start memories"),
      json: z.boolean().default(false).describe("If true, return JSON instead of human-readable text"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const plan = manager.getPlan(args.planId);
        if (!plan) {
          throw new PlanNotFoundError(args.planId);
        }

        const staging = manager.getStaging(args.stagingId);
        if (!staging) {
          throw new StagingNotFoundError(args.stagingId);
        }

        if (staging.planId !== args.planId) {
          throw new StagingPlanMismatchError(args.stagingId, args.planId, staging.planId);
        }

        // Start the staging
        const startedStaging = await manager.startStaging(args.planId, args.stagingId);

        // Create artifacts directory
        await artifactsManager.createStagingArtifactsDir(args.planId, args.stagingId);

        // Get executable tasks
        const executableTasks = manager.getExecutableTasks(args.stagingId);
        const allTasks = manager.getTasksByStaging(args.stagingId);

        // Get related artifacts from dependent stagings
        let relatedArtifacts: RelatedStagingArtifacts[] = [];
        if (args.includeArtifacts && startedStaging.depends_on_stagings.length > 0) {
          relatedArtifacts = manager.getRelatedStagingArtifacts(args.stagingId);
        }

        // Get staging-start memories + always-applied memories (general + project-summary)
        let appliedMemories: Memory[] = [];
        if (args.includeMemories) {
          // Combine always-applied (general + project-summary) with staging-start specific
          const alwaysApplied = manager.getAlwaysAppliedMemories();
          const stagingStartMemories = manager.getMemoriesForEvent("staging-start");

          // Merge without duplicates, keeping priority order
          const memoryMap = new Map<string, Memory>();
          for (const m of alwaysApplied) {
            memoryMap.set(m.id, m);
          }
          for (const m of stagingStartMemories) {
            memoryMap.set(m.id, m);
          }

          appliedMemories = Array.from(memoryMap.values())
            .sort((a, b) => b.priority - a.priority);
        }

        // Build session guidance if session info is available
        let sessionGuidance: SessionGuidance | undefined;
        if (startedStaging.session_budget || startedStaging.recommended_sessions) {
          const budgetMessages: Record<SessionBudget, string> = {
            minimal: "This staging requires minimal context (~0.5 session). Keep responses concise and focused.",
            standard: "This staging has standard context budget (~1 session). Normal operation expected.",
            extensive: "This staging may require extensive context (~2+ sessions). Consider breaking into sub-tasks if needed.",
          };

          const budget = startedStaging.session_budget || "unspecified";
          const message = startedStaging.session_budget
            ? budgetMessages[startedStaging.session_budget]
            : startedStaging.recommended_sessions
              ? `Recommended sessions: ${startedStaging.recommended_sessions}`
              : "";

          sessionGuidance = {
            budget,
            recommendedSessions: startedStaging.recommended_sessions ?? null,
            message,
          };
        }

        return {
          success: true,
          message: `Staging "${startedStaging.name}" started`,
          staging: {
            id: startedStaging.id,
            name: startedStaging.name,
            description: startedStaging.description,
            status: startedStaging.status,
            execution_type: startedStaging.execution_type,
            default_model: startedStaging.default_model,
            session_budget: startedStaging.session_budget,
            recommended_sessions: startedStaging.recommended_sessions,
            depends_on_stagings: startedStaging.depends_on_stagings,
          },
          artifactsPath: startedStaging.artifacts_path,
          // Session guidance for context management
          sessionGuidance,
          tasks: {
            total: allTasks.length,
            executable: executableTasks.map(t => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              execution_mode: t.execution_mode,
              model: t.model,
              depends_on: t.depends_on,
              cross_staging_refs: t.cross_staging_refs,
              memory_tags: t.memory_tags,
            })),
            pending: allTasks.filter(t => t.status === "pending").length,
          },
          // Related artifacts from dependent stagings
          relatedArtifacts: relatedArtifacts.length > 0 ? relatedArtifacts : undefined,
          // Applied memories for staging-start (removed appliedMemoriesText to reduce context)
          appliedMemories: appliedMemories.length > 0 ? appliedMemories.map(m => ({
            id: m.id,
            category: m.category,
            title: m.title,
            content: m.content,
            priority: m.priority,
          })) : undefined,
        };
      }, "zscode:start");

      if (result.success) {
        if (args.json) {
          return { content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }] };
        }
        // Default: Human-readable format
        const data = result.data;
        const taskLines = data.tasks.executable.map((t: { title: string; status?: string; priority: string }) =>
          `   ${getStatusIcon(t.status || "pending")} ${t.title} [${t.priority}]`
        ).join("\n");

        const lines = [
          `🚀 Started: **${data.staging.name}**`,
        ];
        if (data.staging.description) {
          lines.push(`   ${data.staging.description}`);
        }
        lines.push(`   Tasks: ${data.tasks.executable.length}/${data.tasks.total} ready`);
        if (data.sessionGuidance?.budget) {
          lines.push(`   Budget: ${data.sessionGuidance.budget}`);
        }
        if (taskLines) {
          lines.push("", "**Executable Tasks:**", taskLines);
        }
        return textResponse(lines.join("\n"));
      } else {
        if (args.json) {
          return { content: [{ type: "text" as const, text: JSON.stringify(result.error, null, 2) }], isError: true };
        }
        return textErrorResponse(result.error.message);
      }
    }
  );

  // ============ complete_staging ============
  server.tool(
    "complete_staging",
    "Manually complete a staging. Usually stagings are auto-completed when all tasks are done, but this can be used to force completion.",
    {
      stagingId: z.string().describe("Staging ID to complete"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const staging = manager.getStaging(args.stagingId);
        if (!staging) {
          throw new StagingNotFoundError(args.stagingId);
        }

        await manager.completeStaging(args.stagingId);

        return {
          success: true,
          name: staging.name,
        };
      }, "complete_staging");

      if (result.success) {
        return textResponse(formatStagingComplete(result.data.name));
      } else {
        return textErrorResponse(result.error.message);
      }
    }
  );

  // ============ save_task_output ============
  server.tool(
    "save_task_output",
    "Save the output/result of a completed task. This stores artifacts that can be used by subsequent tasks.",
    {
      planId: z.string().describe("Plan ID"),
      stagingId: z.string().describe("Staging ID"),
      taskId: z.string().describe("Task ID"),
      output: z.object({
        status: z.enum(["success", "failure", "partial"]).describe("Output status"),
        summary: z.string().describe("Summary of what was accomplished"),
        artifacts: z.array(z.string()).default([]).describe("Paths to created files"),
        data: z.record(z.unknown()).optional().describe("Arbitrary data to pass to next tasks"),
        error: z.string().optional().describe("Error message if failed"),
      }).describe("Task output data"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const task = manager.getTask(args.taskId);
        if (!task) {
          throw new TaskNotFoundError(args.taskId);
        }

        const output: TaskOutput = {
          status: args.output.status,
          summary: args.output.summary,
          artifacts: args.output.artifacts,
          data: args.output.data,
          error: args.output.error,
          completedAt: new Date().toISOString(),
        };

        // Save to state
        await manager.saveTaskOutput(args.taskId, output);

        // Save to artifacts file
        await artifactsManager.saveTaskOutput(
          args.planId,
          args.stagingId,
          args.taskId,
          output
        );

        return {
          success: true,
          taskTitle: task.title,
          status: output.status,
        };
      }, "save_task_output");

      if (result.success) {
        return textResponse(formatTaskOutputSaved(result.data.taskTitle, result.data.status));
      } else {
        return textErrorResponse(result.error.message);
      }
    }
  );

  // ============ get_staging_artifacts ============
  server.tool(
    "get_staging_artifacts",
    "Get all artifacts (task outputs) from a completed staging. Use this to access results from previous stagings.",
    {
      planId: z.string().describe("Plan ID"),
      stagingId: z.string().describe("Staging ID to get artifacts from"),
      taskId: z.string().optional().describe("Specific task ID (optional, if omitted returns all)"),
      lightweight: z.boolean().default(false)
        .describe("If true, exclude 'data' field from outputs for reduced context size"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const staging = manager.getStaging(args.stagingId);
        if (!staging) {
          throw new StagingNotFoundError(args.stagingId);
        }

        if (args.taskId) {
          // Get specific task output
          const output = await artifactsManager.getTaskOutput(
            args.planId,
            args.stagingId,
            args.taskId
          );

          // If lightweight mode, remove data field
          const processedOutput = args.lightweight && output ? {
            status: output.status,
            summary: output.summary,
            artifacts: output.artifacts,
            error: output.error,
            completedAt: output.completedAt,
            // data field omitted
          } : output;

          return {
            success: true,
            staging: {
              id: staging.id,
              name: staging.name,
              status: staging.status,
            },
            taskOutput: processedOutput,
            lightweight: args.lightweight,
          };
        } else {
          // Get all task outputs for staging
          const outputs = await artifactsManager.getStagingOutputs(args.planId, args.stagingId);
          const files = await artifactsManager.listStagingArtifacts(args.planId, args.stagingId);

          // If lightweight mode, remove data field from all outputs
          const processedOutputs = args.lightweight
            ? Object.fromEntries(
                Object.entries(outputs).map(([taskId, output]) => [
                  taskId,
                  {
                    status: output.status,
                    summary: output.summary,
                    artifacts: output.artifacts,
                    error: output.error,
                    completedAt: output.completedAt,
                    // data field omitted
                  }
                ])
              )
            : outputs;

          return {
            success: true,
            staging: {
              id: staging.id,
              name: staging.name,
              status: staging.status,
              artifacts_path: staging.artifacts_path,
            },
            taskOutputs: processedOutputs,
            files,
            lightweight: args.lightweight,
          };
        }
      }, "get_staging_artifacts");

      if (result.success) {
        // Artifacts need to return data for processing, but in compact format
        const data = result.data;
        if (data.taskOutput) {
          // Single task output
          const output = data.taskOutput;
          const statusIcon = output?.status === "success" ? "✅" : output?.status === "partial" ? "⚠️" : "❌";
          const lines = [
            `📦 **${data.staging.name}** artifacts`,
            `${statusIcon} Status: ${output?.status || "none"}`,
            output?.summary ? `   ${output.summary}` : "",
          ].filter(Boolean);
          return textResponse(lines.join("\n"));
        } else {
          // All task outputs - show summary
          const outputCount = Object.keys(data.taskOutputs || {}).length;
          const fileCount = (data.files || []).length;
          const lines = [
            `📦 **${data.staging.name}** artifacts`,
            `   Outputs: ${outputCount} tasks`,
            `   Files: ${fileCount}`,
          ];
          // Show task summaries
          for (const [taskId, output] of Object.entries(data.taskOutputs || {})) {
            const o = output as { status: string; summary: string };
            const icon = o.status === "success" ? "✅" : o.status === "partial" ? "⚠️" : "❌";
            lines.push(`   ${icon} ${taskId}: ${o.summary?.substring(0, 50) || "no summary"}${o.summary?.length > 50 ? "..." : ""}`);
          }
          return textResponse(lines.join("\n"));
        }
      } else {
        return textErrorResponse(result.error.message);
      }
    }
  );
}
