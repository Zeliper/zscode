import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
} from "../errors/index.js";
import type { SearchEntityType } from "../state/types.js";

// ============ Human-Readable Formatters ============
function formatSearchResults(result: {
  query: { offset: number; limit: number };
  results: Array<{
    entityType: string;
    entityId: string;
    score: number;
    matches: Array<{ field: string; snippet: string }>;
    data: Record<string, unknown>;
  }>;
  total: number;
  executionTimeMs: number;
}): string {
  const lines: string[] = [];
  lines.push(`🔍 **Search Results**`);
  lines.push(`   Found: ${result.total} items (showing ${result.results.length})`);
  lines.push(`   Time: ${result.executionTimeMs}ms`);
  lines.push("");

  if (result.results.length === 0) {
    lines.push("No matching items found.");
    return lines.join("\n");
  }

  // Group by entity type
  const byType = new Map<string, typeof result.results>();
  for (const item of result.results) {
    const list = byType.get(item.entityType) || [];
    list.push(item);
    byType.set(item.entityType, list);
  }

  for (const [type, items] of byType) {
    lines.push(`**${type.charAt(0).toUpperCase() + type.slice(1)}s:** (${items.length})`);
    for (const item of items) {
      const icon = getEntityIcon(item.entityType);
      const score = item.score ? ` [${(item.score * 100).toFixed(0)}%]` : "";
      const title = (item.data.title || item.data.name || item.entityId) as string;
      lines.push(`   ${icon} ${title}${score} (${item.entityId})`);

      // Show matched snippet if available
      if (item.matches && item.matches.length > 0) {
        const firstMatch = item.matches[0];
        if (firstMatch) {
          lines.push(`      └─ ${firstMatch.field}: "...${firstMatch.snippet}..."`);
        }
      }
    }
    lines.push("");
  }

  // Pagination info
  const queryOffset = result.query.offset;
  if (queryOffset + result.results.length < result.total) {
    lines.push(`📄 More results available (offset: ${queryOffset + result.results.length})`);
  }

  return lines.join("\n");
}

function getEntityIcon(type: string): string {
  switch (type) {
    case "plan": return "📋";
    case "staging": return "📦";
    case "task": return "✅";
    case "memory": return "🧠";
    case "template": return "📄";
    case "decision": return "⚖️";
    default: return "•";
  }
}

// Search filter schema for input
const SearchFilterInputSchema = z.object({
  field: z.string().describe("Field name to filter on"),
  operator: z.enum(["eq", "neq", "contains", "startsWith", "endsWith", "gt", "gte", "lt", "lte", "in", "notIn", "exists", "regex"])
    .describe("Comparison operator"),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .describe("Value to compare against"),
});

// Search sort schema for input
const SearchSortInputSchema = z.object({
  field: z.string().describe("Field to sort by"),
  order: z.enum(["asc", "desc"]).default("asc").describe("Sort order"),
});

/**
 * Register search-related tools
 */
export function registerSearchTools(server: McpServer): void {
  // ============ search ============
  server.tool(
    "search",
    "Search across plans, tasks, stagings, memories, templates, and decisions. Supports full-text search, filters, and sorting.",
    {
      query: z.string().optional().describe("Text to search for (searches title, description, content)"),
      entityTypes: z.array(z.enum(["plan", "staging", "task", "memory", "template", "decision"]))
        .optional().describe("Entity types to search (default: all)"),
      filters: z.array(SearchFilterInputSchema).optional().describe("Additional filters to apply"),
      sort: z.array(SearchSortInputSchema).optional().describe("Sort order (array of sort specs)"),
      limit: z.number().int().min(1).max(100).default(20).describe("Maximum results to return"),
      offset: z.number().int().min(0).default(0).describe("Offset for pagination"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const searchResult = manager.search({
          query: args.query,
          entityTypes: args.entityTypes as SearchEntityType[] | undefined,
          filters: args.filters?.map(f => ({
            field: f.field,
            operator: f.operator as "eq" | "neq" | "contains" | "startsWith" | "endsWith" | "gt" | "gte" | "lt" | "lte" | "in" | "notIn" | "exists" | "regex",
            value: f.value,
          })) ?? [],
          sort: args.sort?.map(s => ({
            field: s.field,
            order: s.order,
          })) ?? [],
          limit: args.limit,
          offset: args.offset,
          includeArchived: false,
        });

        return { success: true, result: searchResult };
      }, "search");

      if (result.success) {
        const text = formatSearchResults(result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ search_tasks ============
  server.tool(
    "search_tasks",
    "Quick search specifically for tasks with common filters.",
    {
      query: z.string().optional().describe("Text to search in task title/description"),
      status: z.enum(["pending", "in_progress", "done", "blocked", "cancelled"]).optional()
        .describe("Filter by status"),
      priority: z.enum(["high", "medium", "low"]).optional().describe("Filter by priority"),
      planId: z.string().optional().describe("Filter by plan ID"),
      stagingId: z.string().optional().describe("Filter by staging ID"),
      limit: z.number().int().min(1).max(100).default(20).describe("Maximum results"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        type FilterOperator = "eq" | "neq" | "contains" | "startsWith" | "endsWith" | "gt" | "gte" | "lt" | "lte" | "in" | "notIn" | "exists" | "regex";
        const filters: Array<{ field: string; operator: FilterOperator; value: string | number | boolean | string[] }> = [];

        if (args.status) {
          filters.push({ field: "status", operator: "eq" as const, value: args.status });
        }
        if (args.priority) {
          filters.push({ field: "priority", operator: "eq" as const, value: args.priority });
        }
        if (args.planId) {
          filters.push({ field: "planId", operator: "eq" as const, value: args.planId });
        }
        if (args.stagingId) {
          filters.push({ field: "stagingId", operator: "eq" as const, value: args.stagingId });
        }

        const searchResult = manager.search({
          query: args.query,
          entityTypes: ["task"],
          filters,
          sort: [],
          limit: args.limit,
          offset: 0,
          includeArchived: false,
        });

        return { success: true, result: searchResult };
      }, "search_tasks");

      if (result.success) {
        const text = formatSearchResults(result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ search_plans ============
  server.tool(
    "search_plans",
    "Quick search specifically for plans with common filters.",
    {
      query: z.string().optional().describe("Text to search in plan title/description"),
      status: z.enum(["draft", "active", "completed", "archived", "cancelled"]).optional()
        .describe("Filter by status"),
      limit: z.number().int().min(1).max(100).default(20).describe("Maximum results"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        type FilterOperator = "eq" | "neq" | "contains" | "startsWith" | "endsWith" | "gt" | "gte" | "lt" | "lte" | "in" | "notIn" | "exists" | "regex";
        const filters: Array<{ field: string; operator: FilterOperator; value: string | number | boolean | string[] }> = [];

        if (args.status) {
          filters.push({ field: "status", operator: "eq" as const, value: args.status });
        }

        const searchResult = manager.search({
          query: args.query,
          entityTypes: ["plan"],
          filters,
          sort: [],
          limit: args.limit,
          offset: 0,
          includeArchived: false,
        });

        return { success: true, result: searchResult };
      }, "search_plans");

      if (result.success) {
        const text = formatSearchResults(result.data.result);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ search_memories ============
  server.tool(
    "search_memories",
    "Quick search specifically for memories with common filters.",
    {
      query: z.string().optional().describe("Text to search in memory title/content"),
      category: z.string().optional().describe("Filter by category"),
      tags: z.array(z.string()).optional().describe("Filter by tags (OR logic)"),
      enabledOnly: z.boolean().default(true).describe("Only return enabled memories"),
      limit: z.number().int().min(1).max(100).default(20).describe("Maximum results"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        type FilterOperator = "eq" | "neq" | "contains" | "startsWith" | "endsWith" | "gt" | "gte" | "lt" | "lte" | "in" | "notIn" | "exists" | "regex";
        const filters: Array<{ field: string; operator: FilterOperator; value: string | number | boolean | string[] }> = [];

        if (args.category) {
          filters.push({ field: "category", operator: "eq" as const, value: args.category });
        }
        if (args.tags && args.tags.length > 0) {
          filters.push({ field: "tags", operator: "in" as const, value: args.tags });
        }
        if (args.enabledOnly) {
          filters.push({ field: "enabled", operator: "eq" as const, value: true });
        }

        const searchResult = manager.search({
          query: args.query,
          entityTypes: ["memory"],
          filters,
          sort: [],
          limit: args.limit,
          offset: 0,
          includeArchived: false,
        });

        return { success: true, result: searchResult };
      }, "search_memories");

      if (result.success) {
        const text = formatSearchResults(result.data.result);
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
