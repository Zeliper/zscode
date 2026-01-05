import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerContextTools } from "./context.js";
import { registerPlanTools } from "./plan.js";
import { registerStagingTools } from "./staging.js";
import { registerStatusTool } from "./status.js";
import { registerArchiveTool } from "./archive.js";
import { registerCancelTool } from "./cancel.js";
import { registerModifyTools } from "./modify.js";
import { registerMemoryTools } from "./memory.js";

/**
 * Register all ZSCode MCP tools
 */
export function registerAllTools(server: McpServer, projectRoot: string): void {
  // Context tools: get_full_context, init_project
  registerContextTools(server, projectRoot);

  // Plan tools: create_plan, sync_plan, update_task
  registerPlanTools(server);

  // Staging tools: zscode:start, complete_staging, save_task_output, get_staging_artifacts
  registerStagingTools(server, projectRoot);

  // Status tool: zscode:status
  registerStatusTool(server);

  // Archive tool: zscode:archive
  registerArchiveTool(server);

  // Cancel tool: zscode:cancel
  registerCancelTool(server);

  // Modify tools: update_plan, update_staging, add_staging, remove_staging, add_task, remove_task, update_task_details
  registerModifyTools(server);

  // Memory tools: add_memory, list_memories, update_memory, remove_memory, get_memories_for_context, list_categories
  registerMemoryTools(server);
}
