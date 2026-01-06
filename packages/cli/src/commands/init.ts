import { writeFile } from "fs/promises";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import {
  joinPath,
  ensureDir,
  fileExists,
  getClaudeDir,
  getStateFilePath,
  getPlansDir,
  getArchiveDir,
  getCommandsDir,
  toPosixPath,
} from "../utils/paths.js";

export interface InitOptions {
  force?: boolean;
  claudeMd?: boolean;
  projectName?: string;
}

interface ProjectInfo {
  name: string;
  description: string;
}

/**
 * Prompt for project name
 */
async function promptProjectInfo(cwd: string): Promise<ProjectInfo> {
  const defaultName = cwd.split(/[/\\]/).pop() || "my-project";

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "name",
      message: "Project name:",
      default: defaultName,
    },
    {
      type: "input",
      name: "description",
      message: "Project description (optional):",
      default: "",
    },
  ]);

  return {
    name: answers.name,
    description: answers.description,
  };
}

/**
 * Create initial state.json content
 */
function createInitialState(name: string, description: string): object {
  const now = new Date().toISOString();
  return {
    version: "2.0.0",
    project: {
      name,
      description: description || undefined,
      goals: [],
      constraints: [],
      createdAt: now,
      updatedAt: now,
    },
    plans: {},
    stagings: {},
    tasks: {},
    history: [
      {
        id: `hist-${Date.now()}-init`,
        timestamp: now,
        type: "project_initialized",
        details: { projectName: name },
      },
    ],
    context: {
      lastUpdated: now,
      activeFiles: [],
      decisions: [],
      memories: [],
    },
  };
}

/**
 * Create mcp.json content
 */
function createMcpConfig(): object {
  return {
    mcpServers: {
      zscode: {
        command: "npx",
        args: ["-y", "@zeliper/zscode-mcp-server"],
        env: {
          ZSCODE_PROJECT_ROOT: "${workspaceFolder}",
        },
      },
    },
  };
}

/**
 * Create zscode-planning.md slash command
 */
function createPlanningCommand(): string {
  return `# ZSCode Planning

This command enters planning mode for the current project.

## Usage

\`\`\`
/zscode:planning [task description]
\`\`\`

## Behavior

1. If a task description is provided:
   - Analyze the task and explore the codebase as needed
   - Create a new Plan with appropriate Stagings and Tasks
   - Present the plan for user review
   - **STOP after plan creation - DO NOT start execution**

2. If no task description:
   - Show current project status using \`zscode:status\`
   - List active and pending plans

## ⚠️ IMPORTANT: Planning Only

**This command is for PLANNING ONLY.** After creating a plan:
- Present the plan to the user for review
- Wait for user approval or modifications
- DO NOT automatically start any staging or execute tasks
- User must explicitly use \`zscode:start\` to begin execution

## Available MCP Tools

- \`get_full_context\` - Get complete project state
- \`create_plan\` - Create a new plan with stagings and tasks
- \`zscode:status [planId]\` - Get status of all plans or specific plan

## Execution Commands (NOT part of planning)

These commands are used AFTER planning, when user explicitly requests execution:
- \`zscode:start planId stagingId\` - Start a specific staging
- \`update_task\` - Update task status
- \`save_task_output\` - Save task output/artifacts
- \`get_staging_artifacts\` - Get previous staging outputs
- \`zscode:archive planId\` - Archive a completed/cancelled plan
- \`zscode:cancel planId\` - Cancel an active plan

## Workflow

1. **Plan** (this command): Create and review the plan
2. **User Review**: User reviews and approves the plan
3. **Execute** (separate step): User runs \`zscode:start\` to begin

## ⚠️ CRITICAL: User Consent Required

**NEVER automatically start staging phases.** When a user says things like:
- "플랜을 진행해" / "Continue the plan"
- "다음 단계 진행" / "Next phase"
- "작업 시작해" / "Start working"

You MUST:
1. First show the current status with \`zscode:status\`
2. Present the staging details to the user
3. **Ask for explicit confirmation** before calling \`zscode:start\`
4. Only proceed after user approval

This applies even when resuming work in a new session.
`;
}

/**
 * Create zscode-summary.md slash command
 */
function createSummaryCommand(): string {
  return `# ZSCode Summary

Generate or update the project summary that is automatically injected into context.

## Usage

\`\`\`
/zscode-summary [action]
\`\`\`

## Actions

If no action is specified, generates/updates the project summary.

## What It Does

1. **First Run**: Creates a \`project-summary\` memory containing:
   - Project name and description
   - Goals and constraints
   - Current status (active plans, completed plans, task counts)
   - Active work details (current staging, in-progress tasks)
   - Key rules (high-priority memories)
   - Recent decisions

2. **Subsequent Runs**: Updates the summary with current project state

## Auto-Injection

The project summary is automatically included in:
- \`get_full_context\` responses (along with general memories)
- \`zscode:start\` responses when starting a staging
- \`update_task\` responses when tasks transition to \`in_progress\`

This means the summary acts like a dynamic CLAUDE.md that always reflects current project state.

## MCP Tools

| Tool | Description |
|------|-------------|
| \`generate_summary\` | Create or update the project summary |
| \`get_project_summary\` | View current summary content |
| \`delete_project_summary\` | Remove the summary |

## Custom Content

You can provide custom content instead of auto-generated summary:

\`\`\`
generate_summary:
  customContent: "Your custom project overview here..."
\`\`\`

## Best Practices

1. Run \`/zscode:summary\` at the start of each session to update context
2. Run after completing major plan phases
3. Keep the summary concise - it's included in every context load
4. Use for critical project information that should always be available

ARGUMENTS: $ARGUMENTS
`;
}

/**
 * Create zscode-memory.md slash command
 */
function createMemoryCommand(): string {
  return `# ZSCode Memory

Manage project memories/rules that take precedence over CLAUDE.md.

## Usage

\`\`\`
/zscode-memory [action]
\`\`\`

## Actions

- **list** - Show all active memories
- **add** - Add a new memory (interactive)
- **context [type]** - Get memories for a specific context

## Categories

| Category | Description |
|----------|-------------|
| \`general\` | Always applied to all tasks (before CLAUDE.md) |
| \`planning\` | Applied during planning work |
| \`coding\` | Applied during coding work |
| \`review\` | Applied during code review |
| Custom | Any custom category with tags |

## MCP Tools

| Tool | Description |
|------|-------------|
| \`add_memory\` | Add a memory/rule |
| \`list_memories\` | List memories by category |
| \`update_memory\` | Update a memory |
| \`remove_memory\` | Delete a memory |
| \`get_memories_for_context\` | Get memories for a context |
| \`list_categories\` | List all categories |

## Priority

Memories are applied in priority order (0-100, higher first).
Default priority is 50.

## Examples

### Add a coding rule
\`\`\`
add_memory:
  category: "coding"
  title: "TypeScript Strict Mode"
  content: "Always use strict TypeScript. Never use 'any' type."
  priority: 80
\`\`\`

### Get memories for planning
\`\`\`
get_memories_for_context:
  context: "planning"
\`\`\`

## Auto-Injection

General memories are automatically included in \`get_full_context\` response,
so they are applied before CLAUDE.md rules on every session.
`;
}

/**
 * Create CLAUDE.md content
 */
function createClaudeMd(projectName: string, description: string): string {
  return `# ${projectName}

${description || "Project managed with ZSCode Planning System."}

## ZSCode Commands

This project uses ZSCode Planning System for task management.

### Quick Start

- \`/zscode:planning\` - Enter planning mode
- \`/zscode:planning <task>\` - Create a new plan for the task

### MCP Tools

All commands are available as MCP tools:

| Tool | Description |
|------|-------------|
| \`zscode:start\` | Start a staging phase |
| \`zscode:status\` | Check plan status |
| \`zscode:archive\` | Archive completed plan |
| \`zscode:cancel\` | Cancel active plan |

### Workflow

1. **Plan**: Use \`/zscode:planning\` to create a structured plan
2. **Start**: Begin work with \`zscode:start planId stagingId\`
3. **Execute**: Complete tasks, save outputs for next staging
4. **Review**: Check progress with \`zscode:status\`
5. **Archive**: Clean up with \`zscode:archive\` when done

## Project Structure

\`\`\`
.claude/
├── state.json          # Project state
├── plans/              # Plan artifacts
├── archive/            # Archived plans
└── commands/           # Slash commands
\`\`\`
`;
}

/**
 * Init command handler
 */
export async function initCommand(options: InitOptions): Promise<void> {
  const cwd = process.cwd();
  const claudeDir = getClaudeDir(cwd);

  console.log(chalk.blue.bold("\n  ZSCode Planning System\n"));

  // Check existing configuration
  const spinner = ora("Checking existing configuration...").start();

  const stateExists = await fileExists(getStateFilePath(cwd));
  if (stateExists && !options.force) {
    spinner.fail("ZSCode is already initialized in this project");
    console.log(chalk.yellow("\n  Use --force to overwrite existing configuration\n"));
    return;
  }

  if (stateExists && options.force) {
    spinner.warn("Overwriting existing configuration");
  } else {
    spinner.succeed("Ready to initialize");
  }

  // Get project info
  let projectInfo: ProjectInfo;
  if (options.projectName) {
    projectInfo = { name: options.projectName, description: "" };
  } else {
    projectInfo = await promptProjectInfo(cwd);
  }

  // Create directory structure
  spinner.start("Creating directory structure...");
  try {
    await ensureDir(claudeDir);
    await ensureDir(getPlansDir(cwd));
    await ensureDir(getArchiveDir(cwd));
    await ensureDir(getCommandsDir(cwd));
    spinner.succeed("Directory structure created");
  } catch (error) {
    spinner.fail("Failed to create directory structure");
    console.error(chalk.red(`  Error: ${error}`));
    return;
  }

  // Create state.json
  spinner.start("Creating state.json...");
  try {
    const initialState = createInitialState(projectInfo.name, projectInfo.description);
    await writeFile(
      getStateFilePath(cwd),
      JSON.stringify(initialState, null, 2),
      "utf-8"
    );
    spinner.succeed("state.json created");
  } catch (error) {
    spinner.fail("Failed to create state.json");
    console.error(chalk.red(`  Error: ${error}`));
    return;
  }

  // Create mcp.json
  spinner.start("Creating mcp.json...");
  try {
    const mcpConfig = createMcpConfig();
    await writeFile(
      joinPath(claudeDir, "mcp.json"),
      JSON.stringify(mcpConfig, null, 2),
      "utf-8"
    );
    spinner.succeed("mcp.json created");
  } catch (error) {
    spinner.fail("Failed to create mcp.json");
    console.error(chalk.red(`  Error: ${error}`));
    return;
  }

  // Create slash commands
  spinner.start("Creating slash commands...");
  try {
    const planningCommand = createPlanningCommand();
    const memoryCommand = createMemoryCommand();
    const summaryCommand = createSummaryCommand();
    await writeFile(
      joinPath(getCommandsDir(cwd), "zscode-planning.md"),
      planningCommand,
      "utf-8"
    );
    await writeFile(
      joinPath(getCommandsDir(cwd), "zscode-memory.md"),
      memoryCommand,
      "utf-8"
    );
    await writeFile(
      joinPath(getCommandsDir(cwd), "zscode-summary.md"),
      summaryCommand,
      "utf-8"
    );
    spinner.succeed("Slash commands created");
  } catch (error) {
    spinner.fail("Failed to create slash commands");
    console.error(chalk.red(`  Error: ${error}`));
    return;
  }

  // Create CLAUDE.md (optional)
  if (options.claudeMd !== false) {
    const claudeMdPath = joinPath(cwd, "CLAUDE.md");
    const claudeMdExists = await fileExists(claudeMdPath);

    if (!claudeMdExists || options.force) {
      spinner.start("Creating CLAUDE.md...");
      try {
        const claudeMdContent = createClaudeMd(projectInfo.name, projectInfo.description);
        await writeFile(claudeMdPath, claudeMdContent, "utf-8");
        spinner.succeed("CLAUDE.md created");
      } catch (error) {
        spinner.fail("Failed to create CLAUDE.md");
        console.error(chalk.red(`  Error: ${error}`));
      }
    } else {
      console.log(chalk.gray("  CLAUDE.md already exists, skipping"));
    }
  }

  // Success message
  console.log(chalk.green.bold("\n  ZSCode initialized successfully!\n"));

  console.log(chalk.white("  Next steps:\n"));
  console.log(chalk.gray("  1. Configure MCP server in Claude Code settings:"));
  console.log(chalk.cyan(`     claude mcp add zscode -- npx -y @zeliper/zscode-mcp-server`));
  console.log(chalk.gray("\n  2. Start planning with:"));
  console.log(chalk.cyan("     /zscode:planning\n"));

  console.log(chalk.gray("  Project root: ") + chalk.white(cwd));
  console.log(chalk.gray("  State file:   ") + chalk.white(toPosixPath(getStateFilePath(cwd))));
  console.log();
}
