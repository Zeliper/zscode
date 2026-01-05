import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { withErrorHandling } from "../errors/index.js";
import { createResponse, createErrorResponse } from "../utils/format.js";

/**
 * Register context-related tools
 */
export function registerContextTools(server: McpServer, projectRoot: string): void {
  // ============ get_full_context ============
  server.tool(
    "get_full_context",
    "Get the full project context including all plans, stagings, tasks, and history. Use this to understand the current state of the project.",
    {
      lightweight: z.boolean().default(false)
        .describe("If true, return only IDs and status for plans/stagings/tasks (reduces context by ~70%)"),
      includeOutputs: z.boolean().default(false)
        .describe("If true, include task outputs (can be large). Default false for reduced context."),
      includeHistory: z.boolean().default(false)
        .describe("If true, include recent history entries. Default false."),
      includeDecisions: z.boolean().default(false)
        .describe("If true, include decisions. Default false."),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();
        const state = manager.getState();

        if (!state) {
          return {
            initialized: false,
            message: "Project not initialized. Run 'npx zscode init' to initialize.",
            projectRoot,
          };
        }

        // Calculate overview stats
        const plans = Object.values(state.plans);
        const overview = {
          totalPlans: plans.length,
          activePlans: plans.filter(p => p.status === "active").length,
          completedPlans: plans.filter(p => p.status === "completed").length,
          archivedPlans: plans.filter(p => p.status === "archived").length,
          cancelledPlans: plans.filter(p => p.status === "cancelled").length,
        };

        // Get always-applied memories (general + project-summary)
        const alwaysAppliedMemories = manager.getAlwaysAppliedMemories();
        const appliedMemories = alwaysAppliedMemories.map(m => ({
          id: m.id,
          category: m.category,
          title: m.title,
          content: m.content,
          priority: m.priority,
        }));

        // Lightweight mode: return only essential info
        if (args.lightweight) {
          const plansSummary = Object.fromEntries(
            Object.entries(state.plans).map(([id, p]) => [id, {
              id: p.id,
              title: p.title,
              status: p.status,
              stagingIds: p.stagings,
            }])
          );

          const stagingsSummary = Object.fromEntries(
            Object.entries(state.stagings).map(([id, s]) => [id, {
              id: s.id,
              name: s.name,
              status: s.status,
              planId: s.planId,
              order: s.order,
              taskCount: s.tasks.length,
            }])
          );

          const tasksSummary = Object.fromEntries(
            Object.entries(state.tasks).map(([id, t]) => [id, {
              id: t.id,
              title: t.title,
              status: t.status,
              stagingId: t.stagingId,
              priority: t.priority,
              hasOutput: !!t.output,
            }])
          );

          return {
            initialized: true,
            version: state.version,
            project: { name: state.project.name },
            overview,
            currentPlanId: state.context.currentPlanId,
            currentStagingId: state.context.currentStagingId,
            plans: plansSummary,
            stagings: stagingsSummary,
            tasks: tasksSummary,
            appliedMemories,
          };
        }

        // Full mode with configurable inclusions
        const tasksData = args.includeOutputs
          ? state.tasks
          : Object.fromEntries(
              Object.entries(state.tasks).map(([id, t]) => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { output, ...taskWithoutOutput } = t;
                return [id, taskWithoutOutput];
              })
            );

        return {
          initialized: true,
          version: state.version,
          project: state.project,
          overview,
          currentPlanId: state.context.currentPlanId,
          currentStagingId: state.context.currentStagingId,
          plans: state.plans,
          stagings: state.stagings,
          tasks: tasksData,
          ...(args.includeHistory && { recentHistory: state.history.slice(-20) }),
          ...(args.includeDecisions && { decisions: state.context.decisions }),
          appliedMemories,
        };
      }, "get_full_context");

      if (result.success) {
        return createResponse(result.data);
      } else {
        return createErrorResponse(result.error);
      }
    }
  );

  // ============ init_project ============
  server.tool(
    "init_project",
    "Initialize a new ZSCode project. Creates the state.json file with project information.",
    {
      name: z.string().describe("Project name"),
      description: z.string().optional().describe("Project description"),
      goals: z.array(z.string()).optional().describe("Project goals"),
      constraints: z.array(z.string()).optional().describe("Project constraints or requirements"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        // Check if already initialized
        if (manager.isInitialized()) {
          return {
            success: false,
            message: "Project is already initialized",
            project: manager.getProject(),
          };
        }

        const project = await manager.initializeProject(
          args.name,
          args.description,
          args.goals,
          args.constraints
        );

        return {
          success: true,
          message: `Project "${args.name}" initialized successfully`,
          project,
        };
      }, "init_project");

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

  // ============ add_decision ============
  server.tool(
    "add_decision",
    "Record a design decision with its rationale. Helps track why certain choices were made.",
    {
      title: z.string().describe("Decision title"),
      decision: z.string().describe("The decision made"),
      rationale: z.string().optional().describe("Reasoning behind the decision"),
      relatedPlanId: z.string().optional().describe("Related Plan ID"),
      relatedStagingId: z.string().optional().describe("Related Staging ID"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new Error("Project not initialized");
        }

        const decision = await manager.addDecision(
          args.title,
          args.decision,
          args.rationale,
          args.relatedPlanId,
          args.relatedStagingId
        );

        return {
          success: true,
          message: "Decision recorded",
          decision,
        };
      }, "add_decision");

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
