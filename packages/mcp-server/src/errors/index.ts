/**
 * Base error class for ZSCode
 */
export class ZSCodeError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, code: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ZSCodeError";
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * State-related errors
 */
export class StateError extends ZSCodeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "STATE_ERROR", details);
    this.name = "StateError";
  }
}

export class StateNotFoundError extends StateError {
  constructor(projectRoot: string) {
    super(`state.json not found at ${projectRoot}/.claude/state.json`, {
      projectRoot,
      suggestion: "Run 'npx zscode init' to initialize the project",
    });
    this.name = "StateNotFoundError";
  }
}

export class StateValidationError extends StateError {
  constructor(validationErrors: unknown[]) {
    super("state.json validation failed", { validationErrors });
    this.name = "StateValidationError";
  }
}

export class ProjectNotInitializedError extends StateError {
  constructor() {
    super("Project not initialized", {
      suggestion: "Run 'npx zscode init' to initialize the project",
    });
    this.name = "ProjectNotInitializedError";
  }
}

/**
 * Plan-related errors
 */
export class PlanError extends ZSCodeError {
  public readonly planId: string;

  constructor(message: string, planId: string, details?: Record<string, unknown>) {
    super(message, "PLAN_ERROR", { planId, ...details });
    this.name = "PlanError";
    this.planId = planId;
  }
}

export class PlanNotFoundError extends PlanError {
  constructor(planId: string) {
    super(`Plan not found: ${planId}`, planId, {
      suggestion: "Use 'zscode:status' to see available plans",
    });
    this.name = "PlanNotFoundError";
  }
}

export class PlanInvalidStateError extends PlanError {
  constructor(planId: string, currentState: string, expectedStates: string[]) {
    super(
      `Plan ${planId} is in '${currentState}' state, expected one of: ${expectedStates.join(", ")}`,
      planId,
      { currentState, expectedStates }
    );
    this.name = "PlanInvalidStateError";
  }
}

export class PlanAlreadyExistsError extends PlanError {
  constructor(planId: string) {
    super(`Plan already exists: ${planId}`, planId);
    this.name = "PlanAlreadyExistsError";
  }
}

/**
 * Staging-related errors
 */
export class StagingError extends ZSCodeError {
  public readonly stagingId: string;

  constructor(message: string, stagingId: string, details?: Record<string, unknown>) {
    super(message, "STAGING_ERROR", { stagingId, ...details });
    this.name = "StagingError";
    this.stagingId = stagingId;
  }
}

export class StagingNotFoundError extends StagingError {
  constructor(stagingId: string) {
    super(`Staging not found: ${stagingId}`, stagingId);
    this.name = "StagingNotFoundError";
  }
}

export class StagingOrderError extends StagingError {
  constructor(stagingId: string, previousStagingId: string) {
    super(
      `Cannot start staging ${stagingId}: previous staging ${previousStagingId} is not completed`,
      stagingId,
      {
        previousStagingId,
        suggestion: "Complete the previous staging first or use 'zscode:cancel' to skip",
      }
    );
    this.name = "StagingOrderError";
  }
}

export class StagingInvalidStateError extends StagingError {
  constructor(stagingId: string, currentState: string, expectedStates: string[]) {
    super(
      `Staging ${stagingId} is in '${currentState}' state, expected one of: ${expectedStates.join(", ")}`,
      stagingId,
      { currentState, expectedStates }
    );
    this.name = "StagingInvalidStateError";
  }
}

export class StagingPlanMismatchError extends StagingError {
  constructor(stagingId: string, expectedPlanId: string, actualPlanId: string) {
    super(
      `Staging ${stagingId} does not belong to plan ${expectedPlanId}`,
      stagingId,
      { expectedPlanId, actualPlanId }
    );
    this.name = "StagingPlanMismatchError";
  }
}

/**
 * Task-related errors
 */
export class TaskError extends ZSCodeError {
  public readonly taskId: string;

  constructor(message: string, taskId: string, details?: Record<string, unknown>) {
    super(message, "TASK_ERROR", { taskId, ...details });
    this.name = "TaskError";
    this.taskId = taskId;
  }
}

export class TaskNotFoundError extends TaskError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`, taskId);
    this.name = "TaskNotFoundError";
  }
}

export class TaskInvalidStateError extends TaskError {
  constructor(taskId: string, currentState: string, expectedStates: string[]) {
    super(
      `Task ${taskId} is in '${currentState}' state, expected one of: ${expectedStates.join(", ")}`,
      taskId,
      { currentState, expectedStates }
    );
    this.name = "TaskInvalidStateError";
  }
}

export class TaskDependencyError extends TaskError {
  constructor(taskId: string, unmetDependencies: string[]) {
    super(
      `Task ${taskId} has unmet dependencies: ${unmetDependencies.join(", ")}`,
      taskId,
      { unmetDependencies }
    );
    this.name = "TaskDependencyError";
  }
}


export class TaskStateTransitionError extends TaskError {
  constructor(taskId: string, fromState: string, toState: string, allowedTransitions: string[]) {
    super(
      `Invalid state transition for task ${taskId}: ${fromState} -> ${toState}. Allowed: ${allowedTransitions.join(", ")}`,
      taskId,
      { fromState, toState, allowedTransitions }
    );
    this.name = "TaskStateTransitionError";
  }
}

export class CircularDependencyError extends TaskError {
  constructor(taskId: string, dependencyChain: string[]) {
    super(
      `Circular dependency detected for task ${taskId}: ${dependencyChain.join(" -> ")}`,
      taskId,
      { dependencyChain }
    );
    this.name = "CircularDependencyError";
  }
}

/**
 * File system errors
 */
export class FileSystemError extends ZSCodeError {
  constructor(operation: string, path: string, originalError?: Error) {
    super(
      `File system error during ${operation}: ${path}`,
      "FS_ERROR",
      {
        operation,
        path,
        originalError: originalError?.message,
      }
    );
    this.name = "FileSystemError";
  }
}

/**
 * Validation errors
 */
export class ValidationError extends ZSCodeError {
  constructor(message: string, field?: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", { field, ...details });
    this.name = "ValidationError";
  }
}

/**
 * Security errors
 */
export class SecurityError extends ZSCodeError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "SECURITY_ERROR", details);
    this.name = "SecurityError";
  }
}

export class PathTraversalError extends SecurityError {
  constructor(path: string) {
    super("Invalid path: potential path traversal detected", { path });
    this.name = "PathTraversalError";
  }
}

export class InvalidIdError extends SecurityError {
  constructor(id: string, idType: string) {
    super(`Invalid ${idType} ID format: ${id}`, { id, idType });
    this.name = "InvalidIdError";
  }
}

/**
 * Memory-related errors
 */
export class MemoryError extends ZSCodeError {
  public readonly memoryId: string;

  constructor(message: string, memoryId: string, details?: Record<string, unknown>) {
    super(message, "MEMORY_ERROR", { memoryId, ...details });
    this.name = "MemoryError";
    this.memoryId = memoryId;
  }
}

export class MemoryNotFoundError extends MemoryError {
  constructor(memoryId: string) {
    super(`Memory not found: ${memoryId}`, memoryId);
    this.name = "MemoryNotFoundError";
  }
}

/**
 * Get suggestion for error
 */
export function getSuggestion(error: ZSCodeError): string | undefined {
  const details = error.details;
  if (details && typeof details.suggestion === "string") {
    return details.suggestion;
  }

  switch (error.name) {
    case "StateNotFoundError":
    case "ProjectNotInitializedError":
      return "Run 'npx zscode init' to initialize the project";
    case "PlanNotFoundError":
      return "Use 'zscode:status' to see available plans";
    case "StagingOrderError":
      return "Complete the previous staging first or use 'zscode:cancel' to skip";
    default:
      return undefined;
  }
}

/**
 * Error handler wrapper for tools
 */
export interface ToolErrorResult {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
  };
}

export function createToolErrorResult(error: unknown): ToolErrorResult {
  if (error instanceof ZSCodeError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        suggestion: getSuggestion(error),
      },
    };
  }

  // Unknown error
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    error: {
      code: "UNEXPECTED_ERROR",
      message: `Unexpected error: ${message}`,
      details: { originalError: String(error) },
    },
  };
}

/**
 * Async wrapper for tool handlers with error handling
 */
export async function withErrorHandling<T>(
  operation: () => Promise<T>,
  context: string
): Promise<{ success: true; data: T } | ToolErrorResult> {
  try {
    const data = await operation();
    return { success: true, data };
  } catch (error) {
    console.error(`[${context}] Error:`, error);
    return createToolErrorResult(error);
  }
}
