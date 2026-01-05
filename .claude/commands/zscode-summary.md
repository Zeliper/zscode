# ZSCode Summary

Generate or update the project summary that is automatically injected into context.

## Usage

```
/zscode-summary [action]
```

## Actions

If no action is specified, generates/updates the project summary.

## What It Does

1. **First Run**: Creates a `project-summary` memory containing:
   - Project name and description
   - Goals and constraints
   - Current status (active plans, completed plans, task counts)
   - Active work details (current staging, in-progress tasks)
   - Key rules (high-priority memories)
   - Recent decisions

2. **Subsequent Runs**: Updates the summary with current project state

## Auto-Injection

The project summary is automatically included in:
- `get_full_context` responses (along with general memories)
- `zscode:start` responses when starting a staging
- `update_task` responses when tasks transition to `in_progress`

This means the summary acts like a dynamic CLAUDE.md that always reflects current project state.

## Context Optimization

**Recommended approach:**
- Use `get_project_summary` to view current summary (minimal context)
- Use `generate_summary` to update the summary
- Avoid using `get_full_context` just to see the summary

**Note:** `get_full_context` now supports these options to reduce context:
- `lightweight: true` - Returns only IDs and status (~70% reduction)
- `includeOutputs: false` - Excludes task outputs (default)
- `includeHistory: false` - Excludes history (default)
- `includeDecisions: false` - Excludes decisions (default)

## MCP Tools

| Tool | Description |
|------|-------------|
| `generate_summary` | Create or update the project summary |
| `get_project_summary` | View current summary content |
| `delete_project_summary` | Remove the summary |

## Custom Content

You can provide custom content instead of auto-generated summary:

```
generate_summary:
  customContent: "Your custom project overview here..."
```

## Best Practices

1. Run `/zscode:summary` at the start of each session to update context
2. Run after completing major plan phases
3. Keep the summary concise - it's included in every context load
4. Use for critical project information that should always be available

## Example Output

```markdown
# MyProject

A web application for task management.

## Goals
- Provide intuitive task tracking
- Support team collaboration

## Status
- Active Plans: 1
- Completed Plans: 3
- Tasks: 45/60 completed

## Active Work
- **API Refactoring**
  - Current: Phase 2: Database Optimization
  - Tasks: Implement query caching

## Key Rules
- **Always run tests before commit** (coding)
- **Use TypeScript strict mode** (coding)
```

ARGUMENTS: $ARGUMENTS
