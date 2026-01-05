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
import type { TaskOutput } from "../state/types.js";

/**
 * Register staging-related tools
 */
export function registerStagingTools(server: McpServer, projectRoot: string): void {
  const artifactsManager = new ArtifactsManager(projectRoot);

  // ============ zscode:start ============
  server.tool(
    "zscode:start",
    "Start a specific staging phase of a plan. Sets the staging status to 'in_progress' and prepares the artifacts directory. Use this when you're ready to begin work on a staging.",
    {
      planId: z.string().describe("Plan ID (e.g., plan-abc12345)"),
      stagingId: z.string().describe("Staging ID to start (e.g., staging-0001)"),
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

        return {
          success: true,
          message: `Staging "${startedStaging.name}" started`,
          staging: {
            id: startedStaging.id,
            name: startedStaging.name,
            status: startedStaging.status,
            execution_type: startedStaging.execution_type,
          },
          artifactsPath: startedStaging.artifacts_path,
          tasks: {
            total: allTasks.length,
            executable: executableTasks.map(t => ({
              id: t.id,
              title: t.title,
              priority: t.priority,
              execution_mode: t.execution_mode,
              depends_on: t.depends_on,
            })),
            pending: allTasks.filter(t => t.status === "pending").length,
          },
        };
      }, "zscode:start");

      if (result.success) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
        };
      } else {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.error, null, 2) }],
          isError: true,
        };
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
          message: `Staging "${staging.name}" completed`,
          staging: {
            id: staging.id,
            name: staging.name,
            status: "completed",
          },
        };
      }, "complete_staging");

      if (result.success) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
        };
      } else {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.error, null, 2) }],
          isError: true,
        };
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
        const outputPath = await artifactsManager.saveTaskOutput(
          args.planId,
          args.stagingId,
          args.taskId,
          output
        );

        return {
          success: true,
          message: "Task output saved",
          task: {
            id: task.id,
            title: task.title,
          },
          outputPath,
          output,
        };
      }, "save_task_output");

      if (result.success) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
        };
      } else {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.error, null, 2) }],
          isError: true,
        };
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

          return {
            success: true,
            staging: {
              id: staging.id,
              name: staging.name,
              status: staging.status,
            },
            taskOutput: output,
          };
        } else {
          // Get all task outputs for staging
          const outputs = await artifactsManager.getStagingOutputs(args.planId, args.stagingId);
          const files = await artifactsManager.listStagingArtifacts(args.planId, args.stagingId);

          return {
            success: true,
            staging: {
              id: staging.id,
              name: staging.name,
              status: staging.status,
              artifacts_path: staging.artifacts_path,
            },
            taskOutputs: outputs,
            files,
          };
        }
      }, "get_staging_artifacts");

      if (result.success) {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.data, null, 2) }],
        };
      } else {
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result.error, null, 2) }],
          isError: true,
        };
      }
    }
  );
}
