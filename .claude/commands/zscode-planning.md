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

- `get_full_context` - Get complete project state
- `create_plan` - Create a new plan with stagings and tasks
- `zscode:status [planId]` - Get status of all plans or specific plan

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
