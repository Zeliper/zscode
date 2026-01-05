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

function getStatusIcon(status: string): string {
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
