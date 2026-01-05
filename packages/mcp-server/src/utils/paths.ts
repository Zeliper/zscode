import { mkdir, writeFile, rename, unlink } from "fs/promises";
import { sep, normalize, join, dirname, isAbsolute, resolve } from "path";
import { randomBytes } from "crypto";

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

// ============ Security Functions ============

/**
 * Check if a target path is safely within the base directory
 * Prevents path traversal attacks (e.g., ../../../etc/passwd)
 * @param basePath - The allowed base directory
 * @param targetPath - The path to validate
 * @returns true if targetPath is within basePath
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const resolvedBase = resolve(normalize(basePath));
  const resolvedTarget = resolve(normalize(targetPath));

  // Ensure the target starts with the base path
  // Add separator to prevent partial matches (e.g., /base123 matching /base)
  return resolvedTarget === resolvedBase ||
         resolvedTarget.startsWith(resolvedBase + sep);
}

/**
 * Validate that a path component doesn't contain traversal sequences
 * @param component - A single path component (e.g., filename or directory name)
 * @returns true if the component is safe
 */
export function isSafePathComponent(component: string): boolean {
  // Check for path traversal patterns
  if (component === "." || component === "..") {
    return false;
  }
  // Check for traversal sequences
  if (component.includes("..") || component.includes("/") || component.includes("\\")) {
    return false;
  }
  // Check for null bytes (can be used to truncate paths)
  if (component.includes("\0")) {
    return false;
  }
  return true;
}

/**
 * Validate an ID to ensure it doesn't contain malicious characters
 * @param id - The ID to validate
 * @returns true if the ID is safe to use in file paths
 */
export function isValidId(id: string): boolean {
  // IDs should only contain alphanumeric characters and hyphens
  return /^[a-zA-Z0-9-]+$/.test(id);
}

// ============ Atomic File Operations ============

/**
 * Write file atomically by writing to a temp file first, then renaming
 * This prevents data corruption if the write is interrupted
 * @param filePath - Target file path
 * @param content - Content to write
 * @param encoding - File encoding (default: utf-8)
 */
export async function atomicWriteFile(
  filePath: string,
  content: string,
  encoding: BufferEncoding = "utf-8"
): Promise<void> {
  const normalizedPath = normalizePath(filePath);
  const dirPath = dirname(normalizedPath);
  const tempPath = normalizedPath + `.tmp.${randomBytes(8).toString("hex")}`;

  await ensureDir(dirPath);

  try {
    // Write to temp file
    await writeFile(tempPath, content, encoding);
    // Atomic rename
    await rename(tempPath, normalizedPath);
  } catch (error) {
    // Clean up temp file if it exists
    try {
      await unlink(tempPath);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ============ Secure ID Generation ============

/**
 * Generate a cryptographically secure random ID
 * @param length - Length of the random part
 * @returns Random alphanumeric string
 */
export function generateSecureId(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let result = "";

  for (let i = 0; i < length; i++) {
    // Use modulo to map byte value to character set
    result += chars[bytes[i]! % chars.length];
  }

  return result;
}
