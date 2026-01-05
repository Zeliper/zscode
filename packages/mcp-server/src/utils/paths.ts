import { mkdir } from "fs/promises";
import { sep, normalize, join, dirname, isAbsolute } from "path";

/**
 * Normalize path for current OS
 * Windows: uses backslashes
 * Unix: uses forward slashes
 */
export function normalizePath(filePath: string): string {
  return normalize(filePath);
}

/**
 * Convert path to POSIX style (forward slashes)
 * Used for JSON storage and config files for cross-platform compatibility
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
 * Check if path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return isAbsolute(filePath);
}

/**
 * Calculate relative path from base to target
 */
export function relativePath(from: string, to: string): string {
  const normalizedFrom = normalizePath(from);
  const normalizedTo = normalizePath(to);

  if (normalizedTo.startsWith(normalizedFrom)) {
    const relative = normalizedTo.slice(normalizedFrom.length);
    return relative.startsWith(sep) ? relative.slice(1) : relative;
  }

  return normalizedTo;
}

/**
 * Get artifacts path for a staging
 */
export function getArtifactsPath(projectRoot: string, planId: string, stagingId: string): string {
  return normalizePath(join(projectRoot, ".claude", "plans", planId, "artifacts", stagingId));
}

/**
 * Get archive path for a plan
 */
export function getArchivePath(projectRoot: string, planId: string): string {
  return normalizePath(join(projectRoot, ".claude", "archive", planId));
}

/**
 * Get state file path
 */
export function getStateFilePath(projectRoot: string): string {
  return normalizePath(join(projectRoot, ".claude", "state.json"));
}

/**
 * Get plans directory path
 */
export function getPlansDir(projectRoot: string): string {
  return normalizePath(join(projectRoot, ".claude", "plans"));
}

/**
 * Sanitize path component (remove invalid characters)
 */
export function sanitizePathComponent(component: string): string {
  // Remove or replace invalid characters for both Windows and Unix
  return component
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 255); // Max filename length
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
 * Escape path for use in shell commands (Windows compatible)
 */
export function escapeForShell(filePath: string): string {
  if (isWindows()) {
    // Windows: wrap in double quotes if contains spaces
    if (filePath.includes(" ")) {
      return `"${filePath}"`;
    }
    return filePath;
  } else {
    // Unix: escape spaces and special characters
    return filePath.replace(/(["\s'$`\\])/g, "\\$1");
  }
}
