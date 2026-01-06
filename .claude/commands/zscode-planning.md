# ZSCode Planning

This command enters planning mode for the current project.

## Usage

```
/zscode:planning [task description]
```

## Behavior

1. If a task description is provided:
   - Analyze the task and explore the codebase as needed
   - Create a new Plan with appropriate Stagings and Tasks
   - Present the plan for user review
   - **STOP after plan creation - DO NOT start execution**

2. If no task description:
   - Show current project status using `zscode:status`
   - List active and pending plans

## ⚠️ IMPORTANT: Planning Only

**This command is for PLANNING ONLY.** After creating a plan:
- Present the plan to the user for review
- Wait for user approval or modifications
- DO NOT automatically start any staging or execute tasks
- User must explicitly use `zscode:start` to begin execution

## Available MCP Tools

- `zscode:status` - Get status overview (recommended, lightweight)
- `get_full_context` - Get complete project state
  - Use `lightweight: true` to reduce context by ~70%
  - Use `includeOutputs: false` (default) to exclude task outputs
- `create_plan` - Create a new plan with stagings and tasks

**Context Optimization Tips:**
- Start with `zscode:status` for quick overview
- Use `get_full_context` with `lightweight: true` when full state is needed
- Avoid calling `get_full_context` without options (large context usage)

## ⚠️ CRITICAL: Model Selection for Tasks

When creating tasks with `create_plan`, you MUST specify the appropriate model for each task:

### Use `model: "opus"` for:
- **Code writing**: New code, functions, classes, modules
- **Code modification**: Refactoring, bug fixes, feature additions
- **Code analysis**: Understanding complex logic, debugging, code review
- **Architecture decisions**: Design patterns, system design

### Use `model: "sonnet"` for:
- Documentation writing
- Configuration file changes
- Simple file operations
- Test execution and reporting

### Use `model: "haiku"` for:
- Status checks
- Simple queries
- File listing operations
- Quick validations

**Example:**
```json
{
  "tasks": [
    { "title": "Implement auth middleware", "model": "opus" },
    { "title": "Update README", "model": "sonnet" },
    { "title": "Run tests", "model": "haiku" }
  ]
}
```

## Execution Commands (NOT part of planning)

These commands are used AFTER planning, when user explicitly requests execution:
- `zscode:start planId stagingId` - Start a specific staging
- `update_task` - Update task status
- `save_task_output` - Save task output/artifacts
- `get_staging_artifacts` - Get previous staging outputs
- `zscode:archive planId` - Archive a completed/cancelled plan
- `zscode:cancel planId` - Cancel an active plan

## Workflow

1. **Plan** (this command): Create and review the plan
2. **User Review**: User reviews and approves the plan
3. **Execute** (separate step): User runs `zscode:start` to begin

## ⚠️ CRITICAL: User Consent Required

**NEVER automatically start staging phases.** When a user says things like:
- "플랜을 진행해" / "Continue the plan"
- "다음 단계 진행" / "Next phase"
- "작업 시작해" / "Start working"

You MUST:
1. First show the current status with `zscode:status`
2. Present the staging details to the user
3. **Ask for explicit confirmation** before calling `zscode:start`
4. Only proceed after user approval

This applies even when resuming work in a new session.
