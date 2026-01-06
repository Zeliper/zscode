# ZSCode

Project managed with ZSCode Planning System.

## ZSCode Commands

This project uses ZSCode Planning System for task management.

### Quick Start

- `/zscode:planning` - Enter planning mode
- `/zscode:planning <task>` - Create a new plan for the task

### Core MCP Tools

| Tool | Description |
|------|-------------|
| `zscode:start` | Start a staging phase |
| `zscode:status` | Check plan status |
| `zscode:archive` | Archive completed plan |
| `zscode:cancel` | Cancel active plan |

### Template Tools

| Tool | Description |
|------|-------------|
| `create_template` | Create a new plan template |
| `get_template` | Get template details |
| `list_templates` | List all templates |
| `apply_template` | Create plan from template |
| `load_builtin_templates` | Load built-in templates |

### Snapshot/Rollback Tools

| Tool | Description |
|------|-------------|
| `create_snapshot` | Create state backup |
| `list_snapshots` | List all snapshots |
| `get_snapshot` | Get snapshot details |
| `restore_snapshot` | Restore from snapshot |
| `cleanup_snapshots` | Remove expired snapshots |

### Search Tools

| Tool | Description |
|------|-------------|
| `search` | Search across all entities |
| `search_tasks` | Search tasks with filters |
| `search_plans` | Search plans with filters |
| `search_memories` | Search memories with filters |

### Bulk Operation Tools

| Tool | Description |
|------|-------------|
| `bulk_update_tasks` | Update multiple tasks |
| `bulk_delete_tasks` | Delete multiple tasks |
| `bulk_complete_tasks` | Complete multiple tasks |
| `bulk_cancel_tasks` | Cancel multiple tasks |
| `bulk_update_memories` | Update multiple memories |
| `bulk_enable_memories` | Enable multiple memories |
| `bulk_disable_memories` | Disable multiple memories |

### Navigation Tools

| Tool | Description |
|------|-------------|
| `get_plans_paginated` | Browse plans with pagination |
| `get_tasks_paginated` | Browse tasks with pagination |
| `get_templates_paginated` | Browse templates with pagination |
| `quick_tasks` | Quick task filter presets |
| `quick_plans` | Quick plan filter presets |

### Workflow

1. **Plan**: Use `/zscode:planning` to create a structured plan
2. **Start**: Begin work with `zscode:start planId stagingId`
3. **Execute**: Complete tasks, save outputs for next staging
4. **Review**: Check progress with `zscode:status`
5. **Archive**: Clean up with `zscode:archive` when done

### Built-in Templates

- **Feature Development**: Analysis -> Design -> Implementation -> Testing -> Documentation
- **Bug Fix**: Investigation -> Fix Implementation -> Verification
- **Code Refactoring**: Preparation -> Refactoring -> Cleanup
- **Code Review**: Overview -> Detailed Review -> Feedback

Use `load_builtin_templates` to load them, then `apply_template` to create a plan.

## Project Structure

```
.claude/
├── state.json          # Project state
├── plans/              # Plan artifacts
├── archive/            # Archived plans
└── commands/           # Slash commands
```
