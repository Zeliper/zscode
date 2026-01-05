# ZSCode

Project managed with ZSCode Planning System.

## ZSCode Commands

This project uses ZSCode Planning System for task management.

### Quick Start

- `/zscode:planning` - Enter planning mode
- `/zscode:planning <task>` - Create a new plan for the task

### MCP Tools

All commands are available as MCP tools:

| Tool | Description |
|------|-------------|
| `zscode:start` | Start a staging phase |
| `zscode:status` | Check plan status |
| `zscode:archive` | Archive completed plan |
| `zscode:cancel` | Cancel active plan |

### Workflow

1. **Plan**: Use `/zscode:planning` to create a structured plan
2. **Start**: Begin work with `zscode:start planId stagingId`
3. **Execute**: Complete tasks, save outputs for next staging
4. **Review**: Check progress with `zscode:status`
5. **Archive**: Clean up with `zscode:archive` when done

## Project Structure

```
.claude/
├── state.json          # Project state
├── plans/              # Plan artifacts
├── archive/            # Archived plans
└── commands/           # Slash commands
```
