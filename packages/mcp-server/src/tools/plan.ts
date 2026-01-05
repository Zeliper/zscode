import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { withErrorHandling, ProjectNotInitializedError, TaskNotFoundError, PlanNotFoundError } from "../errors/index.js";
import type { ExecutionType, TaskPriority, CrossReferencedTaskOutput, TaskContext, ModelType, SessionBudget } from "../state/types.js";
import { textResponse, textErrorResponse, formatPlanCreated, formatTaskUpdate, getStatusIcon } from "../utils/format.js";

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
        default_model: z.enum(["opus", "sonnet", "haiku"]).optional()
          .describe("Default model for tasks in this staging (tasks can override)"),
        session_budget: z.enum(["minimal", "standard", "extensive"]).optional()
          .describe("Session budget category: minimal (~0.5), standard (~1), extensive (~2+)"),
        recommended_sessions: z.number().min(0.5).max(10).optional()
          .describe("Recommended number of sessions for this staging"),
        tasks: z.array(z.object({
          title: z.string().describe("Task title"),
          description: z.string().optional().describe("Task description"),
          priority: z.enum(["high", "medium", "low"]).default("medium").describe("Task priority"),
          execution_mode: z.enum(["parallel", "sequential"]).default("parallel")
            .describe("Execution mode within staging"),
          model: z.enum(["opus", "sonnet", "haiku"]).optional()
            .describe("Model to use for this task (overrides staging default_model)"),
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
          default_model: s.default_model as ModelType | undefined,
          session_budget: s.session_budget as SessionBudget | undefined,
          recommended_sessions: s.recommended_sessions,
          tasks: s.tasks.map(t => ({
            title: t.title,
            description: t.description,
            priority: t.priority as TaskPriority,
            execution_mode: t.execution_mode as ExecutionType,
            model: t.model as ModelType | undefined,
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
        const d = result.data;
        return textResponse(formatPlanCreated(d.plan.id, d.plan.title, d.plan.stagings.length, d.plan.stagings.reduce((sum: number, s: { taskCount: number }) => sum + s.taskCount, 0)));
      } else {
        return textErrorResponse(result.error.message);
      }
    }
  );

  // ============ update_task ============
  server.tool(
    "update_task",
    "Update a task's status. Use this to mark tasks as in_progress, done, or blocked. Automatically includes relevant memories and cross-referenced task outputs when transitioning to in_progress or done.",
    {
      taskId: z.string().describe("Task ID to update"),
      status: z.enum(["pending", "in_progress", "done", "blocked", "cancelled"])
        .describe("New task status"),
      notes: z.string().optional().describe("Notes about the status change"),
      includeContext: z.boolean().default(true).describe("Include related memories and cross-referenced outputs"),
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

        // Build context based on status transition
        let context: TaskContext | null = null;

        if (args.includeContext) {
          if (args.status === "in_progress") {
            // Task starting: include always-applied + task-start memories and cross-referenced outputs
            const alwaysApplied = manager.getAlwaysAppliedMemories();
            const taskStartMemories = manager.getMemoriesForEvent("task-start", task.memory_tags);

            // Merge without duplicates, keeping priority order
            const memoryMap = new Map<string, typeof alwaysApplied[0]>();
            for (const m of alwaysApplied) {
              memoryMap.set(m.id, m);
            }
            for (const m of taskStartMemories) {
              memoryMap.set(m.id, m);
            }

            const memories = Array.from(memoryMap.values())
              .sort((a, b) => b.priority - a.priority);
            const crossRefs = manager.getCrossReferencedTaskOutputs(args.taskId);

            context = {
              event: "task-start",
              memories,
              crossReferencedOutputs: crossRefs,
            };
          } else if (args.status === "done") {
            // Task completing: include always-applied + task-complete memories
            const alwaysApplied = manager.getAlwaysAppliedMemories();
            const taskCompleteMemories = manager.getMemoriesForEvent("task-complete", task.memory_tags);

            // Merge without duplicates, keeping priority order
            const memoryMap = new Map<string, typeof alwaysApplied[0]>();
            for (const m of alwaysApplied) {
              memoryMap.set(m.id, m);
            }
            for (const m of taskCompleteMemories) {
              memoryMap.set(m.id, m);
            }

            const memories = Array.from(memoryMap.values())
              .sort((a, b) => b.priority - a.priority);

            context = {
              event: "task-complete",
              memories,
            };
          }
        }

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
          context: context ? {
            event: context.event,
            memories: context.memories.map(m => ({
              id: m.id,
              category: m.category,
              title: m.title,
              content: m.content,
              priority: m.priority,
            })),
            memoriesText: context.memories.length > 0
              ? context.memories.map(m => `## [${m.category.toUpperCase()}] ${m.title}\n${m.content}`).join("\n\n")
              : null,
            crossReferencedOutputs: context.event === "task-start"
              ? (context as { crossReferencedOutputs: CrossReferencedTaskOutput[] }).crossReferencedOutputs
              : undefined,
          } : undefined,
        };
      }, "update_task");

      if (result.success) {
        const d = result.data;
        return textResponse(formatTaskUpdate(d.task.id, d.task.title, d.task.previousStatus, d.task.newStatus));
      } else {
        return textErrorResponse(result.error.message);
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
          throw new PlanNotFoundError(args.planId);
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
            await manager.completeStaging(s.id);
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
          plan: {
            title: updatedPlan.title,
            status: updatedPlan.status,
          },
          stagings: stagingStatus,
        };
      }, "sync_plan");

      if (result.success) {
        const d = result.data;
        const stagingSummary = d.stagings.map((s: { name: string; status: string; completedTasks: number; totalTasks: number }) =>
          `   ${getStatusIcon(s.status)} ${s.name}: ${s.completedTasks}/${s.totalTasks}`
        ).join("\n");
        return textResponse(`${getStatusIcon(d.plan.status)} **${d.plan.title}** synced → ${d.plan.status}\n${stagingSummary}`);
      } else {
        return textErrorResponse(result.error.message);
      }
    }
  );
}
