import { z } from "zod";
import {
  StateSchema,
  PlanSchema,
  StagingSchema,
  TaskSchema,
  TaskOutputSchema,
  ProjectSchema,
  HistoryEntrySchema,
  DecisionSchema,
  ContextSchema,
  TaskStatusSchema,
  TaskPrioritySchema,
  StagingStatusSchema,
  PlanStatusSchema,
  ExecutionTypeSchema,
  HistoryEntryTypeSchema,
  CreatePlanInputSchema,
  StartStagingInputSchema,
  StatusInputSchema,
  ArchiveInputSchema,
  CancelInputSchema,
  SaveTaskOutputInputSchema,
  UpdateTaskStatusInputSchema,
} from "./schema.js";

// ============ Core Types ============
export type State = z.infer<typeof StateSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Staging = z.infer<typeof StagingSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskOutput = z.infer<typeof TaskOutputSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Context = z.infer<typeof ContextSchema>;

// ============ Enum Types ============
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type StagingStatus = z.infer<typeof StagingStatusSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type ExecutionType = z.infer<typeof ExecutionTypeSchema>;
export type HistoryEntryType = z.infer<typeof HistoryEntryTypeSchema>;

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

export interface StartStagingResult {
  staging: {
    id: string;
    name: string;
    status: StagingStatus;
    execution_type: ExecutionType;
  };
  executableTasks: TaskDetail[];
  artifactsPath: string;
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
}
