#!/usr/bin/env node
import { Command } from "commander";
import { initCommand, type InitOptions } from "./commands/init.js";

const VERSION = "1.0.0";

const program = new Command();

program
  .name("zscode")
  .description("ZSCode Planning System CLI - Claude Code project management plugin")
  .version(VERSION);

program
  .command("init")
  .description("Initialize ZSCode Planning System in the current project")
  .option("-f, --force", "Overwrite existing configuration", false)
  .option("--no-claude-md", "Skip creating CLAUDE.md file")
  .option("-p, --project-name <name>", "Set project name (skip prompt)")
  .action(async (options: InitOptions) => {
    try {
      await initCommand(options);
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

program
  .command("version")
  .description("Show version information")
  .action(() => {
    console.log(`ZSCode CLI v${VERSION}`);
  });

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
