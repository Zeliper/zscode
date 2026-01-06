import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerContextTools } from "./context.js";
import { registerPlanTools } from "./plan.js";
import { registerStagingTools } from "./staging.js";
import { registerStatusTool } from "./status.js";
import { registerArchiveTool } from "./archive.js";
import { registerCancelTool } from "./cancel.js";
import { registerModifyTools } from "./modify.js";
import { registerMemoryTools } from "./memory.js";
import { registerFileTools } from "./files.js";
import { registerSummaryTools } from "./summary.js";
import { registerTemplateTools } from "./template.js";
import { registerRollbackTools } from "./rollback.js";
import { registerSearchTools } from "./search.js";
import { registerBulkTools } from "./bulk.js";
import { registerNavigateTools } from "./navigate.js";

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

  // File tools: zscode:read, zscode:write (for context-optimized file operations)
  registerFileTools(server, projectRoot);

  // Summary tools: generate_summary, get_project_summary, delete_project_summary
  registerSummaryTools(server);

  // Template tools: create_template, get_template, list_templates, update_template, delete_template, apply_template
  registerTemplateTools(server);

  // Rollback tools: create_snapshot, list_snapshots, get_snapshot, restore_snapshot, delete_snapshot, cleanup_snapshots
  registerRollbackTools(server);

  // Search tools: search, search_tasks, search_plans, search_memories
  registerSearchTools(server);

  // Bulk tools: bulk_update_tasks, bulk_delete_tasks, bulk_update_memories, bulk_complete_tasks, bulk_cancel_tasks, bulk_enable_memories, bulk_disable_memories
  registerBulkTools(server);

  // Navigate tools: get_plans_paginated, get_tasks_paginated, get_templates_paginated, quick_tasks, quick_plans
  registerNavigateTools(server);
}
