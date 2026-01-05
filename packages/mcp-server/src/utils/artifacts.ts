import { readFile, writeFile, readdir, access, rm, cp, stat } from "fs/promises";
import { constants } from "fs";
import { join } from "path";
import { ensureDir, normalizePath, toPosixPath, getArtifactsPath, getArchivePath } from "./paths.js";
import type { TaskOutput } from "../state/types.js";

/**
 * Artifacts manager for handling staging outputs
 */
export class ArtifactsManager {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = normalizePath(projectRoot);
  }

  /**
   * Create artifacts directory for a staging
   */
  async createStagingArtifactsDir(planId: string, stagingId: string): Promise<string> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);
    await ensureDir(artifactsPath);
    return artifactsPath;
  }

  /**
   * Save task output to artifacts directory
   */
  async saveTaskOutput(
    planId: string,
    stagingId: string,
    taskId: string,
    output: TaskOutput
  ): Promise<string> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);
    await ensureDir(artifactsPath);

    const outputPath = normalizePath(join(artifactsPath, `${taskId}-output.json`));
    await writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");

    return toPosixPath(outputPath);
  }

  /**
   * Get task output from artifacts directory
   */
  async getTaskOutput(planId: string, stagingId: string, taskId: string): Promise<TaskOutput | null> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);
    const outputPath = normalizePath(join(artifactsPath, `${taskId}-output.json`));

    try {
      await access(outputPath, constants.R_OK);
      const content = await readFile(outputPath, "utf-8");
      return JSON.parse(content) as TaskOutput;
    } catch {
      return null;
    }
  }

  /**
   * Get all task outputs for a staging
   */
  async getStagingOutputs(planId: string, stagingId: string): Promise<Record<string, TaskOutput>> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);
    const outputs: Record<string, TaskOutput> = {};

    try {
      await access(artifactsPath, constants.R_OK);
      const files = await readdir(artifactsPath);

      for (const file of files) {
        if (file.endsWith("-output.json")) {
          const taskId = file.replace("-output.json", "");
          const content = await readFile(normalizePath(join(artifactsPath, file)), "utf-8");
          outputs[taskId] = JSON.parse(content) as TaskOutput;
        }
      }
    } catch {
      // Directory doesn't exist or is empty
    }

    return outputs;
  }

  /**
   * List all files in staging artifacts directory
   */
  async listStagingArtifacts(planId: string, stagingId: string): Promise<string[]> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);

    try {
      await access(artifactsPath, constants.R_OK);
      const files = await readdir(artifactsPath, { recursive: true });
      return files.map(f => toPosixPath(String(f)));
    } catch {
      return [];
    }
  }

  /**
   * Save arbitrary file to staging artifacts
   */
  async saveArtifactFile(
    planId: string,
    stagingId: string,
    filename: string,
    content: string | Buffer
  ): Promise<string> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);
    await ensureDir(artifactsPath);

    const filePath = normalizePath(join(artifactsPath, filename));
    await writeFile(filePath, content, typeof content === "string" ? "utf-8" : undefined);

    return toPosixPath(filePath);
  }

  /**
   * Read arbitrary file from staging artifacts
   */
  async readArtifactFile(planId: string, stagingId: string, filename: string): Promise<string | null> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);
    const filePath = normalizePath(join(artifactsPath, filename));

    try {
      await access(filePath, constants.R_OK);
      return await readFile(filePath, "utf-8");
    } catch {
      return null;
    }
  }

  /**
   * Archive plan artifacts
   */
  async archivePlanArtifacts(planId: string): Promise<string> {
    const sourcePath = normalizePath(join(this.projectRoot, ".claude", "plans", planId));
    const archivePath = getArchivePath(this.projectRoot, planId);

    try {
      await access(sourcePath, constants.R_OK);
      await ensureDir(normalizePath(join(this.projectRoot, ".claude", "archive")));
      await cp(sourcePath, archivePath, { recursive: true });
      await rm(sourcePath, { recursive: true, force: true });
    } catch (error) {
      // Source might not exist if no artifacts were created
      console.error(`Failed to archive artifacts: ${error}`);
    }

    return toPosixPath(archivePath);
  }

  /**
   * Delete plan artifacts (use with caution)
   */
  async deletePlanArtifacts(planId: string): Promise<void> {
    const planPath = normalizePath(join(this.projectRoot, ".claude", "plans", planId));

    try {
      await access(planPath, constants.R_OK);
      await rm(planPath, { recursive: true, force: true });
    } catch {
      // Already deleted or never existed
    }
  }

  /**
   * Get total size of staging artifacts
   */
  async getStagingArtifactsSize(planId: string, stagingId: string): Promise<number> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);
    let totalSize = 0;

    try {
      await access(artifactsPath, constants.R_OK);
      const files = await readdir(artifactsPath, { recursive: true, withFileTypes: true });

      for (const file of files) {
        if (file.isFile()) {
          const filePath = normalizePath(join(String(file.parentPath || file.path), file.name));
          const stats = await stat(filePath);
          totalSize += stats.size;
        }
      }
    } catch {
      // Directory doesn't exist
    }

    return totalSize;
  }

  /**
   * Check if staging has artifacts
   */
  async hasStagingArtifacts(planId: string, stagingId: string): Promise<boolean> {
    const artifactsPath = getArtifactsPath(this.projectRoot, planId, stagingId);

    try {
      await access(artifactsPath, constants.R_OK);
      const files = await readdir(artifactsPath);
      return files.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * Create artifacts manager instance
 */
export function createArtifactsManager(projectRoot: string): ArtifactsManager {
  return new ArtifactsManager(projectRoot);
}
