# ZSCode Memory

Manage project memories/rules that take precedence over CLAUDE.md.

## Usage

```
/zscode-memory [action]
```

## Actions

- **list** - Show all active memories
- **add** - Add a new memory (interactive)
- **context [type]** - Get memories for a specific context

## Categories

| Category | Description |
|----------|-------------|
| `general` | Always applied to all tasks (before CLAUDE.md) |
| `planning` | Applied during planning work |
| `coding` | Applied during coding work |
| `review` | Applied during code review |
| Custom | Any custom category with tags |

## MCP Tools

| Tool | Description |
|------|-------------|
| `add_memory` | Add a memory/rule |
| `list_memories` | List memories by category |
| `update_memory` | Update a memory |
| `remove_memory` | Delete a memory |
| `get_memories_for_context` | Get memories for a context |
| `list_categories` | List all categories |

## Priority

Memories are applied in priority order (0-100, higher first).
Default priority is 50.

## Examples

### Add a coding rule
```
add_memory:
  category: "coding"
  title: "TypeScript Strict Mode"
  content: "Always use strict TypeScript. Never use 'any' type."
  priority: 80
```

### Get memories for planning
```
get_memories_for_context:
  context: "planning"
```

## Auto-Injection

General memories are automatically included in `get_full_context` response,
so they are applied before CLAUDE.md rules on every session.
