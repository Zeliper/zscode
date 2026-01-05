import { z } from "zod";
import {
  StateSchema,
  PlanSchema,
  StagingSchema,
  TaskSchema,
  TaskOutputSchema,
  TaskOutputInputSchema,
  ProjectSchema,
  HistoryEntrySchema,
  DecisionSchema,
  MemorySchema,
  ContextSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  StagingStatusSchema,
  PlanStatusSchema,
  ExecutionTypeSchema,
  HistoryEntryTypeSchema,
  // New model and session schemas
  ModelTypeSchema,
  SessionBudgetSchema,
  CreatePlanInputSchema,
  StartStagingInputSchema,
  StatusInputSchema,
  ArchiveInputSchema,
  CancelInputSchema,
  SaveTaskOutputInputSchema,
  UpdateTaskStatusInputSchema,
  // Cross-reference schemas
  CrossStagingRefSchema,
  CrossTaskRefSchema,
  CrossStagingTaskRefInputSchema,
  STATE_VERSION,
} from "./schema.js";

// Re-export constant for convenience
export { STATE_VERSION };

// ============ Core Types ============
export type State = z.infer<typeof StateSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Staging = z.infer<typeof StagingSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskOutput = z.infer<typeof TaskOutputSchema>;
export type TaskOutputInput = z.infer<typeof TaskOutputInputSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type Context = z.infer<typeof ContextSchema>;

// ============ Cross-Reference Types ============
export type CrossStagingRef = z.infer<typeof CrossStagingRefSchema>;
export type CrossTaskRef = z.infer<typeof CrossTaskRefSchema>;
export type CrossStagingTaskRefInput = z.infer<typeof CrossStagingTaskRefInputSchema>;

// ============ Enum Types ============
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type StagingStatus = z.infer<typeof StagingStatusSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type ExecutionType = z.infer<typeof ExecutionTypeSchema>;
export type HistoryEntryType = z.infer<typeof HistoryEntryTypeSchema>;
// Model and session types for context optimization
export type ModelType = z.infer<typeof ModelTypeSchema>;
export type SessionBudget = z.infer<typeof SessionBudgetSchema>;

// ============ Input Types ============
export type CreatePlanInput = z.infer<typeof CreatePlanInputSchema>;
export type StartStagingInput = z.infer<typeof StartStagingInputSchema>;
export type StatusInput = z.infer<typeof StatusInputSchema>;
export type ArchiveInput = z.infer<typeof ArchiveInputSchema>;
export type CancelInput = z.infer<typeof CancelInputSchema>;
export type SaveTaskOutputInput = z.infer<typeof SaveTaskOutputInputSchema>;
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>;

// ============ Output Types ============
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    suggestion?: string;
  };
}

export interface PlanSummary {
  id: string;
  title: string;
  status: PlanStatus;
  progress: {
    totalStagings: number;
    completedStagings: number;
    totalTasks: number;
    completedTasks: number;
    percentage: number;
  };
  currentStaging?: {
    id: string;
    name: string;
    status: StagingStatus;
  };
}

export interface StatusOverview {
  totalPlans: number;
  activePlans: number;
  completedPlans: number;
  archivedPlans: number;
  cancelledPlans: number;
}

export interface StagingDetail {
  id: string;
  name: string;
  order: number;
  status: StagingStatus;
  execution_type: ExecutionType;
  taskCount: number;
  completedTaskCount: number;
  tasks: TaskDetail[];
}

export interface TaskDetail {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  execution_mode: ExecutionType;
  model?: ModelType;
  depends_on: string[];
  hasOutput: boolean;
}

export interface PlanDetail {
  id: string;
  title: string;
  description?: string;
  status: PlanStatus;
  stagings: StagingDetail[];
  decisions: Decision[];
  createdAt: string;
  updatedAt: string;
}

export interface SessionGuidance {
  budget: SessionBudget | "unspecified";
  recommendedSessions: number | null;
  message: string;
}

export interface StartStagingResult {
  staging: {
    id: string;
    name: string;
    status: StagingStatus;
    execution_type: ExecutionType;
    default_model?: ModelType;
    session_budget?: SessionBudget;
    recommended_sessions?: number;
  };
  executableTasks: TaskDetail[];
  artifactsPath: string;
  sessionGuidance?: SessionGuidance;
}

export interface ArchiveResult {
  planId: string;
  archivePath: string;
  archivedAt: string;
}

export interface CancelResult {
  planId: string;
  affectedStagings: number;
  affectedTasks: number;
  archived: boolean;
  archivePath?: string;
}

// ============ ID Generation Types ============
export interface IdGenerator {
  generatePlanId(): string;
  generateStagingId(): string;
  generateTaskId(): string;
  generateHistoryId(): string;
  generateDecisionId(): string;
  generateMemoryId(): string;
}

// ============ Memory Event Types ============
export type MemoryEventType =
  | "staging-start"
  | "task-start"
  | "task-complete"
  | "staging-complete"
  | "plan-complete";

// ============ Cross-Reference Output Types ============
export interface RelatedStagingArtifacts {
  stagingId: string;
  stagingName: string;
  taskOutputs: Record<string, TaskOutput>;
}

export interface CrossReferencedTaskOutput {
  taskId: string;
  taskTitle: string;
  stagingId: string;
  output: TaskOutput | null;
}

export interface TaskStartContext {
  event: "task-start";
  memories: Memory[];
  crossReferencedOutputs: CrossReferencedTaskOutput[];
}

export interface TaskCompleteContext {
  event: "task-complete";
  memories: Memory[];
}

export interface StagingStartContext {
  relatedArtifacts: RelatedStagingArtifacts[];
  appliedMemories: Memory[];
  // appliedMemoriesText removed to reduce context duplication
}

export type TaskContext = TaskStartContext | TaskCompleteContext;
