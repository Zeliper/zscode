import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { StateManager } from "../state/manager.js";
import {
  withErrorHandling,
  ProjectNotInitializedError,
  ValidationError,
} from "../errors/index.js";
import type { Template, TemplateCategory } from "../state/types.js";

// ============ Human-Readable Formatters ============
function formatTemplateDetail(template: Template): string {
  const lines: string[] = [];
  lines.push(`📋 **${template.name}**`);
  lines.push(`   ID: ${template.id}`);
  lines.push(`   Category: ${template.category}`);
  if (template.description) lines.push(`   Description: ${template.description}`);
  lines.push(`   Tags: ${template.tags.length > 0 ? template.tags.join(", ") : "none"}`);
  lines.push("");

  if (template.variables.length > 0) {
    lines.push("**Variables:**");
    for (const v of template.variables) {
      const req = v.required ? "(required)" : "(optional)";
      lines.push(`   • ${v.name} ${req}${v.defaultValue ? ` = "${v.defaultValue}"` : ""}`);
    }
    lines.push("");
  }

  lines.push("**Stagings:**");
  for (let i = 0; i < template.stagings.length; i++) {
    const staging = template.stagings[i];
    if (!staging) continue;
    lines.push(`   ${i + 1}. ${staging.name} [${staging.execution_type}]`);
    if (staging.description) lines.push(`      ${staging.description}`);
    lines.push(`      Tasks: ${staging.tasks.length}`);
    for (const t of staging.tasks) {
      lines.push(`        - ${t.title} (${t.priority})`);
    }
  }

  lines.push("");
  lines.push(`Usage: ${template.usageCount} times${template.lastUsedAt ? ` | Last: ${new Date(template.lastUsedAt).toLocaleDateString()}` : ""}`);

  return lines.join("\n");
}

function formatTemplateList(templates: Template[]): string {
  if (templates.length === 0) {
    return "No templates found.";
  }

  const lines: string[] = [];
  lines.push(`📋 **Templates** (${templates.length})`);
  lines.push("");

  // Group by category
  const byCategory = new Map<string, Template[]>();
  for (const t of templates) {
    const list = byCategory.get(t.category) || [];
    list.push(t);
    byCategory.set(t.category, list);
  }

  for (const [category, tpls] of byCategory) {
    lines.push(`**${category.charAt(0).toUpperCase() + category.slice(1)}:**`);
    for (const t of tpls) {
      const builtIn = t.isBuiltIn ? " ⭐" : "";
      lines.push(`   • ${t.name}${builtIn} (${t.id})`);
      if (t.description) lines.push(`     ${t.description}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function formatApplyResult(planId: string, planTitle: string, stagingsCreated: number, tasksCreated: number): string {
  const lines: string[] = [];
  lines.push(`✅ **Template Applied Successfully**`);
  lines.push(`   Plan: ${planTitle} (${planId})`);
  lines.push(`   Created: ${stagingsCreated} stagings, ${tasksCreated} tasks`);
  return lines.join("\n");
}

// Template task definition schema for input
const TemplateTaskDefInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  execution_mode: z.enum(["parallel", "sequential"]).default("parallel"),
  model: z.enum(["opus", "sonnet", "haiku"]).optional(),
  depends_on_index: z.array(z.number().int().min(0)).default([]),
  memory_tags: z.array(z.string()).default([]),
});

// Template staging definition schema for input
const TemplateStagingDefInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  execution_type: z.enum(["parallel", "sequential"]).default("parallel"),
  default_model: z.enum(["opus", "sonnet", "haiku"]).optional(),
  session_budget: z.enum(["minimal", "standard", "extensive"]).optional(),
  recommended_sessions: z.number().min(0.5).max(10).optional(),
  tasks: z.array(TemplateTaskDefInputSchema).default([]),
});

// Template variable schema for input
const TemplateVariableInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  defaultValue: z.string().optional(),
  required: z.boolean().default(false),
});

/**
 * Register template-related tools
 */
export function registerTemplateTools(server: McpServer): void {
  // ============ create_template ============
  server.tool(
    "create_template",
    "Create a new plan template for reuse. Templates can include multiple stagings with tasks.",
    {
      name: z.string().min(1).describe("Template name"),
      description: z.string().optional().describe("Template description"),
      category: z.enum(["feature", "bugfix", "refactoring", "review", "deployment", "testing", "custom"])
        .default("custom").describe("Template category"),
      tags: z.array(z.string()).default([]).describe("Tags for searchability"),
      stagings: z.array(TemplateStagingDefInputSchema).default([]).describe("Staging definitions with tasks"),
      variables: z.array(TemplateVariableInputSchema).default([]).describe("Variables that can be replaced when applying"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const template = await manager.createTemplate({
          name: args.name,
          description: args.description,
          category: args.category as TemplateCategory,
          tags: args.tags,
          stagings: args.stagings,
          variables: args.variables,
        });

        return {
          success: true,
          message: `Template "${args.name}" created`,
          template,
        };
      }, "create_template");

      if (result.success) {
        const text = `✅ **Template Created**: ${result.data.template.name}\n   ID: ${result.data.template.id}\n   Category: ${result.data.template.category}\n   Stagings: ${result.data.template.stagings.length}`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ get_template ============
  server.tool(
    "get_template",
    "Get detailed information about a specific template.",
    {
      templateId: z.string().describe("Template ID to retrieve"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const template = manager.getTemplate(args.templateId);
        if (!template) {
          throw new ValidationError(`Template not found: ${args.templateId}`);
        }

        return { success: true, template };
      }, "get_template");

      if (result.success) {
        const text = formatTemplateDetail(result.data.template);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ list_templates ============
  server.tool(
    "list_templates",
    "List all templates, optionally filtered by category or tags.",
    {
      category: z.enum(["feature", "bugfix", "refactoring", "review", "deployment", "testing", "custom"])
        .optional().describe("Filter by category"),
      tags: z.array(z.string()).optional().describe("Filter by tags (OR logic)"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const templates = manager.listTemplates({
          category: args.category as TemplateCategory | undefined,
          tags: args.tags,
        });

        return { success: true, templates, count: templates.length };
      }, "list_templates");

      if (result.success) {
        const text = formatTemplateList(result.data.templates);
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ update_template ============
  server.tool(
    "update_template",
    "Update an existing template's metadata or content.",
    {
      templateId: z.string().describe("Template ID to update"),
      name: z.string().optional().describe("New template name"),
      description: z.string().optional().describe("New description"),
      category: z.enum(["feature", "bugfix", "refactoring", "review", "deployment", "testing", "custom"])
        .optional().describe("New category"),
      tags: z.array(z.string()).optional().describe("New tags"),
      stagings: z.array(TemplateStagingDefInputSchema).optional().describe("New staging definitions"),
      variables: z.array(TemplateVariableInputSchema).optional().describe("New variables"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const hasUpdate = args.name || args.description !== undefined || args.category ||
                          args.tags || args.stagings || args.variables;
        if (!hasUpdate) {
          throw new ValidationError("At least one update field must be provided");
        }

        const template = await manager.updateTemplate(args.templateId, {
          name: args.name,
          description: args.description,
          category: args.category as TemplateCategory | undefined,
          tags: args.tags,
          stagings: args.stagings,
          variables: args.variables,
        });

        return { success: true, template };
      }, "update_template");

      if (result.success) {
        const t = result.data.template;
        const text = `✅ **Template Updated**: ${t.name}\n   ID: ${t.id}\n   Category: ${t.category}`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ delete_template ============
  server.tool(
    "delete_template",
    "Delete a template. Built-in templates cannot be deleted.",
    {
      templateId: z.string().describe("Template ID to delete"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const template = manager.getTemplate(args.templateId);
        if (!template) {
          throw new ValidationError(`Template not found: ${args.templateId}`);
        }

        const templateName = template.name;
        await manager.deleteTemplate(args.templateId);

        return { success: true, templateName, templateId: args.templateId };
      }, "delete_template");

      if (result.success) {
        const text = `🗑️ **Template Deleted**: ${result.data.templateName}\n   ID: ${result.data.templateId}`;
        return { content: [{ type: "text" as const, text }] };
      } else {
        return {
          content: [{ type: "text" as const, text: `❌ ${result.error.message}` }],
          isError: true,
        };
      }
    }
  );

  // ============ apply_template ============
  server.tool(
    "apply_template",
    "Apply a template to create a new plan with stagings and tasks.",
    {
      templateId: z.string().describe("Template ID to apply"),
      planTitle: z.string().min(1).describe("Title for the new plan"),
      planDescription: z.string().optional().describe("Description for the new plan"),
      variables: z.record(z.string()).optional().describe("Variable values to substitute (key: variable name, value: replacement)"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const plan = await manager.applyTemplate(
          args.templateId,
          args.planTitle,
          args.planDescription,
          args.variables,
        );

        // Count stagings and tasks
        let taskCount = 0;
        for (const stagingId of plan.stagings) {
          const staging = manager.getStaging(stagingId);
          if (staging) {
            taskCount += staging.tasks.length;
          }
        }

        return {
          success: true,
          planId: plan.id,
          planTitle: plan.title,
          stagingsCreated: plan.stagings.length,
          tasksCreated: taskCount,
        };
      }, "apply_template");

      if (result.success) {
        const text = formatApplyResult(
          result.data.planId,
          result.data.planTitle,
          result.data.stagingsCreated,
          result.data.tasksCreated
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

  // ============ load_builtin_templates ============
  server.tool(
    "load_builtin_templates",
    "Load built-in templates (Feature Development, Bug Fix, Refactoring, Code Review). Only loads templates that don't already exist unless overwrite is true.",
    {
      overwrite: z.boolean().default(false).describe("If true, overwrite existing built-in templates"),
    },
    async (args) => {
      const result = await withErrorHandling(async () => {
        const manager = StateManager.getInstance();

        if (!manager.isInitialized()) {
          throw new ProjectNotInitializedError();
        }

        const loadedCount = await manager.loadBuiltInTemplates(args.overwrite);
        const totalTemplates = manager.getAllTemplates().filter(t => t.isBuiltIn).length;

        return {
          success: true,
          loadedCount,
          totalBuiltIn: totalTemplates,
          overwritten: args.overwrite,
        };
      }, "load_builtin_templates");

      if (result.success) {
        const { loadedCount, totalBuiltIn, overwritten } = result.data;
        let text: string;
        if (loadedCount > 0) {
          text = `✅ **Loaded ${loadedCount} Built-in Template(s)**\n   Total built-in templates: ${totalBuiltIn}`;
          if (overwritten) {
            text += `\n   Mode: overwrite`;
          }
        } else {
          text = `ℹ️ All built-in templates already loaded (${totalBuiltIn} total)`;
        }
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
