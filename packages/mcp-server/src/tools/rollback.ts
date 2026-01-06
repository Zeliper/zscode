import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
  ValidationError,
} from "../errors/index.js";
import type { Snapshot, SnapshotType, SnapshotTrigger } from "../state/types.js";

// ============ Human-Readable Formatters ============
function formatSnapshot(snapshot: Snapshot): string {
  const lines: string[] = [];
  lines.push(`📸 **${snapshot.name}** (${snapshot.id})`);
  lines.push(`   Type: ${snapshot.type} | Trigger: ${snapshot.trigger}`);
  if (snapshot.description) lines.push(`   ${snapshot.description}`);

  const dataInfo: string[] = [];
  if (snapshot.data.plans) dataInfo.push(`${snapshot.data.plans.length} plans`);
  if (snapshot.data.stagings) dataInfo.push(`${snapshot.data.stagings.length} stagings`);
  if (snapshot.data.tasks) dataInfo.push(`${snapshot.data.tasks.length} tasks`);
  if (snapshot.data.memories) dataInfo.push(`${snapshot.data.memories.length} memories`);
  if (snapshot.data.templates) dataInfo.push(`${snapshot.data.templates.length} templates`);

  lines.push(`   Contains: ${dataInfo.join(", ") || "empty"}`);
  lines.push(`   Created: ${new Date(snapshot.createdAt).toLocaleString()}`);
  if (snapshot.expiresAt) {
    lines.push(`   Expires: ${new Date(snapshot.expiresAt).toLocaleString()}`);
  }
  return lines.join("\n");
}

function formatSnapshotList(snapshots: Snapshot[]): string {
  if (snapshots.length === 0) {
    return "No snapshots found.";
  }

  const lines: string[] = [];
  lines.push(`📸 **Snapshots** (${snapshots.length})`);
  lines.push("");

  // Group by type
  const byType = new Map<string, Snapshot[]>();
  for (const s of snapshots) {
    const list = byType.get(s.type) || [];
    list.push(s);
    byType.set(s.type, list);
  }

  for (const [type, snaps] of byType) {
    lines.push(`**${type.charAt(0).toUpperCase() + type.slice(1)}:**`);
    for (const s of snaps) {
      const expired = s.expiresAt && new Date(s.expiresAt) < new Date() ? " ⚠️ expired" : "";
      lines.push(`   • ${s.name}${expired} (${s.id})`);
      lines.push(`     ${new Date(s.createdAt).toLocaleString()} | ${s.trigger}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatRestoreResult(
  snapshotId: string,
  restoredItems: Record<string, number>,
  backupSnapshotId?: string
): string {
  const lines: string[] = [];
  lines.push(`✅ **Snapshot Restored Successfully**`);
  lines.push(`   Snapshot: ${snapshotId}`);
  lines.push("");
  lines.push("**Restored:**");
  for (const [key, count] of Object.entries(restoredItems)) {
    if (count > 0) {
      lines.push(`   • ${key}: ${count}`);
    }
  }
  if (backupSnapshotId) {
    lines.push("");
    lines.push(`⚠️ Backup created: ${backupSnapshotId}`);
  }
  return lines.join("\n");
}

/**
 * Register rollback/snapshot-related tools
 */
export function registerRollbackTools(server: McpServer): void {
  // ============ create_snapshot ============
  server.tool(
    "create_snapshot",
    "Create a snapshot of current state for backup/rollback purposes.",
    {
      name: z.string().min(1).describe("Snapshot name"),
      description: z.string().optional().describe("Description of why this snapshot was created"),
      type: z.enum(["full", "plan", "staging"]).default("full").describe("Snapshot type: full (all state), plan (single plan), or staging"),
      trigger: z.enum(["manual", "auto", "pre_operation"]).default("manual").describe("What triggered this snapshot"),
      planId: z.string().optional().describe("Plan ID (required for plan/staging type)"),
      stagingId: z.string().optional().describe("Staging ID (required for staging type)"),
      expiresInDays: z.number().int().min(1).max(365).optional().describe("Expiration in days (optional, default: no expiration)"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        // Validate type-specific requirements
        if ((args.type === "plan" || args.type === "staging") && !args.planId) {
          throw new ValidationError(`planId is required for ${args.type} snapshot type`);
        }
        if (args.type === "staging" && !args.stagingId) {
          throw new ValidationError("stagingId is required for staging snapshot type");
        }

        // Calculate expiration date if provided
        let expiresAt: string | undefined;
        if (args.expiresInDays) {
          const expDate = new Date();
          expDate.setDate(expDate.getDate() + args.expiresInDays);
          expiresAt = expDate.toISOString();
        }

        const snapshot = await manager.createSnapshot({
          name: args.name,
          description: args.description,
          type: args.type as SnapshotType,
          trigger: args.trigger as SnapshotTrigger,
          planId: args.planId,
          stagingId: args.stagingId,
          expiresAt,
        });

        return { success: true, snapshot };
      }, "create_snapshot");

      if (result.success) {
        const text = `✅ **Snapshot Created**\n${formatSnapshot(result.data.snapshot)}`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ list_snapshots ============
  server.tool(
    "list_snapshots",
    "List all snapshots, optionally filtered by type or plan.",
    {
      type: z.enum(["full", "plan", "staging"]).optional().describe("Filter by snapshot type"),
      planId: z.string().optional().describe("Filter by plan ID"),
      includeExpired: z.boolean().default(false).describe("Include expired snapshots"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        let snapshots = manager.listSnapshots({
          type: args.type as SnapshotType | undefined,
          planId: args.planId,
        });

        // Filter expired snapshots if not included
        if (!args.includeExpired) {
          const now = new Date();
          snapshots = snapshots.filter(s => !s.expiresAt || new Date(s.expiresAt) >= now);
        }

        return { success: true, snapshots, count: snapshots.length };
      }, "list_snapshots");

      if (result.success) {
        const text = formatSnapshotList(result.data.snapshots);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ get_snapshot ============
  server.tool(
    "get_snapshot",
    "Get detailed information about a specific snapshot.",
    {
      snapshotId: z.string().describe("Snapshot ID to retrieve"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const snapshot = manager.getSnapshot(args.snapshotId);
        if (!snapshot) {
          throw new ValidationError(`Snapshot not found: ${args.snapshotId}`);
        }

        return { success: true, snapshot };
      }, "get_snapshot");

      if (result.success) {
        const text = formatSnapshot(result.data.snapshot);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ restore_snapshot ============
  server.tool(
    "restore_snapshot",
    "Restore state from a snapshot. Creates a backup before restoring by default.",
    {
      snapshotId: z.string().describe("Snapshot ID to restore from"),
      createBackup: z.boolean().default(true).describe("Create a backup snapshot before restoring"),
      restorePlans: z.boolean().default(true).describe("Restore plans"),
      restoreStagings: z.boolean().default(true).describe("Restore stagings"),
      restoreTasks: z.boolean().default(true).describe("Restore tasks"),
      restoreMemories: z.boolean().default(false).describe("Restore memories"),
      restoreTemplates: z.boolean().default(false).describe("Restore templates"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const restoreResult = await manager.restoreSnapshot(args.snapshotId, {
          createBackup: args.createBackup,
          restorePlans: args.restorePlans,
          restoreStagings: args.restoreStagings,
          restoreTasks: args.restoreTasks,
          restoreMemories: args.restoreMemories,
          restoreTemplates: args.restoreTemplates,
        });

        return {
          success: true,
          snapshotId: args.snapshotId,
          ...restoreResult,
        };
      }, "restore_snapshot");

      if (result.success) {
        const text = formatRestoreResult(
          result.data.snapshotId,
          result.data.restoredItems,
          result.data.backupSnapshotId
        );
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ delete_snapshot ============
  server.tool(
    "delete_snapshot",
    "Delete a snapshot permanently.",
    {
      snapshotId: z.string().describe("Snapshot ID to delete"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const snapshot = manager.getSnapshot(args.snapshotId);
        if (!snapshot) {
          throw new ValidationError(`Snapshot not found: ${args.snapshotId}`);
        }

        const snapshotName = snapshot.name;
        await manager.deleteSnapshot(args.snapshotId);

        return { success: true, snapshotName, snapshotId: args.snapshotId };
      }, "delete_snapshot");

      if (result.success) {
        const text = `🗑️ **Snapshot Deleted**: ${result.data.snapshotName}\n   ID: ${result.data.snapshotId}`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ cleanup_snapshots ============
  server.tool(
    "cleanup_snapshots",
    "Clean up expired snapshots. Returns count of deleted snapshots.",
    {},
    async () => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const deletedCount = await manager.cleanupExpiredSnapshots();

        return { success: true, deletedCount };
      }, "cleanup_snapshots");

      if (result.success) {
        const count = result.data.deletedCount;
        const text = count > 0
          ? `🧹 **Cleaned Up ${count} Expired Snapshot(s)**`
          : "No expired snapshots to clean up.";
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
