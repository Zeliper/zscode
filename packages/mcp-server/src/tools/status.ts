import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
  PlanNotFoundError,
} from "../errors/index.js";
import type { PlanSummary, StatusOverview, StagingDetail, PlanDetail } from "../state/types.js";
import { createResponse, createErrorResponse, formatStatusOverview, formatPlanSummary, formatStagingDetail } from "../utils/format.js";

/**
 * Register status tool
 */
export function registerStatusTool(server: McpServer): void {
  // ============ zscode:status ============
  server.tool(
    "zscode:status",
    "Get the status of all plans or a specific plan. Shows progress, current staging, and task completion. Use without planId for overview, with planId for detailed view.",
    {
      planId: z.string().optional().describe("Plan ID for detailed status (omit for overview of all plans)"),
      readable: z.boolean().default(false).describe("If true, return human-readable markdown instead of JSON"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        if (args.planId) {
          // Detailed status for specific plan
          return getDetailedPlanStatus(manager, args.planId);
        } else {
          // Overview of all plans
          return getAllPlansStatus(manager);
        }
      }, "zscode:status");

      if (result.success) {
        // Human-readable format
        if (args.readable) {
          const text = formatStatusAsMarkdown(result.data);
          return { content: [{ type: "text" as const, text }] };
        }
        return createResponse(result.data);
      } else {
        return createErrorResponse(result.error);
      }
    }
  );
}

/**
 * Format status data as human-readable markdown
 */
function formatStatusAsMarkdown(data: { overview?: StatusOverview; plans?: PlanSummary[]; plan?: PlanDetail }): string {
  const lines: string[] = [];

  if (data.overview && data.plans) {
    // Overview mode
    lines.push(formatStatusOverview(data.overview));
    lines.push("");
    lines.push("## Plans");
    lines.push("");
    for (const plan of data.plans) {
      lines.push(formatPlanSummary(plan));
      lines.push("");
    }
  } else if (data.plan) {
    // Detailed plan mode
    lines.push(`# ${data.plan.title}`);
    lines.push(`Status: ${data.plan.status} | ID: ${data.plan.id}`);
    lines.push("");

    for (const staging of data.plan.stagings) {
      lines.push(formatStagingDetail(staging));
      lines.push("");
    }
  }

  return lines.join("\n");
}

/**
 * Get overview status of all plans
 */
function getAllPlansStatus(manager: StateManager): {
  success: boolean;
  overview: StatusOverview;
  plans: PlanSummary[];
  currentContext: { planId?: string; stagingId?: string };
} {
  const allPlans = manager.getAllPlans();

  const overview: StatusOverview = {
    totalPlans: allPlans.length,
    activePlans: allPlans.filter(p => p.status === "active").length,
    completedPlans: allPlans.filter(p => p.status === "completed").length,
    archivedPlans: allPlans.filter(p => p.status === "archived").length,
    cancelledPlans: allPlans.filter(p => p.status === "cancelled").length,
  };

  const planSummaries: PlanSummary[] = allPlans.map(plan => {
    const stagings = manager.getStagingsByPlan(plan.id);
    const completedStagings = stagings.filter(s => s.status === "completed").length;

    let totalTasks = 0;
    let completedTasks = 0;

    for (const staging of stagings) {
      const tasks = manager.getTasksByStaging(staging.id);
      totalTasks += tasks.length;
      completedTasks += tasks.filter(t => t.status === "done").length;
    }

    const percentage = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const currentStaging = plan.currentStagingId
      ? manager.getStaging(plan.currentStagingId)
      : undefined;

    return {
      id: plan.id,
      title: plan.title,
      status: plan.status,
      progress: {
        totalStagings: stagings.length,
        completedStagings,
        totalTasks,
        completedTasks,
        percentage,
      },
      currentStaging: currentStaging
        ? {
            id: currentStaging.id,
            name: currentStaging.name,
            status: currentStaging.status,
          }
        : undefined,
    };
  });

  const state = manager.getState();

  return {
    success: true,
    overview,
    plans: planSummaries,
    currentContext: {
      planId: state?.context.currentPlanId,
      stagingId: state?.context.currentStagingId,
    },
  };
}

/**
 * Get detailed status for a specific plan
 */
function getDetailedPlanStatus(manager: StateManager, planId: string): {
  success: boolean;
  plan: PlanDetail;
} {
  const plan = manager.getPlan(planId);
  if (!plan) {
    throw new PlanNotFoundError(planId);
  }

  const stagings = manager.getStagingsByPlan(planId);
  const state = manager.getState();
  const decisions = state?.context.decisions.filter(
    d => d.relatedPlanId === planId
  ) ?? [];

  const stagingDetails: StagingDetail[] = stagings.map(staging => {
    const tasks = manager.getTasksByStaging(staging.id);
    const completedTasks = tasks.filter(t => t.status === "done").length;

    return {
      id: staging.id,
      name: staging.name,
      order: staging.order,
      status: staging.status,
      execution_type: staging.execution_type,
      taskCount: tasks.length,
      completedTaskCount: completedTasks,
      tasks: tasks.map(task => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        execution_mode: task.execution_mode,
        depends_on: task.depends_on,
        hasOutput: !!task.output,
      })),
    };
  });

  const planDetail: PlanDetail = {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    status: plan.status,
    stagings: stagingDetails,
    decisions,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
  };

  return {
    success: true,
    plan: planDetail,
  };
}
