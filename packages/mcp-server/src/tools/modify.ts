import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
  StagingNotFoundError,
  TaskNotFoundError,
  ValidationError,
} from "../errors/index.js";

// ============ Human-Readable Formatters ============
function formatPlanUpdate(plan: { id: string; title: string; description?: string; status: string }): string {
  const lines: string[] = [];
  lines.push(`✅ **Plan Updated**: ${plan.title}`);
  lines.push(`   ID: ${plan.id}`);
  lines.push(`   Status: ${plan.status}`);
  if (plan.description) {
    lines.push(`   Description: ${plan.description}`);
  }
  return lines.join("\n");
}

function formatStagingUpdate(staging: {
  id: string;
  name: string;
  description?: string;
  execution_type: string;
  status: string;
  default_model?: string;
  session_budget?: string;
  recommended_sessions?: number;
}): string {
  const lines: string[] = [];
  lines.push(`✅ **Staging Updated**: ${staging.name}`);
  lines.push(`   ID: ${staging.id}`);
  lines.push(`   Execution: ${staging.execution_type} | Status: ${staging.status}`);
  if (staging.default_model) lines.push(`   Model: ${staging.default_model}`);
  if (staging.session_budget) lines.push(`   Budget: ${staging.session_budget}`);
  return lines.join("\n");
}

function formatStagingAdd(staging: { id: string; name: string; order: number; execution_type: string }, planId: string, totalStagings: number): string {
  const lines: string[] = [];
  lines.push(`✅ **Staging Added**: ${staging.name}`);
  lines.push(`   ID: ${staging.id}`);
  lines.push(`   Position: ${staging.order + 1}/${totalStagings}`);
  lines.push(`   Execution: ${staging.execution_type}`);
  lines.push(`   Plan: ${planId}`);
  return lines.join("\n");
}

function formatStagingRemove(name: string, stagingId: string, tasksRemoved: number, planId: string, remainingStagings: number): string {
  const lines: string[] = [];
  lines.push(`🗑️ **Staging Removed**: ${name}`);
  lines.push(`   ID: ${stagingId}`);
  lines.push(`   Tasks removed: ${tasksRemoved}`);
  lines.push(`   Plan: ${planId} (${remainingStagings} stagings remaining)`);
  return lines.join("\n");
}

function formatTaskAdd(task: { id: string; title: string; priority: string; order?: number; model?: string }, stagingName: string, totalTasks: number): string {
  const lines: string[] = [];
  lines.push(`✅ **Task Added**: ${task.title}`);
  lines.push(`   ID: ${task.id}`);
  lines.push(`   Priority: ${task.priority} | Order: ${(task.order ?? 0) + 1}/${totalTasks}`);
  if (task.model) lines.push(`   Model: ${task.model}`);
  lines.push(`   Staging: ${stagingName}`);
  return lines.join("\n");
}

function formatTaskRemove(title: string, taskId: string, stagingId: string, remainingTasks: number): string {
  const lines: string[] = [];
  lines.push(`🗑️ **Task Removed**: ${title}`);
  lines.push(`   ID: ${taskId}`);
  lines.push(`   Staging: ${stagingId} (${remainingTasks} tasks remaining)`);
  return lines.join("\n");
}

function formatTaskUpdate(task: {
  id: string;
  title: string;
  priority: string;
  status: string;
  execution_mode: string;
  model?: string;
  depends_on: string[];
}): string {
  const lines: string[] = [];
  lines.push(`✅ **Task Updated**: ${task.title}`);
  lines.push(`   ID: ${task.id}`);
  lines.push(`   Priority: ${task.priority} | Status: ${task.status}`);
  lines.push(`   Execution: ${task.execution_mode}`);
  if (task.model) lines.push(`   Model: ${task.model}`);
  if (task.depends_on.length > 0) lines.push(`   Dependencies: ${task.depends_on.join(", ")}`);
  return lines.join("\n");
}

/**
 * Register modify-related tools
 */
export function registerModifyTools(server: McpServer): void {
  // ============ update_plan ============
  server.tool(
    "update_plan",
    "Update a plan's title or description. Cannot modify archived or cancelled plans.",
    {
      planId: z.string().describe("Plan ID to update"),
      title: z.string().optional().describe("New plan title"),
      description: z.string().optional().describe("New plan description"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        if (!args.title && !args.description) {
          throw new ValidationError("At least one of 'title' or 'description' must be provided");
        }

        const plan = await manager.updatePlan(args.planId, {
          title: args.title,
          description: args.description,
        });

        return {
          success: true,
          message: "Plan updated",
          plan: {
            id: plan.id,
            title: plan.title,
            description: plan.description,
            status: plan.status,
          },
        };
      }, "update_plan");

      if (result.success) {
        const text = formatPlanUpdate(result.data.plan);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ update_staging ============
  server.tool(
    "update_staging",
    "Update a staging's name, description, or execution type. Cannot modify completed or cancelled stagings.",
    {
      stagingId: z.string().describe("Staging ID to update"),
      name: z.string().optional().describe("New staging name"),
      description: z.string().optional().describe("New staging description"),
      execution_type: z.enum(["parallel", "sequential"]).optional().describe("New execution type"),
      default_model: z.enum(["opus", "sonnet", "haiku"]).optional()
        .describe("Default model for tasks in this staging"),
      session_budget: z.enum(["minimal", "standard", "extensive"]).optional()
        .describe("Session budget category"),
      recommended_sessions: z.number().min(0.5).max(10).optional()
        .describe("Recommended number of sessions"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        if (!args.name && !args.description && !args.execution_type &&
            !args.default_model && !args.session_budget && args.recommended_sessions === undefined) {
          throw new ValidationError("At least one update field must be provided");
        }

        const staging = await manager.updateStaging(args.stagingId, {
          name: args.name,
          description: args.description,
          execution_type: args.execution_type,
          default_model: args.default_model,
          session_budget: args.session_budget,
          recommended_sessions: args.recommended_sessions,
        });

        return {
          success: true,
          message: "Staging updated",
          staging: {
            id: staging.id,
            name: staging.name,
            description: staging.description,
            execution_type: staging.execution_type,
            default_model: staging.default_model,
            session_budget: staging.session_budget,
            recommended_sessions: staging.recommended_sessions,
            status: staging.status,
          },
        };
      }, "update_staging");

      if (result.success) {
        const text = formatStagingUpdate(result.data.staging);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ add_staging ============
  server.tool(
    "add_staging",
    "Add a new staging phase to an existing plan. Can specify insertion position.",
    {
      planId: z.string().describe("Plan ID to add staging to"),
      name: z.string().describe("Staging name"),
      description: z.string().optional().describe("Staging description"),
      execution_type: z.enum(["parallel", "sequential"]).default("parallel").describe("How tasks execute"),
      default_model: z.enum(["opus", "sonnet", "haiku"]).optional()
        .describe("Default model for tasks in this staging"),
      session_budget: z.enum(["minimal", "standard", "extensive"]).optional()
        .describe("Session budget category"),
      recommended_sessions: z.number().min(0.5).max(10).optional()
        .describe("Recommended number of sessions"),
      insertAt: z.number().int().min(0).optional().describe("Position to insert (0-indexed). If not provided, adds at end."),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const staging = await manager.addStaging(args.planId, {
          name: args.name,
          description: args.description,
          execution_type: args.execution_type,
          default_model: args.default_model,
          session_budget: args.session_budget,
          recommended_sessions: args.recommended_sessions,
          insertAt: args.insertAt,
        });

        const plan = manager.getPlan(args.planId);

        return {
          success: true,
          message: `Staging "${args.name}" added at position ${staging.order}`,
          staging: {
            id: staging.id,
            name: staging.name,
            order: staging.order,
            execution_type: staging.execution_type,
            default_model: staging.default_model,
            session_budget: staging.session_budget,
            recommended_sessions: staging.recommended_sessions,
          },
          plan: {
            id: plan!.id,
            totalStagings: plan!.stagings.length,
          },
        };
      }, "add_staging");

      if (result.success) {
        const text = formatStagingAdd(result.data.staging, result.data.plan.id, result.data.plan.totalStagings);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ remove_staging ============
  server.tool(
    "remove_staging",
    "Remove a staging and all its tasks from a plan. Cannot remove in_progress staging.",
    {
      stagingId: z.string().describe("Staging ID to remove"),
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

        const stagingName = staging.name;
        const taskCount = staging.tasks.length;
        const planId = staging.planId;

        await manager.removeStaging(args.stagingId);

        const plan = manager.getPlan(planId);

        return {
          success: true,
          message: `Staging "${stagingName}" removed with ${taskCount} tasks`,
          removed: {
            stagingId: args.stagingId,
            name: stagingName,
            tasksRemoved: taskCount,
          },
          plan: {
            id: planId,
            remainingStagings: plan?.stagings.length ?? 0,
          },
        };
      }, "remove_staging");

      if (result.success) {
        const { removed, plan } = result.data;
        const text = formatStagingRemove(removed.name, removed.stagingId, removed.tasksRemoved, plan.id, plan.remainingStagings);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ add_task ============
  server.tool(
    "add_task",
    "Add a new task to an existing staging. Cannot add to completed or cancelled staging.",
    {
      stagingId: z.string().describe("Staging ID to add task to"),
      title: z.string().describe("Task title"),
      description: z.string().optional().describe("Task description"),
      priority: z.enum(["high", "medium", "low"]).default("medium").describe("Task priority"),
      execution_mode: z.enum(["parallel", "sequential"]).default("parallel").describe("Execution mode"),
      model: z.enum(["opus", "sonnet", "haiku"]).optional()
        .describe("Model to use for this task (overrides staging default_model)"),
      depends_on: z.array(z.string()).default([]).describe("Task IDs this task depends on"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const task = await manager.addTask(args.stagingId, {
          title: args.title,
          description: args.description,
          priority: args.priority,
          execution_mode: args.execution_mode,
          model: args.model,
          depends_on: args.depends_on,
        });

        const staging = manager.getStaging(args.stagingId);

        return {
          success: true,
          message: `Task "${args.title}" added`,
          task: {
            id: task.id,
            title: task.title,
            priority: task.priority,
            model: task.model,
            order: task.order,
          },
          staging: {
            id: staging!.id,
            name: staging!.name,
            totalTasks: staging!.tasks.length,
          },
        };
      }, "add_task");

      if (result.success) {
        const text = formatTaskAdd(result.data.task, result.data.staging.name, result.data.staging.totalTasks);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ remove_task ============
  server.tool(
    "remove_task",
    "Remove a task from a staging. Cannot remove in_progress task. Dependencies are automatically cleaned up.",
    {
      taskId: z.string().describe("Task ID to remove"),
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

        const taskTitle = task.title;
        const stagingId = task.stagingId;

        await manager.removeTask(args.taskId);

        const staging = manager.getStaging(stagingId);

        return {
          success: true,
          message: `Task "${taskTitle}" removed`,
          removed: {
            taskId: args.taskId,
            title: taskTitle,
          },
          staging: {
            id: stagingId,
            remainingTasks: staging?.tasks.length ?? 0,
          },
        };
      }, "remove_task");

      if (result.success) {
        const { removed, staging } = result.data;
        const text = formatTaskRemove(removed.title, removed.taskId, staging.id, staging.remainingTasks);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ update_task_details ============
  server.tool(
    "update_task_details",
    "Update a task's details (title, description, priority, execution_mode, model, depends_on). Cannot modify done or cancelled tasks. Use update_task for status changes.",
    {
      taskId: z.string().describe("Task ID to update"),
      title: z.string().optional().describe("New task title"),
      description: z.string().optional().describe("New task description"),
      priority: z.enum(["high", "medium", "low"]).optional().describe("New priority"),
      execution_mode: z.enum(["parallel", "sequential"]).optional().describe("New execution mode"),
      model: z.enum(["opus", "sonnet", "haiku"]).optional()
        .describe("Model to use for this task"),
      depends_on: z.array(z.string()).optional().describe("New task dependencies (task IDs within the same staging). Pass empty array to remove all dependencies."),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        if (!args.title && !args.description && !args.priority && !args.execution_mode && !args.model && args.depends_on === undefined) {
          throw new ValidationError("At least one update field must be provided");
        }

        const task = await manager.updateTaskDetails(args.taskId, {
          title: args.title,
          description: args.description,
          priority: args.priority,
          execution_mode: args.execution_mode,
          model: args.model,
          depends_on: args.depends_on,
        });

        return {
          success: true,
          message: "Task updated",
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            priority: task.priority,
            execution_mode: task.execution_mode,
            model: task.model,
            depends_on: task.depends_on,
            status: task.status,
          },
        };
      }, "update_task_details");

      if (result.success) {
        const text = formatTaskUpdate(result.data.task);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );
}
