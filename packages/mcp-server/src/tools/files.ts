import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { readFile, writeFile, stat } from "fs/promises";
import { join, extname } from "path";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
  PathTraversalError,
} from "../errors/index.js";
import { isPathSafe, normalizePath, ensureDir, getDirname } from "../utils/paths.js";

/**
 * Get MIME type from file extension
 */
function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    ".json": "application/json",
    ".md": "text/markdown",
    ".ts": "text/typescript",
    ".tsx": "text/typescript",
    ".js": "text/javascript",
    ".jsx": "text/javascript",
    ".txt": "text/plain",
    ".csv": "text/csv",
    ".html": "text/html",
    ".css": "text/css",
    ".xml": "application/xml",
    ".yaml": "text/yaml",
    ".yml": "text/yaml",
    ".py": "text/x-python",
    ".rs": "text/x-rust",
    ".go": "text/x-go",
    ".java": "text/x-java",
    ".c": "text/x-c",
    ".cpp": "text/x-c++",
    ".h": "text/x-c",
    ".hpp": "text/x-c++",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

/**
 * Register file operation tools for context optimization
 * These tools allow file operations through MCP, reducing main session context usage
 */
export function registerFileTools(server: McpServer, projectRoot: string): void {
  const normalizedRoot = normalizePath(projectRoot);

  // ============ zscode:read ============
  server.tool(
    "zscode:read",
    "Read a file within the project directory. Returns file content as text. Use this for context-optimized file reading.",
    {
      path: z.string().describe("Relative path from project root"),
      encoding: z.enum(["utf-8", "base64"]).default("utf-8")
        .describe("File encoding (utf-8 for text, base64 for binary)"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const fullPath = normalizePath(join(normalizedRoot, args.path));

        // Security: Path traversal check
        if (!isPathSafe(normalizedRoot, fullPath)) {
          throw new PathTraversalError(args.path);
        }

        // Read file
        const content = await readFile(fullPath, args.encoding === "base64" ? "base64" : "utf-8");
        const stats = await stat(fullPath);

        return {
          success: true,
          path: args.path,
          content: content.toString(),
          encoding: args.encoding,
          size: stats.size,
          mimeType: getMimeType(fullPath),
        };
      }, "zscode:read");

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

  // ============ zscode:write ============
  server.tool(
    "zscode:write",
    "Write content to a file within the project directory. Use this for context-optimized file writing.",
    {
      path: z.string().describe("Relative path from project root"),
      content: z.string().describe("File content to write"),
      encoding: z.enum(["utf-8", "base64"]).default("utf-8")
        .describe("Content encoding"),
      createDirs: z.boolean().default(true)
        .describe("Create parent directories if they don't exist"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const fullPath = normalizePath(join(normalizedRoot, args.path));

        // Security: Path traversal check
        if (!isPathSafe(normalizedRoot, fullPath)) {
          throw new PathTraversalError(args.path);
        }

        // Create parent directories if needed
        if (args.createDirs) {
          await ensureDir(getDirname(fullPath));
        }

        // Write file
        const encoding = args.encoding === "base64" ? "base64" : "utf-8";
        await writeFile(fullPath, args.content, encoding);

        const bytesWritten = Buffer.byteLength(args.content, encoding);

        return {
          success: true,
          path: args.path,
          bytesWritten,
          encoding: args.encoding,
          mimeType: getMimeType(fullPath),
        };
      }, "zscode:write");

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
