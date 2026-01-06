import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
} from "../errors/index.js";
import type {
  Plan,
  Task,
  Template,
  PaginatedResult,
  PlanStatus,
  TaskStatus,
  TemplateCategory,
} from "../state/types.js";

// ============ Human-Readable Formatters ============
function formatPlansList(result: PaginatedResult<Plan>): string {
  const lines: string[] = [];
  const { items, pagination } = result;

  lines.push(`📋 **Plans** (${pagination.page}/${pagination.totalPages}, total: ${pagination.totalItems})`);
  lines.push("");

  if (items.length === 0) {
    lines.push("No plans found.");
    return lines.join("\n");
  }

  for (const plan of items) {
    const statusIcon = getStatusIcon(plan.status);
    lines.push(`${statusIcon} **${plan.title}** (${plan.id})`);
    lines.push(`   Status: ${plan.status} | Stagings: ${plan.stagings.length}`);
    if (plan.description) {
      lines.push(`   ${plan.description.substring(0, 80)}${plan.description.length > 80 ? "..." : ""}`);
    }
    lines.push("");
  }

  if (pagination.hasNext) {
    lines.push(`📄 Next page: ${pagination.page + 1}`);
  }

  return lines.join("\n");
}

function formatTasksList(result: PaginatedResult<Task>): string {
  const lines: string[] = [];
  const { items, pagination } = result;

  lines.push(`✅ **Tasks** (${pagination.page}/${pagination.totalPages}, total: ${pagination.totalItems})`);
  lines.push("");

  if (items.length === 0) {
    lines.push("No tasks found.");
    return lines.join("\n");
  }

  for (const task of items) {
    const statusIcon = getTaskStatusIcon(task.status);
    const priorityBadge = getPriorityBadge(task.priority);
    lines.push(`${statusIcon} ${task.title} ${priorityBadge}`);
    lines.push(`   ID: ${task.id} | Staging: ${task.stagingId}`);
    if (task.model) lines.push(`   Model: ${task.model}`);
    lines.push("");
  }

  if (pagination.hasNext) {
    lines.push(`📄 Next page: ${pagination.page + 1}`);
  }

  return lines.join("\n");
}

function formatTemplatesList(result: PaginatedResult<Template>): string {
  const lines: string[] = [];
  const { items, pagination } = result;

  lines.push(`📄 **Templates** (${pagination.page}/${pagination.totalPages}, total: ${pagination.totalItems})`);
  lines.push("");

  if (items.length === 0) {
    lines.push("No templates found.");
    return lines.join("\n");
  }

  for (const tpl of items) {
    const builtIn = tpl.isBuiltIn ? " ⭐" : "";
    lines.push(`📄 **${tpl.name}**${builtIn} (${tpl.id})`);
    lines.push(`   Category: ${tpl.category} | Usage: ${tpl.usageCount} times`);
    if (tpl.description) {
      lines.push(`   ${tpl.description.substring(0, 80)}${tpl.description.length > 80 ? "..." : ""}`);
    }
    lines.push("");
  }

  if (pagination.hasNext) {
    lines.push(`📄 Next page: ${pagination.page + 1}`);
  }

  return lines.join("\n");
}

function getStatusIcon(status: string): string {
  switch (status) {
    case "draft": return "📝";
    case "active": return "🔄";
    case "completed": return "✅";
    case "archived": return "📦";
    case "cancelled": return "🚫";
    default: return "•";
  }
}

function getTaskStatusIcon(status: string): string {
  switch (status) {
    case "pending": return "⏳";
    case "in_progress": return "🔄";
    case "done": return "✅";
    case "blocked": return "🚧";
    case "cancelled": return "🚫";
    default: return "•";
  }
}

function getPriorityBadge(priority: string): string {
  switch (priority) {
    case "high": return "[HIGH]";
    case "low": return "[low]";
    default: return "";
  }
}

/**
 * Register navigation/pagination tools for quick browsing
 */
export function registerNavigateTools(server: McpServer): void {
  // ============ get_plans_paginated ============
  server.tool(
    "get_plans_paginated",
    "Get plans with pagination support. Fast way to browse through plans.",
    {
      status: z.enum(["draft", "active", "completed", "archived", "cancelled"]).optional()
        .describe("Filter by status"),
      page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
      pageSize: z.number().int().min(1).max(50).default(10).describe("Items per page"),
      sortBy: z.enum(["createdAt", "updatedAt", "title"]).default("updatedAt")
        .describe("Sort field"),
      sortDir: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const paginatedResult = manager.getPlansWithPagination({
          status: args.status as PlanStatus | undefined,
          page: args.page,
          pageSize: args.pageSize,
          sortBy: args.sortBy,
          sortOrder: args.sortDir,
        });

        return { success: true, result: paginatedResult };
      }, "get_plans_paginated");

      if (result.success) {
        const text = formatPlansList(result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ get_tasks_paginated ============
  server.tool(
    "get_tasks_paginated",
    "Get tasks with pagination support. Fast way to browse through tasks.",
    {
      status: z.enum(["pending", "in_progress", "done", "blocked", "cancelled"]).optional()
        .describe("Filter by status"),
      priority: z.enum(["high", "medium", "low"]).optional().describe("Filter by priority"),
      planId: z.string().optional().describe("Filter by plan ID"),
      stagingId: z.string().optional().describe("Filter by staging ID"),
      page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
      pageSize: z.number().int().min(1).max(50).default(10).describe("Items per page"),
      sortBy: z.enum(["createdAt", "updatedAt", "priority", "title"]).default("updatedAt")
        .describe("Sort field"),
      sortDir: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const paginatedResult = manager.getTasksWithPagination({
          status: args.status as TaskStatus | undefined,
          priority: args.priority,
          planId: args.planId,
          stagingId: args.stagingId,
          page: args.page,
          pageSize: args.pageSize,
          sortBy: args.sortBy,
          sortOrder: args.sortDir,
        });

        return { success: true, result: paginatedResult };
      }, "get_tasks_paginated");

      if (result.success) {
        const text = formatTasksList(result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ get_templates_paginated ============
  server.tool(
    "get_templates_paginated",
    "Get templates with pagination support. Fast way to browse through templates.",
    {
      category: z.enum(["feature", "bugfix", "refactoring", "review", "deployment", "testing", "custom"])
        .optional().describe("Filter by category"),
      page: z.number().int().min(1).default(1).describe("Page number (1-indexed)"),
      pageSize: z.number().int().min(1).max(50).default(10).describe("Items per page"),
      sortBy: z.enum(["createdAt", "updatedAt", "name", "usageCount"]).default("usageCount")
        .describe("Sort field"),
      sortDir: z.enum(["asc", "desc"]).default("desc").describe("Sort direction"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const paginatedResult = manager.getTemplatesWithPagination({
          category: args.category as TemplateCategory | undefined,
          page: args.page,
          pageSize: args.pageSize,
          sortBy: args.sortBy,
          sortOrder: args.sortDir,
        });

        return { success: true, result: paginatedResult };
      }, "get_templates_paginated");

      if (result.success) {
        const text = formatTemplatesList(result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ quick_tasks ============
  server.tool(
    "quick_tasks",
    "Quickly list tasks by common filters without pagination.",
    {
      filter: z.enum(["pending", "in_progress", "blocked", "high_priority", "recent"])
        .describe("Quick filter preset"),
      limit: z.number().int().min(1).max(50).default(10).describe("Maximum items to return"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        let options: {
          status?: TaskStatus;
          priority?: "high" | "medium" | "low";
          page: number;
          pageSize: number;
          sortBy: string;
          sortDir: "asc" | "desc";
        } = {
          page: 1,
          pageSize: args.limit,
          sortBy: "updatedAt",
          sortDir: "desc",
        };

        switch (args.filter) {
          case "pending":
            options.status = "pending";
            break;
          case "in_progress":
            options.status = "in_progress";
            break;
          case "blocked":
            options.status = "blocked";
            break;
          case "high_priority":
            options.priority = "high";
            break;
          case "recent":
            // Default sort by updatedAt desc
            break;
        }

        const paginatedResult = manager.getTasksWithPagination(options);

        return { success: true, result: paginatedResult, filter: args.filter };
      }, "quick_tasks");

      if (result.success) {
        const lines: string[] = [];
        lines.push(`⚡ **Quick Tasks: ${result.data.filter}**`);
        lines.push("");

        const items = result.data.result.items;
        if (items.length === 0) {
          lines.push("No tasks found.");
        } else {
          for (const task of items) {
            const statusIcon = getTaskStatusIcon(task.status);
            lines.push(`${statusIcon} ${task.title} (${task.id})`);
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ quick_plans ============
  server.tool(
    "quick_plans",
    "Quickly list plans by common filters without pagination.",
    {
      filter: z.enum(["active", "draft", "completed", "recent"])
        .describe("Quick filter preset"),
      limit: z.number().int().min(1).max(20).default(5).describe("Maximum items to return"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        let options: {
          status?: PlanStatus;
          page: number;
          pageSize: number;
          sortBy: string;
          sortDir: "asc" | "desc";
        } = {
          page: 1,
          pageSize: args.limit,
          sortBy: "updatedAt",
          sortDir: "desc",
        };

        switch (args.filter) {
          case "active":
            options.status = "active";
            break;
          case "draft":
            options.status = "draft";
            break;
          case "completed":
            options.status = "completed";
            break;
          case "recent":
            // Default sort by updatedAt desc
            break;
        }

        const paginatedResult = manager.getPlansWithPagination(options);

        return { success: true, result: paginatedResult, filter: args.filter };
      }, "quick_plans");

      if (result.success) {
        const lines: string[] = [];
        lines.push(`⚡ **Quick Plans: ${result.data.filter}**`);
        lines.push("");

        const items = result.data.result.items;
        if (items.length === 0) {
          lines.push("No plans found.");
        } else {
          for (const plan of items) {
            const statusIcon = getStatusIcon(plan.status);
            lines.push(`${statusIcon} ${plan.title} (${plan.id})`);
          }
        }

        return { content: [{ type: "text" as const, text: lines.join("\n") }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );
}
