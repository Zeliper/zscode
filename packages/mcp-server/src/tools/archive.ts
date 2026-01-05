import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
  PlanNotFoundError,
  PlanInvalidStateError,
} from "../errors/index.js";

/**
 * Register archive tool
 */
export function registerArchiveTool(server: McpServer): void {
  // ============ zscode:archive ============
  server.tool(
    "zscode:archive",
    "Archive a completed or cancelled plan. Moves the plan and all its artifacts to the archive directory. Only completed or cancelled plans can be archived.",
    {
      planId: z.string().describe("Plan ID to archive"),
      reason: z.string().optional().describe("Reason for archiving"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const plan = manager.getPlan(args.planId);
        if (!plan) {
          throw new PlanNotFoundError(args.planId);
        }

        // Validate plan status
        if (plan.status !== "completed" && plan.status !== "cancelled") {
          throw new PlanInvalidStateError(
            args.planId,
            plan.status,
            ["completed", "cancelled"]
          );
        }

        // Get stats before archiving
        const stagings = manager.getStagingsByPlan(args.planId);
        let totalTasks = 0;
        let completedTasks = 0;

        for (const staging of stagings) {
          const tasks = manager.getTasksByStaging(staging.id);
          totalTasks += tasks.length;
          completedTasks += tasks.filter(t => t.status === "done").length;
        }

        // Archive the plan
        const archivePath = await manager.archivePlan(args.planId, args.reason);

        return {
          success: true,
          message: `Plan "${plan.title}" archived successfully`,
          archive: {
            planId: plan.id,
            title: plan.title,
            archivePath,
            archivedAt: new Date().toISOString(),
            reason: args.reason,
          },
          stats: {
            stagings: stagings.length,
            totalTasks,
            completedTasks,
          },
        };
      }, "zscode:archive");

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
