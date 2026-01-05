/**
 * Output formatting utilities for MCP tools
 * Provides consistent JSON formatting and human-readable output generation
 */

import type { PlanSummary, StagingDetail, StatusOverview } from "../state/types.js";

export type FormatMode = "compact" | "pretty" | "minimal";

export interface FormatOptions {
  mode?: FormatMode;
  indent?: number;
}

/**
 * Format data as JSON string
 * @param data - Data to format
 * @param options - Formatting options
 * @returns Formatted JSON string
 */
export function formatJson(data: unknown, options: FormatOptions = {}): string {
  const { mode = "pretty", indent = 2 } = options;

  switch (mode) {
    case "compact":
      return JSON.stringify(data);
    case "minimal":
      // Single level indent for readability without excessive whitespace
      return JSON.stringify(data, null, 1);
    case "pretty":
    default:
      return JSON.stringify(data, null, indent);
  }
}

/**
 * Create MCP tool response content
 * @param data - Response data
 * @param options - Formatting options
 */
export function createResponse(data: unknown, options: FormatOptions = {}) {
  return {
    content: [{ type: "text" as const, text: formatJson(data, options) }],
  };
}

/**
 * Create MCP tool error response
 * @param error - Error data
 * @param options - Formatting options
 */
export function createErrorResponse(error: unknown, options: FormatOptions = {}) {
  return {
    content: [{ type: "text" as const, text: formatJson(error, options) }],
    isError: true,
  };
}

// ============ Human-readable formatters ============

/**
 * Format status overview as readable text
 */
export function formatStatusOverview(overview: StatusOverview): string {
  const lines = [
    "## Project Overview",
    "",
    `- Total Plans: ${overview.totalPlans}`,
    `- Active: ${overview.activePlans}`,
    `- Completed: ${overview.completedPlans}`,
    `- Archived: ${overview.archivedPlans}`,
    `- Cancelled: ${overview.cancelledPlans}`,
  ];
  return lines.join("\n");
}

/**
 * Format plan summary as readable text
 */
export function formatPlanSummary(plan: PlanSummary): string {
  const statusIcon = getStatusIcon(plan.status);
  const progress = plan.progress.percentage.toFixed(0);

  const lines = [
    `${statusIcon} **${plan.title}** (${plan.id})`,
    `   Progress: ${progress}% (${plan.progress.completedTasks}/${plan.progress.totalTasks} tasks)`,
  ];

  if (plan.currentStaging) {
    lines.push(`   Current: ${plan.currentStaging.name}`);
  }

  return lines.join("\n");
}

/**
 * Format staging detail as readable text
 */
export function formatStagingDetail(staging: StagingDetail): string {
  const statusIcon = getStatusIcon(staging.status);
  const lines = [
    `${statusIcon} **${staging.name}** [${staging.execution_type}]`,
    `   Tasks: ${staging.completedTaskCount}/${staging.taskCount}`,
  ];

  if (staging.tasks.length > 0) {
    staging.tasks.forEach(task => {
      const taskIcon = getStatusIcon(task.status);
      lines.push(`   ${taskIcon} ${task.title}`);
    });
  }

  return lines.join("\n");
}

/**
 * Format task update result as compact text
 */
export function formatTaskUpdate(_taskId: string, title: string, from: string, to: string): string {
  const icon = getStatusIcon(to);
  return `${icon} ${title}: ${from} → ${to}`;
}

/**
 * Format plan creation result as readable text
 */
export function formatPlanCreated(planId: string, title: string, stagingCount: number, taskCount: number): string {
  return [
    `✅ Plan created: **${title}**`,
    `   ID: ${planId}`,
    `   Stagings: ${stagingCount}`,
    `   Tasks: ${taskCount}`,
  ].join("\n");
}

/**
 * Format memory list as readable text
 */
export function formatMemoryList(memories: Array<{ id: string; category: string; title: string; priority: number; enabled: boolean }>): string {
  if (memories.length === 0) {
    return "No memories found.";
  }

  const lines = ["## Memories", ""];

  // Group by category
  const byCategory = new Map<string, typeof memories>();
  for (const mem of memories) {
    const list = byCategory.get(mem.category) || [];
    list.push(mem);
    byCategory.set(mem.category, list);
  }

  for (const [category, mems] of byCategory) {
    lines.push(`### ${category}`);
    for (const mem of mems) {
      const status = mem.enabled ? "✅" : "⏸️";
      lines.push(`${status} [${mem.priority}] ${mem.title} (${mem.id})`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ============ Helper functions ============

export function getStatusIcon(status: string): string {
  const icons: Record<string, string> = {
    // Plan status
    draft: "📝",
    active: "🔄",
    completed: "✅",
    archived: "📦",
    cancelled: "❌",
    // Staging status
    pending: "⏳",
    in_progress: "🔄",
    // Task status
    done: "✅",
    blocked: "🚫",
  };
  return icons[status] || "•";
}

/**
 * Truncate long strings for display
 */
export function truncate(str: string, maxLength: number = 100): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + "...";
}

/**
 * Format bytes as human-readable size
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ============ Text response helpers ============

/**
 * Create MCP tool response with plain text (default for user-facing output)
 */
export function textResponse(text: string) {
  return {
    content: [{ type: "text" as const, text }],
  };
}

/**
 * Create MCP tool error response with plain text
 */
export function textErrorResponse(message: string) {
  return {
    content: [{ type: "text" as const, text: `❌ Error: ${message}` }],
    isError: true,
  };
}

// ============ Staging formatters ============

export interface StagingStartInfo {
  name: string;
  description?: string;
  taskCount: number;
  executableCount: number;
  sessionBudget?: string;
}

export function formatStagingStart(info: StagingStartInfo): string {
  const lines = [
    `🚀 Started: **${info.name}**`,
  ];
  if (info.description) {
    lines.push(`   ${info.description}`);
  }
  lines.push(`   Tasks: ${info.executableCount}/${info.taskCount} ready`);
  if (info.sessionBudget) {
    lines.push(`   Budget: ${info.sessionBudget}`);
  }
  return lines.join("\n");
}

export function formatStagingComplete(name: string): string {
  return `✅ Staging completed: **${name}**`;
}

// ============ Task formatters ============

export interface TaskInfo {
  id: string;
  title: string;
  status: string;
  priority?: string;
}

export function formatTaskList(tasks: TaskInfo[]): string {
  if (tasks.length === 0) return "No tasks.";

  return tasks.map(t => {
    const icon = getStatusIcon(t.status);
    const priority = t.priority ? ` [${t.priority}]` : "";
    return `${icon} ${t.title}${priority}`;
  }).join("\n");
}

export function formatTaskOutputSaved(taskTitle: string, status: string): string {
  const icon = status === "success" ? "✅" : status === "partial" ? "⚠️" : "❌";
  return `${icon} Output saved: **${taskTitle}** (${status})`;
}

// ============ Context formatters ============

export interface ContextSummary {
  projectName: string;
  totalPlans: number;
  activePlans: number;
  completedPlans: number;
  currentPlan?: string;
  currentStaging?: string;
}

export function formatContextSummary(ctx: ContextSummary): string {
  const lines = [
    `📁 **${ctx.projectName}**`,
    `   Plans: ${ctx.activePlans} active, ${ctx.completedPlans} completed (${ctx.totalPlans} total)`,
  ];
  if (ctx.currentPlan) {
    lines.push(`   Current: ${ctx.currentPlan}`);
    if (ctx.currentStaging) {
      lines.push(`   Staging: ${ctx.currentStaging}`);
    }
  }
  return lines.join("\n");
}

// ============ Plan formatters ============

export function formatPlanSync(title: string, status: string, stagingsSummary: string): string {
  const icon = getStatusIcon(status);
  return `${icon} **${title}** synced → ${status}\n${stagingsSummary}`;
}

export function formatPlanArchived(title: string): string {
  return `📦 Plan archived: **${title}**`;
}

export function formatPlanCancelled(title: string): string {
  return `❌ Plan cancelled: **${title}**`;
}

export function formatPlanUnarchived(title: string): string {
  return `📂 Plan restored: **${title}**`;
}

// ============ Decision formatter ============

export function formatDecisionAdded(title: string): string {
  return `📋 Decision recorded: **${title}**`;
}

// ============ Memory formatters ============

export function formatMemoryAdded(title: string, category: string): string {
  return `💾 Memory added: **${title}** [${category}]`;
}

export function formatMemoryUpdated(title: string): string {
  return `✏️ Memory updated: **${title}**`;
}

export function formatMemoryRemoved(title: string): string {
  return `🗑️ Memory removed: **${title}**`;
}

// ============ Summary formatter ============

export function formatSummaryGenerated(): string {
  return `📄 Project summary generated/updated`;
}

// ============ File formatters ============

export function formatFileRead(path: string, size: number): string {
  return `📖 Read: ${path} (${formatSize(size)})`;
}

export function formatFileWritten(path: string): string {
  return `📝 Written: ${path}`;
}

