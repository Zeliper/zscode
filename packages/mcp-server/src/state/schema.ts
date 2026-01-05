import { z } from "zod";

// ============ Constants ============
export const STATE_VERSION = "2.0.0" as const;

// ============ ID Patterns ============
const PlanIdPattern = /^plan-[a-z0-9]{8}$/;
const StagingIdPattern = /^staging-[a-z0-9]{4}$/;
const TaskIdPattern = /^task-[a-z0-9]{8}$/;
const MemoryIdPattern = /^mem-[a-z0-9]{8}$/;

// ============ Basic Types ============
export const ISODateStringSchema = z.string().datetime({ offset: true }).or(z.string().datetime());

export const PlanIdSchema = z.string().regex(PlanIdPattern, "Invalid Plan ID format (expected: plan-xxxxxxxx)");
export const StagingIdSchema = z.string().regex(StagingIdPattern, "Invalid Staging ID format (expected: staging-xxxx)");
export const TaskIdSchema = z.string().regex(TaskIdPattern, "Invalid Task ID format (expected: task-xxxxxxxx)");
export const MemoryIdSchema = z.string().regex(MemoryIdPattern, "Invalid Memory ID format (expected: mem-xxxxxxxx)");

// ============ Enums ============
export const TaskStatusSchema = z.enum(["pending", "in_progress", "done", "blocked", "cancelled"]);
export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export const StagingStatusSchema = z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]);
export const PlanStatusSchema = z.enum(["draft", "active", "completed", "archived", "cancelled"]);
export const ExecutionTypeSchema = z.enum(["parallel", "sequential"]);
export const HistoryEntryTypeSchema = z.enum([
  "project_initialized",
  "plan_created",
  "plan_updated",
  "plan_archived",
  "plan_unarchived",
  "plan_cancelled",
  "staging_started",
  "staging_completed",
  "staging_failed",
  "staging_updated",
  "staging_added",
  "staging_removed",
  "task_started",
  "task_completed",
  "task_blocked",
  "task_added",
  "task_removed",
  "task_updated",
  "decision_added",
  "memory_added",
  "memory_updated",
  "memory_removed",
  "session_started",
  "session_ended",
]);

// ============ Task Output Schema ============
// Input schema for tools (completedAt is auto-generated)
export const TaskOutputInputSchema = z.object({
  status: z.enum(["success", "failure", "partial"]),
  summary: z.string(),
  artifacts: z.array(z.string()).default([]),
  data: z.record(z.unknown()).optional(),
  error: z.string().optional(),
});

// Full schema with completedAt (for storage)
export const TaskOutputSchema = z.object({
  status: z.enum(["success", "failure", "partial"]),
  summary: z.string(),
  artifacts: z.array(z.string()).default([]),
  data: z.record(z.unknown()).optional(),
  error: z.string().optional(),
  completedAt: ISODateStringSchema,
});

// ============ Task Schema ============
export const TaskSchema = z.object({
  id: TaskIdSchema,
  planId: PlanIdSchema,
  stagingId: StagingIdSchema,
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  priority: TaskPrioritySchema.default("medium"),
  status: TaskStatusSchema.default("pending"),
  execution_mode: ExecutionTypeSchema.default("parallel"),
  depends_on: z.array(TaskIdSchema).default([]),
  order: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  output: TaskOutputSchema.optional(),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
  startedAt: ISODateStringSchema.optional(),
  completedAt: ISODateStringSchema.optional(),
});

// ============ Staging Schema ============
export const StagingSchema = z.object({
  id: StagingIdSchema,
  planId: PlanIdSchema,
  name: z.string().min(1, "Staging name is required"),
  description: z.string().optional(),
  order: z.number().int().min(0),
  execution_type: ExecutionTypeSchema.default("parallel"),
  status: StagingStatusSchema.default("pending"),
  tasks: z.array(TaskIdSchema).default([]),
  artifacts_path: z.string(),
  createdAt: ISODateStringSchema,
  startedAt: ISODateStringSchema.optional(),
  completedAt: ISODateStringSchema.optional(),
});

// ============ Plan Schema ============
export const PlanSchema = z.object({
  id: PlanIdSchema,
  title: z.string().min(1, "Plan title is required"),
  description: z.string().optional(),
  status: PlanStatusSchema.default("draft"),
  stagings: z.array(StagingIdSchema).default([]),
  currentStagingId: StagingIdSchema.optional(),
  artifacts_root: z.string(),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
  completedAt: ISODateStringSchema.optional(),
  archivedAt: ISODateStringSchema.optional(),
});

// ============ Project Schema ============
export const ProjectSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  goals: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

// ============ History Entry Schema ============
export const HistoryEntrySchema = z.object({
  id: z.string(),
  timestamp: ISODateStringSchema,
  type: HistoryEntryTypeSchema,
  details: z.record(z.unknown()).default({}),
});

// ============ Decision Schema ============
export const DecisionSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  decision: z.string().min(1),
  rationale: z.string().optional(),
  relatedPlanId: PlanIdSchema.optional(),
  relatedStagingId: StagingIdSchema.optional(),
  timestamp: ISODateStringSchema,
});

// ============ Memory Schema ============
// Default categories (can be extended dynamically)
export const DEFAULT_MEMORY_CATEGORIES = ["general", "planning", "coding", "review"] as const;

export const MemorySchema = z.object({
  id: MemoryIdSchema,
  category: z.string().min(1), // Dynamic category support
  title: z.string().min(1, "Memory title is required"),
  content: z.string().min(1, "Memory content is required"),
  tags: z.array(z.string()).default([]),
  priority: z.number().int().min(0).max(100).default(50), // Higher = applied first
  enabled: z.boolean().default(true),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

// ============ Context Schema ============
export const ContextSchema = z.object({
  lastUpdated: ISODateStringSchema,
  activeFiles: z.array(z.string()).default([]),
  currentPlanId: PlanIdSchema.optional(),
  currentStagingId: StagingIdSchema.optional(),
  decisions: z.array(DecisionSchema).default([]),
  memories: z.array(MemorySchema).default([]), // Memory/Rule storage
  sessionSummary: z.string().optional(),
});

// ============ Full State Schema ============
export const StateSchema = z.object({
  version: z.literal(STATE_VERSION),
  project: ProjectSchema,
  plans: z.record(PlanIdSchema, PlanSchema).default({}),
  stagings: z.record(StagingIdSchema, StagingSchema).default({}),
  tasks: z.record(TaskIdSchema, TaskSchema).default({}),
  history: z.array(HistoryEntrySchema).default([]),
  context: ContextSchema,
});

// ============ Input Schemas for Tools ============
export const CreatePlanInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  stagings: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    execution_type: ExecutionTypeSchema.default("parallel"),
    tasks: z.array(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      priority: TaskPrioritySchema.default("medium"),
      execution_mode: ExecutionTypeSchema.default("parallel"),
      depends_on_index: z.array(z.number().int().min(0)).default([]),
    })),
  })),
});

export const StartStagingInputSchema = z.object({
  planId: z.string(),
  stagingId: z.string(),
});

export const StatusInputSchema = z.object({
  planId: z.string().optional(),
});

export const ArchiveInputSchema = z.object({
  planId: z.string(),
  reason: z.string().optional(),
});

export const CancelInputSchema = z.object({
  planId: z.string(),
  reason: z.string().optional(),
  archiveImmediately: z.boolean().default(false),
});

export const SaveTaskOutputInputSchema = z.object({
  planId: z.string(),
  stagingId: z.string(),
  taskId: z.string(),
  output: TaskOutputSchema,
});

export const UpdateTaskStatusInputSchema = z.object({
  taskId: z.string(),
  status: TaskStatusSchema,
  notes: z.string().optional(),
});
