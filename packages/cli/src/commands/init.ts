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
   - Analyze the task
   - Create a new Plan with appropriate Stagings and Tasks
   - Present the plan for review

2. If no task description:
   - Show current project status using \`zscode:status\`
   - List active and pending plans

## Available MCP Tools

- \`get_full_context\` - Get complete project state
- \`create_plan\` - Create a new plan with stagings and tasks
- \`zscode:start planId stagingId\` - Start a specific staging
- \`zscode:status [planId]\` - Get status of all plans or specific plan
- \`zscode:archive planId\` - Archive a completed/cancelled plan
- \`zscode:cancel planId\` - Cancel an active plan
- \`update_task\` - Update task status
- \`save_task_output\` - Save task output/artifacts
- \`get_staging_artifacts\` - Get previous staging outputs

## Workflow

1. Create a plan: Define stagings (phases) with tasks
2. Start staging: \`zscode:start plan-xxx staging-0001\`
3. Work on tasks: Update status as you complete them
4. Save outputs: Store results for next staging to use
5. Complete: Archive when done
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

  // Create slash command
  spinner.start("Creating slash commands...");
  try {
    const planningCommand = createPlanningCommand();
    await writeFile(
      joinPath(getCommandsDir(cwd), "zscode-planning.md"),
      planningCommand,
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
