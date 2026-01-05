import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { withErrorHandling, ProjectNotInitializedError, TaskNotFoundError } from "../errors/index.js";
import type { ExecutionType, TaskPriority } from "../state/types.js";

/**
 * Register plan-related tools
 */
export function registerPlanTools(server: McpServer): void {
  // ============ create_plan ============
  server.tool(
    "create_plan",
    "Create a new plan with stagings and tasks. Plans organize work into sequential staging phases, each containing parallel or sequential tasks.",
    {
      title: z.string().describe("Plan title"),
      description: z.string().optional().describe("Plan description"),
      stagings: z.array(z.object({
        name: z.string().describe("Staging name (e.g., 'Phase 1: Setup')"),
        description: z.string().optional().describe("Staging description"),
        execution_type: z.enum(["parallel", "sequential"]).default("parallel")
          .describe("How tasks in this staging are executed"),
        tasks: z.array(z.object({
          title: z.string().describe("Task title"),
          description: z.string().optional().describe("Task description"),
          priority: z.enum(["high", "medium", "low"]).default("medium").describe("Task priority"),
          execution_mode: z.enum(["parallel", "sequential"]).default("parallel")
            .describe("Execution mode within staging"),
          depends_on_index: z.array(z.number().int().min(0)).default([])
            .describe("Indices of tasks this task depends on (within same staging)"),
        })).describe("Tasks in this staging"),
      })).describe("Staging phases in execution order"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const stagingConfigs = args.stagings.map(s => ({
          name: s.name,
          description: s.description,
          execution_type: s.execution_type as ExecutionType,
          tasks: s.tasks.map(t => ({
            title: t.title,
            description: t.description,
            priority: t.priority as TaskPriority,
            execution_mode: t.execution_mode as ExecutionType,
            depends_on_index: t.depends_on_index,
          })),
        }));

        const plan = await manager.createPlan(
          args.title,
          args.description,
          stagingConfigs
        );

        // Get created stagings and tasks for response
        const stagings = manager.getStagingsByPlan(plan.id);
        const taskCount = stagings.reduce((sum, s) => sum + s.tasks.length, 0);

        return {
          success: true,
          message: `Plan "${args.title}" created with ${stagings.length} stagings and ${taskCount} tasks`,
          plan: {
            id: plan.id,
            title: plan.title,
            status: plan.status,
            stagings: stagings.map(s => ({
              id: s.id,
              name: s.name,
              order: s.order,
              execution_type: s.execution_type,
              taskCount: s.tasks.length,
            })),
          },
        };
      }, "create_plan");

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

  // ============ update_task ============
  server.tool(
    "update_task",
    "Update a task's status. Use this to mark tasks as in_progress, done, or blocked.",
    {
      taskId: z.string().describe("Task ID to update"),
      status: z.enum(["pending", "in_progress", "done", "blocked", "cancelled"])
        .describe("New task status"),
      notes: z.string().optional().describe("Notes about the status change"),
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

        const previousStatus = task.status;
        await manager.updateTaskStatus(args.taskId, args.status, args.notes);

        return {
          success: true,
          message: `Task status updated: ${previousStatus} -> ${args.status}`,
          task: {
            id: task.id,
            title: task.title,
            previousStatus,
            newStatus: args.status,
            notes: args.notes,
          },
        };
      }, "update_task");

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

  // ============ sync_plan ============
  server.tool(
    "sync_plan",
    "Synchronize plan status based on current task states. Automatically completes stagings and plans when all tasks are done.",
    {
      planId: z.string().describe("Plan ID to synchronize"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const plan = manager.getPlan(args.planId);
        if (!plan) {
          throw new Error(`Plan not found: ${args.planId}`);
        }

        // Get all stagings and their status
        const stagings = manager.getStagingsByPlan(args.planId);
        const stagingStatus = stagings.map(staging => {
          const tasks = manager.getTasksByStaging(staging.id);
          const completedTasks = tasks.filter(t => t.status === "done").length;
          const totalTasks = tasks.length;
          const allDone = totalTasks > 0 && completedTasks === totalTasks;

          return {
            id: staging.id,
            name: staging.name,
            status: staging.status,
            completedTasks,
            totalTasks,
            allTasksDone: allDone,
          };
        });

        // Auto-complete stagings where all tasks are done
        for (const s of stagingStatus) {
          if (s.allTasksDone && s.status === "in_progress") {
            await manager.completestaging(s.id);
            s.status = "completed";
          }
        }

        // Check if plan is complete
        const allStagingsComplete = stagingStatus.every(s => s.status === "completed");
        if (allStagingsComplete && plan.status === "active") {
          await manager.updatePlanStatus(args.planId, "completed");
        }

        const updatedPlan = manager.getPlan(args.planId)!;

        return {
          success: true,
          message: "Plan synchronized",
          plan: {
            id: updatedPlan.id,
            title: updatedPlan.title,
            status: updatedPlan.status,
          },
          stagings: stagingStatus,
        };
      }, "sync_plan");

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
