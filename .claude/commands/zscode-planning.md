# ZSCode Planning

This command enters planning mode for the current project.

## Usage

```
/zscode:planning [task description]
```

## Behavior

1. If a task description is provided:
   - Analyze the task
   - Create a new Plan with appropriate Stagings and Tasks
   - Present the plan for review

2. If no task description:
   - Show current project status using `zscode:status`
   - List active and pending plans

## Available MCP Tools

- `get_full_context` - Get complete project state
- `create_plan` - Create a new plan with stagings and tasks
- `zscode:start planId stagingId` - Start a specific staging
- `zscode:status [planId]` - Get status of all plans or specific plan
- `zscode:archive planId` - Archive a completed/cancelled plan
- `zscode:cancel planId` - Cancel an active plan
- `update_task` - Update task status
- `save_task_output` - Save task output/artifacts
- `get_staging_artifacts` - Get previous staging outputs

## Workflow

1. Create a plan: Define stagings (phases) with tasks
2. Start staging: `zscode:start plan-xxx staging-0001`
3. Work on tasks: Update status as you complete them
4. Save outputs: Store results for next staging to use
5. Complete: Archive when done
