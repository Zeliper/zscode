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
 * Register cancel tool
 */
export function registerCancelTool(server: McpServer): void {
  // ============ zscode:cancel ============
  server.tool(
    "zscode:cancel",
    "Cancel an active or draft plan. All pending and in_progress tasks will be marked as cancelled. Optionally archive immediately after cancellation.",
    {
      planId: z.string().describe("Plan ID to cancel"),
      reason: z.string().optional().describe("Reason for cancellation"),
      archiveImmediately: z.boolean().default(false)
        .describe("If true, archive the plan immediately after cancelling"),
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
        if (plan.status === "archived" || plan.status === "cancelled") {
          throw new PlanInvalidStateError(
            args.planId,
            plan.status,
            ["draft", "active", "completed"]
          );
        }

        // Cancel the plan
        const { affectedStagings, affectedTasks } = await manager.cancelPlan(
          args.planId,
          args.reason
        );

        // Optionally archive
        let archivePath: string | undefined;
        if (args.archiveImmediately) {
          archivePath = await manager.archivePlan(args.planId, args.reason);
        }

        return {
          success: true,
          message: `Plan "${plan.title}" cancelled`,
          cancel: {
            planId: plan.id,
            title: plan.title,
            reason: args.reason,
            cancelledAt: new Date().toISOString(),
          },
          affected: {
            stagings: affectedStagings,
            tasks: affectedTasks,
          },
          archived: args.archiveImmediately,
          archivePath,
        };
      }, "zscode:cancel");

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
