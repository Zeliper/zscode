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
import type { TaskOutput, Memory, RelatedStagingArtifacts, SessionBudget, SessionGuidance, Staging, Task } from "../state/types.js";
import {
  textResponse,
  textErrorResponse,
  formatStagingComplete,
  formatTaskOutputSaved,
} from "../utils/format.js";

/**
 * Register staging-related tools
 */
export function registerStagingTools(server: McpServer, projectRoot: string): void {
  const artifactsManager = new ArtifactsManager(projectRoot);

  // ============ zscode:start ============
  server.tool(
    "zscode:start",
    "Start a specific staging phase of a plan. Sets the staging status to 'in_progress' and prepares the artifacts directory. Automatically includes artifacts from dependent stagings and relevant memories.\n\n⚠️ **IMPORTANT: USER CONSENT REQUIRED**\nDO NOT call this tool automatically. ALWAYS ask the user for explicit permission before starting a staging phase. Present the staging details and wait for user approval first.",
    {
      planId: z.string().describe("Plan ID (e.g., plan-abc12345)"),
      stagingId: z.string().describe("Staging ID to start (e.g., staging-0001)"),
      includeArtifacts: z.boolean().default(true).describe("Include artifacts from dependent stagings"),
      includeMemories: z.boolean().default(true).describe("Include relevant staging-start memories"),
      autoStartTasks: z.boolean().default(false)
        .describe("For parallel stagings: automatically mark all executable tasks as 'in_progress'. Use this when you plan to work on all tasks simultaneously."),
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
        let executableTasks = manager.getExecutableTasks(args.stagingId);
        const allTasks = manager.getTasksByStaging(args.stagingId);

        // Auto-start tasks if requested (for parallel staging execution)
        let autoStartedTasks: Array<{ taskId: string; taskTitle: string }> = [];
        if (args.autoStartTasks && startedStaging.execution_type === "parallel" && executableTasks.length > 0) {
          // Use batch update to start all tasks at once
          const updates = executableTasks.map(t => ({
            taskId: t.id,
            status: "in_progress" as const,
          }));

          const batchResult = await manager.updateTasksStatus(updates);

          // Track which tasks were auto-started
          autoStartedTasks = batchResult.results
            .filter(r => r.success && r.newStatus === "in_progress")
            .map(r => ({ taskId: r.taskId, taskTitle: r.taskTitle }));

          // Refresh executable tasks after auto-start (they'll now be in_progress)
          executableTasks = manager.getExecutableTasks(args.stagingId);
        }

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

        // Refresh task list to get current status
        const refreshedTasks = manager.getTasksByStaging(args.stagingId);
        const inProgressTasks = refreshedTasks.filter(t => t.status === "in_progress");
        const pendingTasks = refreshedTasks.filter(t => t.status === "pending");

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
          // Auto-started tasks info
          autoStartedTasks: autoStartedTasks.length > 0 ? autoStartedTasks : undefined,
          tasks: {
            total: allTasks.length,
            inProgress: inProgressTasks.map(t => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              execution_mode: t.execution_mode,
              model: t.model,
              depends_on: t.depends_on,
              cross_staging_refs: t.cross_staging_refs,
              memory_tags: t.memory_tags,
            })),
            pending: pendingTasks.map(t => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              execution_mode: t.execution_mode,
              model: t.model,
              depends_on: t.depends_on,
              cross_staging_refs: t.cross_staging_refs,
              memory_tags: t.memory_tags,
            })),
          },
          // Related artifacts from dependent stagings (summaries only for context reduction)
          relatedArtifacts: relatedArtifacts.length > 0 ? relatedArtifacts.map(ra => ({
            stagingId: ra.stagingId,
            stagingName: ra.stagingName,
            taskCount: Object.keys(ra.taskOutputs).length,
          })) : undefined,
          // Applied memories for staging-start (titles only for context reduction)
          appliedMemories: appliedMemories.length > 0 ? appliedMemories.map(m => ({
            id: m.id,
            category: m.category,
            title: m.title,
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

        const lines = [
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "⚠️ **REMINDER: Did you ask user permission?**",
          "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
          "",
          `🚀 Started: **${data.staging.name}** (${data.staging.id})`,
        ];
        if (data.staging.description) {
          lines.push(`   ${data.staging.description}`);
        }

        // Task counts
        const inProgressCount = data.tasks.inProgress?.length || 0;
        const pendingCount = data.tasks.pending?.length || 0;
        lines.push(`   Tasks: ${inProgressCount} in_progress, ${pendingCount} pending (${data.tasks.total} total)`);

        if (data.sessionGuidance?.budget) {
          lines.push(`   Budget: ${data.sessionGuidance.budget}`);
        }

        // Auto-started tasks notification
        if (data.autoStartedTasks && data.autoStartedTasks.length > 0) {
          lines.push("");
          lines.push(`✅ **Auto-started ${data.autoStartedTasks.length} tasks** (parallel execution)`);
        }

        // In-progress tasks
        if (data.tasks.inProgress && data.tasks.inProgress.length > 0) {
          const inProgressLines = data.tasks.inProgress.map((t: {
            id: string;
            title: string;
            priority: string;
            model?: string;
          }) => {
            const modelIndicator = formatModelIndicator(t.model, data.staging.default_model);
            return `   🔄 ${t.title} (${t.id}) [${t.priority}]${modelIndicator}`;
          }).join("\n");
          lines.push("", "**In Progress:**", inProgressLines);
        }

        // Pending tasks
        if (data.tasks.pending && data.tasks.pending.length > 0) {
          const pendingLines = data.tasks.pending.map((t: {
            id: string;
            title: string;
            priority: string;
            model?: string;
          }) => {
            const modelIndicator = formatModelIndicator(t.model, data.staging.default_model);
            return `   ⏳ ${t.title} (${t.id}) [${t.priority}]${modelIndicator}`;
          }).join("\n");
          lines.push("", "**Pending:**", pendingLines);
        }

        // Check if any task requires opus
        const allTasks = [...(data.tasks.inProgress || []), ...(data.tasks.pending || [])];
        const opusTasks = allTasks.filter((t: { model?: string }) =>
          t.model === "opus" || (!t.model && data.staging.default_model === "opus")
        );

        if (opusTasks.length > 0) {
          lines.push("");
          lines.push(`⚠️ **${opusTasks.length} task(s) require Opus model** for code analysis/writing`);
          lines.push(`   Use Task tool with \`model: "opus"\` for these tasks`);
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

        // Find next staging in the plan
        const allStagings = manager.getStagingsByPlan(staging.planId);
        const currentIndex = allStagings.findIndex(s => s.id === args.stagingId);
        const nextStaging = currentIndex >= 0 && currentIndex < allStagings.length - 1
          ? allStagings[currentIndex + 1]
          : null;

        // Get next staging info if exists
        let nextStagingInfo = null;
        if (nextStaging) {
          const nextTasks = manager.getTasksByStaging(nextStaging.id);
          const estimatedContextTokens = estimateContextUsage(nextStaging, nextTasks);

          nextStagingInfo = {
            id: nextStaging.id,
            name: nextStaging.name,
            description: nextStaging.description,
            taskCount: nextTasks.length,
            execution_type: nextStaging.execution_type,
            session_budget: nextStaging.session_budget,
            recommended_sessions: nextStaging.recommended_sessions,
            estimatedContextTokens,
            recommendation: getProgressRecommendation(nextStaging, estimatedContextTokens),
          };
        }

        // Check if plan is completed
        const remainingStagings = allStagings.filter(s => s.status !== "completed" && s.id !== args.stagingId);
        const planCompleted = remainingStagings.length === 0;

        return {
          success: true,
          name: staging.name,
          stagingId: staging.id,
          planId: staging.planId,
          nextStaging: nextStagingInfo,
          planCompleted,
        };
      }, "complete_staging");

      if (result.success) {
        const data = result.data;
        const lines = [formatStagingComplete(data.name)];

        if (data.planCompleted) {
          lines.push("");
          lines.push("🎉 **Plan completed!** All stagings are done.");
          lines.push(`   Use \`zscode:archive\` to archive: ${data.planId}`);
        } else if (data.nextStaging) {
          const next = data.nextStaging;
          lines.push("");
          lines.push("## Next Staging Available");
          lines.push(`📋 **${next.name}** (${next.id})`);
          if (next.description) {
            lines.push(`   ${next.description}`);
          }
          lines.push(`   Tasks: ${next.taskCount} | Execution: ${next.execution_type}`);
          lines.push(`   Est. Context: ~${formatTokens(next.estimatedContextTokens)}`);
          lines.push("");
          lines.push(`### Recommendation`);
          lines.push(`${next.recommendation.icon} **${next.recommendation.action}**`);
          lines.push(`   ${next.recommendation.reason}`);
          lines.push("");
          lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          lines.push("⚠️ **USER CONSENT REQUIRED**");
          lines.push("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
          lines.push("**DO NOT proceed to the next staging automatically.**");
          lines.push("**Ask the user for permission before starting the next phase.**");
          lines.push("");
          lines.push(`▶️ When approved: \`zscode:start ${data.planId} ${next.id}\``);
        }

        return textResponse(lines.join("\n"));
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
      lightweight: z.boolean().default(true)
        .describe("If true, exclude 'data' field from outputs for reduced context size. Default true for context optimization."),
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

// ============ Helper functions for staging completion ============

/**
 * Estimate context token usage for a staging
 * Based on task count, complexity hints, and session budget
 */
function estimateContextUsage(staging: Staging, tasks: Task[]): number {
  // Base tokens per task (description, code references, etc.)
  const baseTokensPerTask = 2000;

  // Session budget multipliers
  const budgetMultiplier: Record<SessionBudget, number> = {
    minimal: 0.5,
    standard: 1.0,
    extensive: 2.0,
  };

  const multiplier = staging.session_budget
    ? budgetMultiplier[staging.session_budget]
    : 1.0;

  // Calculate based on task count and complexity
  let totalTokens = tasks.length * baseTokensPerTask * multiplier;

  // Add overhead for parallel execution (more context needed)
  if (staging.execution_type === "parallel") {
    totalTokens *= 1.2;
  }

  // Use recommended_sessions if available
  if (staging.recommended_sessions) {
    // Assume ~100k tokens per session
    totalTokens = Math.max(totalTokens, staging.recommended_sessions * 100000);
  }

  return Math.round(totalTokens);
}

/**
 * Get recommendation for whether to continue or start new session
 */
function getProgressRecommendation(
  staging: Staging,
  estimatedTokens: number
): { action: "Continue" | "New Session"; icon: string; reason: string } {
  // Thresholds
  const CONTINUE_THRESHOLD = 50000; // ~50k tokens is safe to continue
  const WARNING_THRESHOLD = 100000; // ~100k tokens might need new session

  // Check session budget hints
  if (staging.session_budget === "extensive" || staging.recommended_sessions && staging.recommended_sessions >= 2) {
    return {
      action: "New Session",
      icon: "🔄",
      reason: "This staging is marked as extensive. Starting a new session is recommended for optimal context management.",
    };
  }

  if (staging.session_budget === "minimal" || estimatedTokens < CONTINUE_THRESHOLD) {
    return {
      action: "Continue",
      icon: "▶️",
      reason: "This staging has minimal context requirements. Safe to continue in current session.",
    };
  }

  if (estimatedTokens >= WARNING_THRESHOLD) {
    return {
      action: "New Session",
      icon: "🔄",
      reason: `Estimated context (~${formatTokens(estimatedTokens)}) may exceed optimal limits. Consider starting a new session.`,
    };
  }

  return {
    action: "Continue",
    icon: "▶️",
    reason: "Standard context requirements. Can continue in current session.",
  };
}

/**
 * Format token count for display
 */
function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M tokens`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(0)}K tokens`;
  }
  return `${tokens} tokens`;
}

/**
 * Format model indicator for task display
 * Shows warning for opus tasks that require model switching
 */
function formatModelIndicator(taskModel?: string, stagingDefault?: string): string {
  const effectiveModel = taskModel || stagingDefault;

  if (!effectiveModel) {
    return "";
  }

  // Opus tasks need special indication - they require model switching
  if (effectiveModel === "opus") {
    return " 🔷 **opus**";
  }

  // Sonnet and haiku are informational
  if (effectiveModel === "sonnet") {
    return " 🔶 sonnet";
  }

  if (effectiveModel === "haiku") {
    return " ⚡ haiku";
  }

  return ` [${effectiveModel}]`;
}
