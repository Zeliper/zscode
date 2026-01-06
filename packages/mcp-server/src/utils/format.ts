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
    lines.push(`   Current: ${plan.currentStaging.name} (${plan.currentStaging.id})`);
  }

  return lines.join("\n");
}

/**
 * Format staging detail as readable text
 */
export function formatStagingDetail(staging: StagingDetail): string {
  const statusIcon = getStatusIcon(staging.status);
  const lines = [
    `${statusIcon} **${staging.name}** (${staging.id}) [${staging.execution_type}]`,
    `   Tasks: ${staging.completedTaskCount}/${staging.taskCount}`,
  ];

  if (staging.tasks.length > 0) {
    staging.tasks.forEach(task => {
      const taskIcon = getStatusIcon(task.status);
      lines.push(`   ${taskIcon} ${task.title} (${task.id})`);
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

// ============ Extended Memory formatters ============

/**
 * Format memories for context as readable text
 * Used by get_memories_for_context
 */
export function formatMemoriesForContext(
  context: string,
  memories: Array<{ id: string; category: string; title: string; content: string; priority: number }>
): string {
  if (memories.length === 0) {
    return `📋 No memories for context: **${context}**`;
  }

  const lines = [
    `📋 **${context}** context (${memories.length} memories)`,
    "",
  ];

  for (const mem of memories) {
    lines.push(`### [${mem.category.toUpperCase()}] ${mem.title}`);
    lines.push(mem.content);
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Format category list as readable text
 * Used by list_categories
 */
export function formatCategoryList(
  defaultCategories: string[],
  usedCategories: string[]
): string {
  const lines = [
    "## Memory Categories",
    "",
    "**Default:**",
    ...defaultCategories.map(c => `- ${c}`),
    "",
  ];

  const customCategories = usedCategories.filter(c => !defaultCategories.includes(c));
  if (customCategories.length > 0) {
    lines.push("**Custom:**");
    lines.push(...customCategories.map(c => `- ${c}`));
  }

  return lines.join("\n");
}

// ============ ASCII Progress Bar ============

export interface ProgressBarOptions {
  /** Total width of the bar (default: 30) */
  width?: number;
  /** Character for completed portion (default: █) */
  filledChar?: string;
  /** Character for remaining portion (default: ░) */
  emptyChar?: string;
  /** Show percentage text (default: true) */
  showPercentage?: boolean;
  /** Show fraction (e.g., 5/10) (default: false) */
  showFraction?: boolean;
}

/**
 * Generate ASCII progress bar
 * @param current - Current value
 * @param total - Total value
 * @param options - Display options
 */
export function progressBar(
  current: number,
  total: number,
  options: ProgressBarOptions = {}
): string {
  const {
    width = 30,
    filledChar = "█",
    emptyChar = "░",
    showPercentage = true,
    showFraction = false,
  } = options;

  const percentage = total > 0 ? Math.min(100, (current / total) * 100) : 0;
  const filledWidth = Math.round((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const bar = filledChar.repeat(filledWidth) + emptyChar.repeat(emptyWidth);
  const parts = [`[${bar}]`];

  if (showPercentage) {
    parts.push(`${percentage.toFixed(0)}%`);
  }
  if (showFraction) {
    parts.push(`(${current}/${total})`);
  }

  return parts.join(" ");
}

/**
 * Generate a mini progress indicator (for inline use)
 */
export function miniProgress(current: number, total: number): string {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
  if (percentage === 0) return "○○○○○";
  if (percentage <= 20) return "●○○○○";
  if (percentage <= 40) return "●●○○○";
  if (percentage <= 60) return "●●●○○";
  if (percentage <= 80) return "●●●●○";
  return "●●●●●";
}

/**
 * Format plan progress as ASCII bar
 */
export function formatPlanProgress(
  planTitle: string,
  completedTasks: number,
  totalTasks: number,
  status: string
): string {
  const icon = getStatusIcon(status);
  const bar = progressBar(completedTasks, totalTasks, { width: 20, showFraction: true });
  return `${icon} **${planTitle}**\n   ${bar}`;
}

/**
 * Format staging progress as ASCII bar
 */
export function formatStagingProgress(
  stagingName: string,
  completedTasks: number,
  totalTasks: number,
  status: string
): string {
  const icon = getStatusIcon(status);
  const bar = progressBar(completedTasks, totalTasks, { width: 15, showPercentage: true });
  return `${icon} ${stagingName} ${bar}`;
}

// ============ Dependency Tree Visualization ============

export interface TreeNode {
  id: string;
  name: string;
  status?: string;
  children?: TreeNode[];
}

/**
 * Generate ASCII dependency tree
 */
export function dependencyTree(root: TreeNode, indent: string = ""): string {
  const lines: string[] = [];
  const icon = root.status ? getStatusIcon(root.status) : "•";
  lines.push(`${indent}${icon} ${root.name} (${root.id})`);

  if (root.children && root.children.length > 0) {
    root.children.forEach((child, index) => {
      const isLast = index === root.children!.length - 1;
      const connector = isLast ? "└── " : "├── ";
      const childIndent = indent + (isLast ? "    " : "│   ");

      const childIcon = child.status ? getStatusIcon(child.status) : "•";
      lines.push(`${indent}${connector}${childIcon} ${child.name} (${child.id})`);

      if (child.children && child.children.length > 0) {
        child.children.forEach((grandChild, gIndex) => {
          const gIsLast = gIndex === child.children!.length - 1;
          const gConnector = gIsLast ? "└── " : "├── ";
          const gIcon = grandChild.status ? getStatusIcon(grandChild.status) : "•";
          lines.push(`${childIndent}${gConnector}${gIcon} ${grandChild.name}`);
        });
      }
    });
  }

  return lines.join("\n");
}

/**
 * Format plan as dependency tree
 */
export function formatPlanTree(plan: {
  id: string;
  title: string;
  status: string;
  stagings: Array<{
    id: string;
    name: string;
    status: string;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
    }>;
  }>;
}): string {
  const root: TreeNode = {
    id: plan.id,
    name: plan.title,
    status: plan.status,
    children: plan.stagings.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      children: s.tasks.map(t => ({
        id: t.id,
        name: t.title,
        status: t.status,
      })),
    })),
  };
  return dependencyTree(root);
}

/**
 * Format task dependencies as a tree
 */
export function formatTaskDependencies(
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    depends_on: string[];
  }>
): string {
  // Build dependency map
  const taskMap = new Map(tasks.map(t => [t.id, t]));
  const dependents = new Map<string, string[]>();

  for (const task of tasks) {
    for (const depId of task.depends_on) {
      const list = dependents.get(depId) || [];
      list.push(task.id);
      dependents.set(depId, list);
    }
  }

  // Find root tasks (no dependencies)
  const rootTasks = tasks.filter(t => t.depends_on.length === 0);

  const lines: string[] = ["## Task Dependencies", ""];

  function renderTask(taskId: string, indent: string, isLast: boolean): void {
    const task = taskMap.get(taskId);
    if (!task) return;

    const connector = indent === "" ? "" : isLast ? "└── " : "├── ";
    const icon = getStatusIcon(task.status);
    lines.push(`${indent}${connector}${icon} ${task.title}`);

    const deps = dependents.get(taskId) || [];
    const newIndent = indent + (indent === "" ? "" : isLast ? "    " : "│   ");
    deps.forEach((depId, index) => {
      renderTask(depId, newIndent, index === deps.length - 1);
    });
  }

  if (rootTasks.length === 0) {
    lines.push("No dependencies found.");
  } else {
    rootTasks.forEach((task, index) => {
      renderTask(task.id, "", index === rootTasks.length - 1);
    });
  }

  return lines.join("\n");
}

// ============ Gantt Chart Visualization ============

export interface GanttTask {
  id: string;
  name: string;
  status: string;
  order: number;
  /** Duration in relative units */
  duration?: number;
}

export interface GanttOptions {
  /** Width of the chart in characters (default: 40) */
  width?: number;
  /** Character for pending (default: ░) */
  pendingChar?: string;
  /** Character for in progress (default: ▒) */
  inProgressChar?: string;
  /** Character for done (default: █) */
  doneChar?: string;
  /** Character for blocked (default: ╳) */
  blockedChar?: string;
}

/**
 * Generate simple ASCII Gantt chart
 */
export function ganttChart(
  tasks: GanttTask[],
  options: GanttOptions = {}
): string {
  const {
    width = 40,
    pendingChar = "░",
    inProgressChar = "▒",
    doneChar = "█",
    blockedChar = "╳",
  } = options;

  if (tasks.length === 0) {
    return "No tasks to display.";
  }

  // Find max name length for alignment
  const maxNameLen = Math.min(25, Math.max(...tasks.map(t => t.name.length)));
  const barWidth = Math.max(10, width - maxNameLen - 5);

  // Sort by order
  const sortedTasks = [...tasks].sort((a, b) => a.order - b.order);

  // Calculate bar segments per task
  const segmentWidth = Math.max(1, Math.floor(barWidth / sortedTasks.length));

  const lines: string[] = [];
  lines.push("## Gantt Chart");
  lines.push("");

  // Header
  const nameHeader = "Task".padEnd(maxNameLen);
  lines.push(`${nameHeader} │ Progress`);
  lines.push("─".repeat(maxNameLen) + "─┼─" + "─".repeat(barWidth));

  sortedTasks.forEach((task, index) => {
    const name = truncate(task.name, maxNameLen).padEnd(maxNameLen);
    const duration = task.duration || segmentWidth;

    let char: string;
    switch (task.status) {
      case "done":
      case "completed":
        char = doneChar;
        break;
      case "in_progress":
        char = inProgressChar;
        break;
      case "blocked":
        char = blockedChar;
        break;
      default:
        char = pendingChar;
    }

    // Position bar based on task order
    const offset = index * segmentWidth;
    const bar = " ".repeat(offset) + char.repeat(Math.min(duration, barWidth - offset));

    lines.push(`${name} │ ${bar}`);
  });

  return lines.join("\n");
}

/**
 * Format staging tasks as Gantt chart
 */
export function formatStagingGantt(
  stagingName: string,
  tasks: Array<{
    id: string;
    title: string;
    status: string;
    order?: number;
  }>
): string {
  const ganttTasks: GanttTask[] = tasks.map((t, i) => ({
    id: t.id,
    name: t.title,
    status: t.status,
    order: t.order ?? i,
  }));

  return `### ${stagingName}\n\n${ganttChart(ganttTasks)}`;
}

// ============ Color Support (ANSI escape codes) ============

/** ANSI color codes for terminal output */
export const colors = {
  // Reset
  reset: "\x1b[0m",

  // Text styles
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  italic: "\x1b[3m",
  underline: "\x1b[4m",

  // Text colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",

  // Bright colors
  brightBlack: "\x1b[90m",
  brightRed: "\x1b[91m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightBlue: "\x1b[94m",
  brightMagenta: "\x1b[95m",
  brightCyan: "\x1b[96m",
  brightWhite: "\x1b[97m",

  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
};

/** Check if colors are supported (not in MCP context by default) */
export function supportsColor(): boolean {
  // In MCP context, we typically output plain text
  // Colors would only be supported in direct terminal usage
  return false;
}

/**
 * Apply color to text (only if colors are supported)
 */
export function colorize(text: string, color: keyof typeof colors): string {
  if (!supportsColor()) return text;
  return `${colors[color]}${text}${colors.reset}`;
}

/**
 * Get status color
 */
export function getStatusColor(status: string): keyof typeof colors {
  switch (status) {
    case "completed":
    case "done":
      return "green";
    case "active":
    case "in_progress":
      return "cyan";
    case "blocked":
    case "cancelled":
    case "failed":
      return "red";
    case "pending":
    case "draft":
      return "yellow";
    case "archived":
      return "dim";
    default:
      return "white";
  }
}

/**
 * Color text by status
 */
export function colorByStatus(text: string, status: string): string {
  return colorize(text, getStatusColor(status));
}

/**
 * Format status with color
 */
export function formatColoredStatus(status: string): string {
  const icon = getStatusIcon(status);
  return colorByStatus(`${icon} ${status}`, status);
}

// ============ Combined Visualization ============

/**
 * Format comprehensive plan overview with all visualizations
 */
export function formatPlanOverview(plan: {
  id: string;
  title: string;
  description?: string;
  status: string;
  stagings: Array<{
    id: string;
    name: string;
    status: string;
    completedTasks: number;
    totalTasks: number;
    tasks: Array<{
      id: string;
      title: string;
      status: string;
      order?: number;
    }>;
  }>;
}): string {
  const lines: string[] = [];

  // Header
  const statusIcon = getStatusIcon(plan.status);
  lines.push(`${statusIcon} **${plan.title}** (${plan.id})`);
  if (plan.description) {
    lines.push(`   ${plan.description}`);
  }
  lines.push("");

  // Overall progress
  const totalTasks = plan.stagings.reduce((sum, s) => sum + s.totalTasks, 0);
  const completedTasks = plan.stagings.reduce((sum, s) => sum + s.completedTasks, 0);
  lines.push("**Overall Progress:**");
  lines.push(`   ${progressBar(completedTasks, totalTasks, { width: 30, showFraction: true })}`);
  lines.push("");

  // Staging progress bars
  lines.push("**Stagings:**");
  for (const staging of plan.stagings) {
    const stIcon = getStatusIcon(staging.status);
    const bar = progressBar(staging.completedTasks, staging.totalTasks, { width: 15 });
    lines.push(`   ${stIcon} ${staging.name}: ${bar}`);
  }
  lines.push("");

  // Dependency tree
  lines.push("**Structure:**");
  const tree = formatPlanTree({
    id: plan.id,
    title: plan.title,
    status: plan.status,
    stagings: plan.stagings.map(s => ({
      id: s.id,
      name: s.name,
      status: s.status,
      tasks: s.tasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
      })),
    })),
  });
  lines.push(tree);

  return lines.join("\n");
}

