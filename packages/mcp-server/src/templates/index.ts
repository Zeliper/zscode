/**
 * Built-in Templates
 * Pre-defined plan templates for common development workflows
 */

import type { TemplateCategory } from "../state/types.js";

// Define task def inline without strict required fields
interface TemplateTaskDefInput {
  title: string;
  description?: string;
  priority: "high" | "medium" | "low";
  execution_mode: "parallel" | "sequential";
  model?: "opus" | "sonnet" | "haiku";
  depends_on_index?: number[];
  memory_tags?: string[];
}

interface TemplateStagingDefInput {
  name: string;
  description?: string;
  execution_type: "parallel" | "sequential";
  default_model?: "opus" | "sonnet" | "haiku";
  session_budget?: "minimal" | "standard" | "extensive";
  recommended_sessions?: number;
  tasks: TemplateTaskDefInput[];
}

export interface BuiltInTemplate {
  name: string;
  description: string;
  category: TemplateCategory;
  tags: string[];
  stagings: TemplateStagingDefInput[];
  variables: Array<{
    name: string;
    description?: string;
    defaultValue?: string;
    required: boolean;
  }>;
}

// Helper to add default values to tasks
function normalizeTask(task: TemplateTaskDefInput): {
  title: string;
  priority: "high" | "medium" | "low";
  execution_mode: "parallel" | "sequential";
  memory_tags: string[];
  depends_on_index: number[];
  description?: string;
  model?: "opus" | "sonnet" | "haiku";
} {
  return {
    title: task.title,
    priority: task.priority,
    execution_mode: task.execution_mode,
    memory_tags: task.memory_tags ?? [],
    depends_on_index: task.depends_on_index ?? [],
    description: task.description,
    model: task.model,
  };
}

// ============ Feature Development Template ============
export const featureTemplate: BuiltInTemplate = {
  name: "Feature Development",
  description: "Standard workflow for implementing new features with analysis, implementation, testing, and documentation phases.",
  category: "feature",
  tags: ["feature", "development", "standard"],
  variables: [
    {
      name: "FEATURE_NAME",
      description: "Name of the feature to implement",
      required: true,
    },
    {
      name: "COMPONENT",
      description: "Component or module where the feature will be added",
      defaultValue: "core",
      required: false,
    },
  ],
  stagings: [
    {
      name: "Phase 1: Analysis & Design",
      description: "Analyze requirements and design the solution",
      execution_type: "sequential",
      default_model: "opus",
      session_budget: "minimal",
      tasks: [
        {
          title: "Analyze requirements for {{FEATURE_NAME}}",
          description: "Understand the feature requirements and acceptance criteria",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Design solution architecture",
          description: "Design the technical approach and identify components to modify",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Identify affected files and dependencies",
          description: "List all files that need modification and potential conflicts",
          priority: "medium",
          execution_mode: "sequential",
        },
      ],
    },
    {
      name: "Phase 2: Implementation",
      description: "Implement the feature code",
      execution_type: "parallel",
      default_model: "opus",
      session_budget: "extensive",
      tasks: [
        {
          title: "Implement core functionality",
          description: "Write the main feature code in {{COMPONENT}}",
          priority: "high",
          execution_mode: "parallel",
          model: "opus",
        },
        {
          title: "Add type definitions",
          description: "Create or update TypeScript types and interfaces",
          priority: "medium",
          execution_mode: "parallel",
        },
        {
          title: "Implement error handling",
          description: "Add proper error handling and validation",
          priority: "medium",
          execution_mode: "parallel",
        },
      ],
    },
    {
      name: "Phase 3: Testing",
      description: "Write and run tests",
      execution_type: "sequential",
      default_model: "sonnet",
      session_budget: "standard",
      tasks: [
        {
          title: "Write unit tests",
          description: "Create unit tests for the new functionality",
          priority: "high",
          execution_mode: "sequential",
        },
        {
          title: "Write integration tests",
          description: "Create integration tests if applicable",
          priority: "medium",
          execution_mode: "sequential",
        },
        {
          title: "Run all tests and fix failures",
          description: "Execute test suite and address any failures",
          priority: "high",
          execution_mode: "sequential",
        },
      ],
    },
    {
      name: "Phase 4: Documentation & Cleanup",
      description: "Finalize documentation and code cleanup",
      execution_type: "parallel",
      default_model: "haiku",
      session_budget: "minimal",
      tasks: [
        {
          title: "Update documentation",
          description: "Add or update relevant documentation",
          priority: "medium",
          execution_mode: "parallel",
        },
        {
          title: "Code review preparation",
          description: "Self-review and clean up code, add comments",
          priority: "medium",
          execution_mode: "parallel",
        },
      ],
    },
  ],
};

// ============ Bug Fix Template ============
export const bugfixTemplate: BuiltInTemplate = {
  name: "Bug Fix",
  description: "Structured workflow for investigating and fixing bugs with root cause analysis.",
  category: "bugfix",
  tags: ["bug", "fix", "debug"],
  variables: [
    {
      name: "BUG_DESCRIPTION",
      description: "Brief description of the bug",
      required: true,
    },
    {
      name: "ISSUE_ID",
      description: "Issue/ticket ID (if any)",
      required: false,
    },
  ],
  stagings: [
    {
      name: "Phase 1: Investigation",
      description: "Reproduce and understand the bug",
      execution_type: "sequential",
      default_model: "opus",
      session_budget: "standard",
      tasks: [
        {
          title: "Reproduce the bug",
          description: "Confirm the bug can be reproduced: {{BUG_DESCRIPTION}}",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Root cause analysis",
          description: "Identify the root cause of the bug",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Identify scope of impact",
          description: "Determine what else might be affected by this bug or the fix",
          priority: "medium",
          execution_mode: "sequential",
        },
      ],
    },
    {
      name: "Phase 2: Fix Implementation",
      description: "Implement the bug fix",
      execution_type: "sequential",
      default_model: "opus",
      session_budget: "standard",
      tasks: [
        {
          title: "Implement the fix",
          description: "Write code to fix the root cause",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Add regression test",
          description: "Create test case that catches this bug",
          priority: "high",
          execution_mode: "sequential",
        },
      ],
    },
    {
      name: "Phase 3: Verification",
      description: "Verify the fix works correctly",
      execution_type: "sequential",
      default_model: "sonnet",
      session_budget: "minimal",
      tasks: [
        {
          title: "Verify bug is fixed",
          description: "Confirm the original bug no longer occurs",
          priority: "high",
          execution_mode: "sequential",
        },
        {
          title: "Run full test suite",
          description: "Ensure no regressions were introduced",
          priority: "high",
          execution_mode: "sequential",
        },
        {
          title: "Test edge cases",
          description: "Test related edge cases and scenarios",
          priority: "medium",
          execution_mode: "sequential",
        },
      ],
    },
  ],
};

// ============ Refactoring Template ============
export const refactoringTemplate: BuiltInTemplate = {
  name: "Code Refactoring",
  description: "Safe refactoring workflow with comprehensive testing at each step.",
  category: "refactoring",
  tags: ["refactor", "cleanup", "improvement"],
  variables: [
    {
      name: "TARGET_CODE",
      description: "Code area to refactor (file, module, function)",
      required: true,
    },
    {
      name: "GOAL",
      description: "Goal of the refactoring",
      defaultValue: "improve code quality",
      required: false,
    },
  ],
  stagings: [
    {
      name: "Phase 1: Preparation",
      description: "Ensure test coverage before refactoring",
      execution_type: "sequential",
      default_model: "sonnet",
      session_budget: "standard",
      tasks: [
        {
          title: "Review current code structure",
          description: "Understand current implementation of {{TARGET_CODE}}",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Ensure test coverage",
          description: "Add tests if current coverage is insufficient",
          priority: "high",
          execution_mode: "sequential",
        },
        {
          title: "Run baseline tests",
          description: "Verify all tests pass before refactoring",
          priority: "high",
          execution_mode: "sequential",
        },
      ],
    },
    {
      name: "Phase 2: Refactoring",
      description: "Apply refactoring changes incrementally",
      execution_type: "sequential",
      default_model: "opus",
      session_budget: "extensive",
      tasks: [
        {
          title: "Apply first refactoring step",
          description: "Make first incremental change towards {{GOAL}}",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Run tests after first step",
          description: "Verify tests still pass",
          priority: "high",
          execution_mode: "sequential",
        },
        {
          title: "Apply remaining refactoring",
          description: "Continue with incremental improvements",
          priority: "high",
          execution_mode: "sequential",
          model: "opus",
        },
        {
          title: "Run tests after completion",
          description: "Verify all tests pass after refactoring",
          priority: "high",
          execution_mode: "sequential",
        },
      ],
    },
    {
      name: "Phase 3: Cleanup",
      description: "Final cleanup and documentation",
      execution_type: "parallel",
      default_model: "haiku",
      session_budget: "minimal",
      tasks: [
        {
          title: "Remove dead code",
          description: "Clean up any unused code artifacts",
          priority: "medium",
          execution_mode: "parallel",
        },
        {
          title: "Update comments and docs",
          description: "Update documentation to reflect changes",
          priority: "low",
          execution_mode: "parallel",
        },
      ],
    },
  ],
};

// ============ Code Review Template ============
export const reviewTemplate: BuiltInTemplate = {
  name: "Code Review",
  description: "Systematic code review process covering functionality, security, and quality.",
  category: "review",
  tags: ["review", "pr", "code-review"],
  variables: [
    {
      name: "PR_ID",
      description: "Pull request ID or branch name",
      required: true,
    },
    {
      name: "FOCUS_AREA",
      description: "Specific area to focus on (optional)",
      required: false,
    },
  ],
  stagings: [
    {
      name: "Phase 1: Overview",
      description: "Understand the scope of changes",
      execution_type: "sequential",
      default_model: "opus",
      session_budget: "minimal",
      tasks: [
        {
          title: "Review PR description and context",
          description: "Understand the purpose of {{PR_ID}}",
          priority: "high",
          execution_mode: "sequential",
        },
        {
          title: "Review changed files list",
          description: "Get overview of all changed files",
          priority: "high",
          execution_mode: "sequential",
        },
      ],
    },
    {
      name: "Phase 2: Detailed Review",
      description: "Review code in detail",
      execution_type: "parallel",
      default_model: "opus",
      session_budget: "standard",
      tasks: [
        {
          title: "Review functionality",
          description: "Verify code does what it claims to do",
          priority: "high",
          execution_mode: "parallel",
          model: "opus",
        },
        {
          title: "Review code quality",
          description: "Check code style, patterns, and maintainability",
          priority: "medium",
          execution_mode: "parallel",
        },
        {
          title: "Review security",
          description: "Check for security vulnerabilities and data handling",
          priority: "high",
          execution_mode: "parallel",
          model: "opus",
        },
        {
          title: "Review tests",
          description: "Verify test coverage and quality",
          priority: "medium",
          execution_mode: "parallel",
        },
      ],
    },
    {
      name: "Phase 3: Feedback",
      description: "Compile and provide feedback",
      execution_type: "sequential",
      default_model: "sonnet",
      session_budget: "minimal",
      tasks: [
        {
          title: "Compile review findings",
          description: "Summarize all review comments and suggestions",
          priority: "high",
          execution_mode: "sequential",
        },
        {
          title: "Provide feedback",
          description: "Submit review with actionable feedback",
          priority: "high",
          execution_mode: "sequential",
        },
      ],
    },
  ],
};

// ============ All Built-in Templates ============
export const builtInTemplates: BuiltInTemplate[] = [
  featureTemplate,
  bugfixTemplate,
  refactoringTemplate,
  reviewTemplate,
];

/**
 * Get all built-in templates with normalized task definitions
 */
export function getBuiltInTemplates() {
  return builtInTemplates.map(template => ({
    ...template,
    stagings: template.stagings.map(staging => ({
      ...staging,
      tasks: staging.tasks.map(normalizeTask),
    })),
  }));
}

/**
 * Get a specific built-in template by name
 */
export function getBuiltInTemplate(name: string): BuiltInTemplate | undefined {
  return builtInTemplates.find(t => t.name.toLowerCase() === name.toLowerCase());
}
