#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StateManager } from "./state/manager.js";
import { registerAllTools } from "./tools/index.js";
import { normalizePath } from "./utils/paths.js";

const SERVER_NAME = "zscode";
const SERVER_VERSION = "1.0.0";

async function main(): Promise<void> {
  // Get project root from environment variable or current working directory
  const projectRoot = process.env.ZSCODE_PROJECT_ROOT || process.cwd();
  const normalizedRoot = normalizePath(projectRoot);

  // Log to stderr (stdout is reserved for MCP protocol)
  console.error(`[${SERVER_NAME}] Starting MCP server v${SERVER_VERSION}`);
  console.error(`[${SERVER_NAME}] Project root: ${normalizedRoot}`);

  // Initialize state manager
  try {
    await StateManager.initialize(normalizedRoot);
    console.error(`[${SERVER_NAME}] State manager initialized`);
  } catch (error) {
    console.error(`[${SERVER_NAME}] Warning: Could not load state.json (project may not be initialized)`);
  }

  // Create MCP server
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Register all tools
  registerAllTools(server, normalizedRoot);
  console.error(`[${SERVER_NAME}] Tools registered`);

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`[${SERVER_NAME}] Server connected and ready`);

  // Handle shutdown
  process.on("SIGINT", () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    console.error(`[${SERVER_NAME}] Shutting down...`);
    process.exit(0);
  });
}

main().catch((error) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, error);
  process.exit(1);
});
