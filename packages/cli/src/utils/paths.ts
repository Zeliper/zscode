import { mkdir, access } from "fs/promises";
import { sep, normalize, join, dirname, basename, isAbsolute } from "path";
import { constants } from "fs";

/**
 * Normalize path for current OS
 */
export function normalizePath(filePath: string): string {
  return normalize(filePath);
}

/**
 * Convert path to POSIX style (forward slashes)
 */
export function toPosixPath(filePath: string): string {
  return filePath.split(sep).join("/");
}

/**
 * Convert POSIX path to OS-specific path
 */
export function fromPosixPath(posixPath: string): string {
  return posixPath.split("/").join(sep);
}

/**
 * Create directory recursively
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

/**
 * Join paths and normalize for current OS
 */
export function joinPath(...paths: string[]): string {
  return normalizePath(join(...paths));
}

/**
 * Get directory name from path
 */
export function getDirname(filePath: string): string {
  return dirname(filePath);
}

/**
 * Get file name from path
 */
export function getBasename(filePath: string): string {
  return basename(filePath);
}

/**
 * Check if path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return isAbsolute(filePath);
}

/**
 * Check if file exists
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if directory exists
 */
export async function dirExists(dirPath: string): Promise<boolean> {
  try {
    await access(dirPath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the .claude directory path
 */
export function getClaudeDir(projectRoot: string): string {
  return joinPath(projectRoot, ".claude");
}

/**
 * Get the state.json path
 */
export function getStateFilePath(projectRoot: string): string {
  return joinPath(projectRoot, ".claude", "state.json");
}

/**
 * Get the plans directory path
 */
export function getPlansDir(projectRoot: string): string {
  return joinPath(projectRoot, ".claude", "plans");
}

/**
 * Get the archive directory path
 */
export function getArchiveDir(projectRoot: string): string {
  return joinPath(projectRoot, ".claude", "archive");
}

/**
 * Get the commands directory path
 */
export function getCommandsDir(projectRoot: string): string {
  return joinPath(projectRoot, ".claude", "commands");
}

/**
 * Check if running on Windows
 */
export function isWindows(): boolean {
  return process.platform === "win32";
}

/**
 * Get path separator for current OS
 */
export function getPathSeparator(): string {
  return sep;
}

/**
 * Sanitize path component (remove invalid characters)
 */
export function sanitizePathComponent(component: string): string {
  return component
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 255);
}

/**
 * Escape path for JSON (double backslashes on Windows)
 */
export function escapeForJson(filePath: string): string {
  if (isWindows()) {
    return filePath.replace(/\\/g, "\\\\");
  }
  return filePath;
}
