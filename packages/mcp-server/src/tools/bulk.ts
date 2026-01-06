import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
} from "../errors/index.js";
import type { BulkUpdateResult, BulkDeleteResult } from "../state/types.js";

// ============ Human-Readable Formatters ============
function formatBulkUpdateResult<T>(operation: string, result: BulkUpdateResult<T>): string {
  const lines: string[] = [];

  if (result.failed === 0) {
    lines.push(`✅ **Bulk ${operation} Completed**`);
    lines.push(`   Successfully updated: ${result.success} items`);
  } else {
    lines.push(`⚠️ **Bulk ${operation} Partially Completed**`);
    lines.push(`   Success: ${result.success} | Failed: ${result.failed}`);
    lines.push("");
    lines.push("**Errors:**");
    for (const r of result.results) {
      if (!r.success && r.error) {
        lines.push(`   • ${r.id}: ${r.error}`);
      }
    }
  }

  return lines.join("\n");
}

function formatBulkDeleteResult(result: BulkDeleteResult): string {
  const lines: string[] = [];

  if (result.failed === 0) {
    lines.push(`🗑️ **Bulk Delete Completed**`);
    lines.push(`   Deleted: ${result.deleted} items`);
  } else {
    lines.push(`⚠️ **Bulk Delete Partially Completed**`);
    lines.push(`   Deleted: ${result.deleted} | Failed: ${result.failed}`);
    lines.push("");
    lines.push("**Errors:**");
    for (const e of result.errors) {
      lines.push(`   • ${e.id}: ${e.error}`);
    }
  }

  return lines.join("\n");
}

// Task update schema for bulk operations
const TaskBulkUpdateSchema = z.object({
  taskId: z.string().describe("Task ID to update"),
  status: z.enum(["pending", "in_progress", "done", "blocked", "cancelled"]).optional()
    .describe("New status"),
  priority: z.enum(["high", "medium", "low"]).optional().describe("New priority"),
  notes: z.string().optional().describe("Notes about the update"),
});

// Memory update schema for bulk operations
const MemoryBulkUpdateSchema = z.object({
  memoryId: z.string().describe("Memory ID to update"),
  enabled: z.boolean().optional().describe("Enable/disable the memory"),
  priority: z.number().int().min(0).max(100).optional().describe("New priority"),
  category: z.string().optional().describe("New category"),
  tags: z.array(z.string()).optional().describe("New tags"),
});

/**
 * Register bulk operation tools
 */
export function registerBulkTools(server: McpServer): void {
  // ============ bulk_update_tasks ============
  server.tool(
    "bulk_update_tasks",
    "Update multiple tasks at once. Useful for batch status changes or priority updates.",
    {
      updates: z.array(TaskBulkUpdateSchema).min(1).max(100)
        .describe("Array of task updates to apply"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const bulkResult = await manager.bulkUpdateTasks(
          args.updates.map(u => ({
            taskId: u.taskId,
            status: u.status,
            priority: u.priority,
            notes: u.notes,
          }))
        );

        return { success: true, result: bulkResult };
      }, "bulk_update_tasks");

      if (result.success) {
        const text = formatBulkUpdateResult("Task Update", result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ bulk_delete_tasks ============
  server.tool(
    "bulk_delete_tasks",
    "Delete multiple tasks at once. Cannot delete in_progress tasks.",
    {
      taskIds: z.array(z.string()).min(1).max(100)
        .describe("Array of task IDs to delete"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const bulkResult = await manager.bulkDeleteTasks(args.taskIds);

        return { success: true, result: bulkResult };
      }, "bulk_delete_tasks");

      if (result.success) {
        const text = formatBulkDeleteResult(result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ bulk_update_memories ============
  server.tool(
    "bulk_update_memories",
    "Update multiple memories at once. Useful for batch enable/disable or priority changes.",
    {
      updates: z.array(MemoryBulkUpdateSchema).min(1).max(100)
        .describe("Array of memory updates to apply"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const bulkResult = await manager.bulkUpdateMemories(
          args.updates.map(u => ({
            memoryId: u.memoryId,
            enabled: u.enabled,
            priority: u.priority,
            category: u.category,
            tags: u.tags,
          }))
        );

        return { success: true, result: bulkResult };
      }, "bulk_update_memories");

      if (result.success) {
        const text = formatBulkUpdateResult("Memory Update", result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ bulk_complete_tasks ============
  server.tool(
    "bulk_complete_tasks",
    "Mark multiple tasks as completed at once.",
    {
      taskIds: z.array(z.string()).min(1).max(100)
        .describe("Array of task IDs to mark as completed"),
      notes: z.string().optional().describe("Notes to add to all completed tasks"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const updates = args.taskIds.map(taskId => ({
          taskId,
          status: "done" as const,
          notes: args.notes,
        }));

        const bulkResult = await manager.bulkUpdateTasks(updates);

        return { success: true, result: bulkResult };
      }, "bulk_complete_tasks");

      if (result.success) {
        const r = result.data.result;
        const text = r.failed === 0
          ? `✅ **Completed ${r.success} Tasks**`
          : `⚠️ Completed ${r.success} tasks, ${r.failed} failed`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ bulk_cancel_tasks ============
  server.tool(
    "bulk_cancel_tasks",
    "Cancel multiple tasks at once.",
    {
      taskIds: z.array(z.string()).min(1).max(100)
        .describe("Array of task IDs to cancel"),
      notes: z.string().optional().describe("Reason for cancellation"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const updates = args.taskIds.map(taskId => ({
          taskId,
          status: "cancelled" as const,
          notes: args.notes,
        }));

        const bulkResult = await manager.bulkUpdateTasks(updates);

        return { success: true, result: bulkResult };
      }, "bulk_cancel_tasks");

      if (result.success) {
        const r = result.data.result;
        const text = r.failed === 0
          ? `🚫 **Cancelled ${r.success} Tasks**`
          : `⚠️ Cancelled ${r.success} tasks, ${r.failed} failed`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ bulk_enable_memories ============
  server.tool(
    "bulk_enable_memories",
    "Enable multiple memories at once.",
    {
      memoryIds: z.array(z.string()).min(1).max(100)
        .describe("Array of memory IDs to enable"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const updates = args.memoryIds.map(memoryId => ({
          memoryId,
          enabled: true,
        }));

        const bulkResult = await manager.bulkUpdateMemories(updates);

        return { success: true, result: bulkResult };
      }, "bulk_enable_memories");

      if (result.success) {
        const r = result.data.result;
        const text = r.failed === 0
          ? `✅ **Enabled ${r.success} Memories**`
          : `⚠️ Enabled ${r.success} memories, ${r.failed} failed`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ bulk_disable_memories ============
  server.tool(
    "bulk_disable_memories",
    "Disable multiple memories at once.",
    {
      memoryIds: z.array(z.string()).min(1).max(100)
        .describe("Array of memory IDs to disable"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const updates = args.memoryIds.map(memoryId => ({
          memoryId,
          enabled: false,
        }));

        const bulkResult = await manager.bulkUpdateMemories(updates);

        return { success: true, result: bulkResult };
      }, "bulk_disable_memories");

      if (result.success) {
        const r = result.data.result;
        const text = r.failed === 0
          ? `🔇 **Disabled ${r.success} Memories**`
          : `⚠️ Disabled ${r.success} memories, ${r.failed} failed`;
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
