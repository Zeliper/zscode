import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { withErrorHandling, ProjectNotInitializedError, MemoryNotFoundError, ValidationError } from "../errors/index.js";
import { DEFAULT_MEMORY_CATEGORIES } from "../state/schema.js";

/**
 * Register memory-related tools
 * Memory system provides rules/instructions that take precedence over CLAUDE.md
 */
export function registerMemoryTools(server: McpServer): void {
  // ============ add_memory ============
  server.tool(
    "add_memory",
    "Add a new memory/rule that takes precedence over CLAUDE.md. Use categories to organize: 'general' (always applied), 'planning', 'coding', 'review', or any custom category.",
    {
      category: z.string().min(1).describe(
        `Memory category. Default categories: ${DEFAULT_MEMORY_CATEGORIES.join(", ")}. 'general' is always applied.`
      ),
      title: z.string().min(1).describe("Memory/rule title"),
      content: z.string().min(1).describe("Memory/rule content - the actual instruction or rule"),
      tags: z.array(z.string()).optional().describe("Tags for additional categorization"),
      priority: z.number().int().min(0).max(100).optional().describe(
        "Priority (0-100, higher = applied first). Default: 50"
      ),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const memory = await manager.addMemory(
          args.category,
          args.title,
          args.content,
          args.tags,
          args.priority
        );

        return {
          success: true,
          message: `Memory "${args.title}" added to category "${args.category}"`,
          memory: {
            id: memory.id,
            category: memory.category,
            title: memory.title,
            priority: memory.priority,
            enabled: memory.enabled,
          },
        };
      }, "add_memory");

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

  // ============ list_memories ============
  server.tool(
    "list_memories",
    "List all memories/rules, optionally filtered by category or tags.",
    {
      category: z.string().optional().describe("Filter by category"),
      tags: z.array(z.string()).optional().describe("Filter by tags (OR logic)"),
      enabledOnly: z.boolean().optional().default(true).describe("Only show enabled memories"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const memories = manager.listMemories(
          args.category,
          args.tags,
          args.enabledOnly ?? true
        );

        return {
          success: true,
          count: memories.length,
          memories: memories.map(m => ({
            id: m.id,
            category: m.category,
            title: m.title,
            content: m.content,
            tags: m.tags,
            priority: m.priority,
            enabled: m.enabled,
          })),
        };
      }, "list_memories");

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

  // ============ update_memory ============
  server.tool(
    "update_memory",
    "Update an existing memory/rule.",
    {
      memoryId: z.string().describe("Memory ID to update"),
      title: z.string().optional().describe("New title"),
      content: z.string().optional().describe("New content"),
      category: z.string().optional().describe("New category"),
      tags: z.array(z.string()).optional().describe("New tags"),
      priority: z.number().int().min(0).max(100).optional().describe("New priority"),
      enabled: z.boolean().optional().describe("Enable/disable the memory"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const hasUpdates = args.title || args.content || args.category ||
                          args.tags || args.priority !== undefined ||
                          args.enabled !== undefined;
        if (!hasUpdates) {
          throw new ValidationError("At least one update field must be provided");
        }

        const memory = await manager.updateMemory(args.memoryId, {
          title: args.title,
          content: args.content,
          category: args.category,
          tags: args.tags,
          priority: args.priority,
          enabled: args.enabled,
        });

        return {
          success: true,
          message: `Memory "${memory.title}" updated`,
          memory: {
            id: memory.id,
            category: memory.category,
            title: memory.title,
            priority: memory.priority,
            enabled: memory.enabled,
          },
        };
      }, "update_memory");

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

  // ============ remove_memory ============
  server.tool(
    "remove_memory",
    "Remove a memory/rule.",
    {
      memoryId: z.string().describe("Memory ID to remove"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const memory = manager.getMemory(args.memoryId);
        if (!memory) {
          throw new MemoryNotFoundError(args.memoryId);
        }

        const title = memory.title;
        await manager.removeMemory(args.memoryId);

        return {
          success: true,
          message: `Memory "${title}" removed`,
          removed: {
            memoryId: args.memoryId,
            title,
          },
        };
      }, "remove_memory");

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

  // ============ get_memories_for_context ============
  server.tool(
    "get_memories_for_context",
    "Get memories relevant to a specific context. Returns 'general' + context-specific memories, sorted by priority. These memories should be applied before CLAUDE.md rules.",
    {
      context: z.enum(["planning", "coding", "review", "general", "all"]).describe(
        "The context to get memories for. 'planning', 'coding', 'review' include general memories too."
      ),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const memories = manager.getMemoriesForContext(args.context);

        // Format for easy application
        const formatted = memories.map(m => ({
          id: m.id,
          category: m.category,
          title: m.title,
          content: m.content,
          priority: m.priority,
        }));

        return {
          success: true,
          context: args.context,
          count: memories.length,
          memories: formatted,
          // Formatted text ready for Claude to apply
          appliedRules: memories.map(m =>
            `## [${m.category.toUpperCase()}] ${m.title}\n${m.content}`
          ).join("\n\n"),
        };
      }, "get_memories_for_context");

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

  // ============ list_categories ============
  server.tool(
    "list_categories",
    "List all memory categories currently in use, plus default categories.",
    {},
    async () => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const usedCategories = manager.getCategories();
        const allCategories = new Set([...DEFAULT_MEMORY_CATEGORIES, ...usedCategories]);

        return {
          success: true,
          defaultCategories: [...DEFAULT_MEMORY_CATEGORIES],
          usedCategories,
          allCategories: Array.from(allCategories).sort(),
        };
      }, "list_categories");

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
