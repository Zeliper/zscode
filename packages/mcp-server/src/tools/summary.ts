import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { withErrorHandling, ProjectNotInitializedError } from "../errors/index.js";

/**
 * Register summary-related tools
 * Summary generates a project overview that's auto-injected with general memories
 */
export function registerSummaryTools(server: McpServer): void {
  // ============ generate_summary ============
  server.tool(
    "generate_summary",
    "Generate or update the project summary. Creates a memory in 'project-summary' category that is automatically included with get_full_context and zscode:start. Run again to update with current project state.",
    {
      customContent: z.string().optional().describe(
        "Optional custom content to use instead of auto-generated summary. If not provided, summary is auto-generated from current project state."
      ),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const existingSummary = manager.getProjectSummary();
        const isUpdate = existingSummary !== undefined;

        const memory = await manager.saveProjectSummary(args.customContent);

        return {
          success: true,
          action: isUpdate ? "updated" : "created",
          message: isUpdate
            ? `Project summary updated. Memory ID: ${memory.id}`
            : `Project summary created. Memory ID: ${memory.id}`,
          memory: {
            id: memory.id,
            category: memory.category,
            title: memory.title,
            priority: memory.priority,
            contentPreview: memory.content.substring(0, 200) + (memory.content.length > 200 ? "..." : ""),
          },
          note: "This summary will be automatically included in get_full_context and zscode:start responses.",
        };
      }, "generate_summary");

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

  // ============ get_project_summary ============
  server.tool(
    "get_project_summary",
    "Get the current project summary content. Returns the auto-generated summary if no custom summary exists.",
    {},
    async () => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const existingSummary = manager.getProjectSummary();
        const generatedContent = manager.generateProjectSummaryContent();

        if (existingSummary) {
          return {
            success: true,
            exists: true,
            memory: {
              id: existingSummary.id,
              title: existingSummary.title,
              content: existingSummary.content,
              updatedAt: existingSummary.updatedAt,
            },
            generatedPreview: generatedContent.substring(0, 500) + (generatedContent.length > 500 ? "..." : ""),
            note: "Use generate_summary to update with latest project state.",
          };
        } else {
          return {
            success: true,
            exists: false,
            generatedContent,
            note: "No summary exists yet. Use generate_summary to create one.",
          };
        }
      }, "get_project_summary");

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

  // ============ delete_project_summary ============
  server.tool(
    "delete_project_summary",
    "Delete the project summary memory. The summary will no longer be auto-injected.",
    {},
    async () => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const existingSummary = manager.getProjectSummary();

        if (!existingSummary) {
          return {
            success: false,
            message: "No project summary exists to delete.",
          };
        }

        await manager.removeMemory(existingSummary.id);

        return {
          success: true,
          message: "Project summary deleted.",
          deletedMemoryId: existingSummary.id,
        };
      }, "delete_project_summary");

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
