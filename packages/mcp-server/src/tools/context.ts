import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import { withErrorHandling } from "../errors/index.js";

/**
 * Register context-related tools
 */
export function registerContextTools(server: McpServer, projectRoot: string): void {
  // ============ get_full_context ============
  server.tool(
    "get_full_context",
    "Get the full project context including all plans, stagings, tasks, and history. Use this to understand the current state of the project.",
    {},
    async () => {
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

        return {
          initialized: true,
          version: state.version,
          project: state.project,
          overview,
          currentPlanId: state.context.currentPlanId,
          currentStagingId: state.context.currentStagingId,
          plans: state.plans,
          stagings: state.stagings,
          tasks: state.tasks,
          recentHistory: state.history.slice(-20), // Last 20 entries
          decisions: state.context.decisions,
        };
      }, "get_full_context");

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
