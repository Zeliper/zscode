import { z } from "zod";

// ============ Constants ============
export const STATE_VERSION = "2.0.0" as const;

// ============ ID Patterns ============
const PlanIdPattern = /^plan-[a-z0-9]{8}$/;
const StagingIdPattern = /^staging-[a-z0-9]{4}$/;
const TaskIdPattern = /^task-[a-z0-9]{8}$/;
const MemoryIdPattern = /^mem-[a-z0-9]{8}$/;
const TemplateIdPattern = /^tpl-[a-z0-9]{8}$/;
const SnapshotIdPattern = /^snap-[a-z0-9]{8}$/;

// ============ Basic Types ============
export const ISODateStringSchema = z.string().datetime({ offset: true }).or(z.string().datetime());

export const PlanIdSchema = z.string().regex(PlanIdPattern, "Invalid Plan ID format (expected: plan-xxxxxxxx)");
export const StagingIdSchema = z.string().regex(StagingIdPattern, "Invalid Staging ID format (expected: staging-xxxx)");
export const TaskIdSchema = z.string().regex(TaskIdPattern, "Invalid Task ID format (expected: task-xxxxxxxx)");
export const MemoryIdSchema = z.string().regex(MemoryIdPattern, "Invalid Memory ID format (expected: mem-xxxxxxxx)");
export const TemplateIdSchema = z.string().regex(TemplateIdPattern, "Invalid Template ID format (expected: tpl-xxxxxxxx)");
export const SnapshotIdSchema = z.string().regex(SnapshotIdPattern, "Invalid Snapshot ID format (expected: snap-xxxxxxxx)");

// ============ Enums ============
export const TaskStatusSchema = z.enum(["pending", "in_progress", "done", "blocked", "cancelled"]);
export const TaskPrioritySchema = z.enum(["high", "medium", "low"]);
export const StagingStatusSchema = z.enum(["pending", "in_progress", "completed", "failed", "cancelled"]);
export const PlanStatusSchema = z.enum(["draft", "active", "completed", "archived", "cancelled"]);
export const ExecutionTypeSchema = z.enum(["parallel", "sequential"]);
// Model selection for tasks (opus=complex, sonnet=balanced, haiku=fast)
export const ModelTypeSchema = z.enum(["opus", "sonnet", "haiku"]);
// Session budget for staging context management
export const SessionBudgetSchema = z.enum(["minimal", "standard", "extensive"]);
export const HistoryEntryTypeSchema = z.enum([
  "project_initialized",
  "project_updated",
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
  // Template events
  "template_created",
  "template_updated",
  "template_removed",
  "template_applied",
  // Snapshot events
  "snapshot_created",
  "snapshot_restored",
  "snapshot_removed",
]);

// ============ Cross-Reference Schemas ============
// Cross-Staging Reference: Reference to another staging's artifacts
export const CrossStagingRefSchema = z.object({
  stagingId: StagingIdSchema,
  taskIds: z.array(TaskIdSchema).optional(), // If undefined, include all tasks from staging
});

// Cross-Task Reference: Reference to a task in another staging
export const CrossTaskRefSchema = z.object({
  taskId: TaskIdSchema,
  stagingId: StagingIdSchema,
});

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
  // Model to use for this task (overrides staging default_model)
  model: ModelTypeSchema.optional(),
  depends_on: z.array(TaskIdSchema).default([]),
  // Cross-staging task references (for accessing outputs from other stagings)
  cross_staging_refs: z.array(CrossTaskRefSchema).default([]),
  // Memory tags for context-specific memory lookup on task start
  memory_tags: z.array(z.string()).default([]),
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
  // Default model for tasks in this staging (tasks can override)
  default_model: ModelTypeSchema.optional(),
  // Session budget for context management
  session_budget: SessionBudgetSchema.optional(),
  // Recommended number of sessions (0.5, 1, 2, etc.)
  recommended_sessions: z.number().min(0.5).max(10).optional(),
  tasks: z.array(TaskIdSchema).default([]),
  // Cross-staging dependencies (for including artifacts from dependent stagings)
  depends_on_stagings: z.array(CrossStagingRefSchema).default([]),
  // Auto-include artifacts from dependent stagings on start
  auto_include_artifacts: z.boolean().default(true),
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
export const DEFAULT_MEMORY_CATEGORIES = [
  "general",           // Always applied
  "planning",          // During planning phase
  "coding",            // During coding phase
  "review",            // During review phase
  // Event-based categories for automatic context injection
  "staging-start",     // Applied when staging starts
  "task-start",        // Applied when task starts (status -> in_progress)
  "task-complete",     // Applied when task completes (status -> done)
  "staging-complete",  // Applied when staging completes
  "plan-complete",     // Applied when plan completes
  // Project-level summary category
  "project-summary",   // Auto-generated project summary (always applied with general)
] as const;

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

// ============ Template Schema ============
// Template categories for organizing templates
export const TemplateCategorySchema = z.enum([
  "feature",      // New feature development
  "bugfix",       // Bug fix workflows
  "refactoring",  // Code refactoring
  "review",       // Code review process
  "deployment",   // Deployment workflows
  "testing",      // Testing workflows
  "custom",       // User-defined templates
]);

// Task definition within a template (no IDs, just structure)
export const TemplateTaskDefSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  priority: TaskPrioritySchema.default("medium"),
  execution_mode: ExecutionTypeSchema.default("parallel"),
  model: ModelTypeSchema.optional(),
  // Dependencies by index within the same staging
  depends_on_index: z.array(z.number().int().min(0)).default([]),
  // Memory tags for context-specific memory lookup
  memory_tags: z.array(z.string()).default([]),
});

// Staging definition within a template (no IDs, just structure)
export const TemplateStagingDefSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  execution_type: ExecutionTypeSchema.default("parallel"),
  default_model: ModelTypeSchema.optional(),
  session_budget: SessionBudgetSchema.optional(),
  recommended_sessions: z.number().min(0.5).max(10).optional(),
  tasks: z.array(TemplateTaskDefSchema).default([]),
});

// Full template schema
export const TemplateSchema = z.object({
  id: TemplateIdSchema,
  name: z.string().min(1, "Template name is required"),
  description: z.string().optional(),
  category: TemplateCategorySchema.default("custom"),
  // Tags for searchability
  tags: z.array(z.string()).default([]),
  // Template content - staging definitions
  stagings: z.array(TemplateStagingDefSchema).default([]),
  // Variables that can be replaced when applying template
  variables: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    defaultValue: z.string().optional(),
    required: z.boolean().default(false),
  })).default([]),
  // Usage statistics
  usageCount: z.number().int().min(0).default(0),
  lastUsedAt: ISODateStringSchema.optional(),
  // Built-in templates cannot be removed
  isBuiltIn: z.boolean().default(false),
  createdAt: ISODateStringSchema,
  updatedAt: ISODateStringSchema,
});

// ============ Snapshot Schema ============
// Snapshot types for different levels of state capture
export const SnapshotTypeSchema = z.enum([
  "full",       // Full state snapshot (all plans, stagings, tasks)
  "plan",       // Single plan with its stagings and tasks
  "staging",    // Single staging with its tasks
]);

// Snapshot creation trigger
export const SnapshotTriggerSchema = z.enum([
  "manual",       // User-initiated snapshot
  "auto",         // Auto-created (before destructive operations)
  "checkpoint",   // Periodic checkpoint
  "milestone",    // Milestone completion
]);

// Snapshot data - stores the actual state data
export const SnapshotDataSchema = z.object({
  // Plan data (for plan/full snapshots)
  plans: z.record(PlanIdSchema, PlanSchema).optional(),
  // Staging data
  stagings: z.record(StagingIdSchema, StagingSchema).optional(),
  // Task data
  tasks: z.record(TaskIdSchema, TaskSchema).optional(),
  // Template data (for full snapshots)
  templates: z.record(TemplateIdSchema, TemplateSchema).optional(),
  // Memory data (for full snapshots)
  memories: z.array(MemorySchema).optional(),
});

// Full snapshot schema
export const SnapshotSchema = z.object({
  id: SnapshotIdSchema,
  name: z.string().min(1, "Snapshot name is required"),
  description: z.string().optional(),
  // Snapshot type
  type: SnapshotTypeSchema,
  // Trigger that created this snapshot
  trigger: SnapshotTriggerSchema.default("manual"),
  // Reference to specific plan (for plan/staging snapshots)
  planId: PlanIdSchema.optional(),
  // Reference to specific staging (for staging snapshots)
  stagingId: StagingIdSchema.optional(),
  // Snapshot data
  data: SnapshotDataSchema,
  // Metadata
  stateVersion: z.string(), // Version of state schema at snapshot time
  // Timestamps
  createdAt: ISODateStringSchema,
  // Expiration (optional, for auto-cleanup)
  expiresAt: ISODateStringSchema.optional(),
  // Tags for organization
  tags: z.array(z.string()).default([]),
});

// ============ Search Index Schema ============
// Searchable entity types
export const SearchEntityTypeSchema = z.enum([
  "plan",
  "staging",
  "task",
  "template",
  "memory",
  "decision",
  "snapshot",
]);

// Search filter operators
export const SearchOperatorSchema = z.enum([
  "eq",         // Equals
  "neq",        // Not equals
  "contains",   // Contains substring (case-insensitive)
  "startsWith", // Starts with
  "endsWith",   // Ends with
  "gt",         // Greater than (for dates/numbers)
  "gte",        // Greater than or equal
  "lt",         // Less than
  "lte",        // Less than or equal
  "in",         // In array
  "notIn",      // Not in array
  "exists",     // Field exists
  "regex",      // Regex match
]);

// Search sort order
export const SearchSortOrderSchema = z.enum(["asc", "desc"]);

// Single search filter condition
export const SearchFilterSchema = z.object({
  field: z.string().min(1),
  operator: SearchOperatorSchema.default("contains"),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
});

// Search sort specification
export const SearchSortSchema = z.object({
  field: z.string().min(1),
  order: SearchSortOrderSchema.default("desc"),
});

// Full search query schema
export const SearchQuerySchema = z.object({
  // Text search across all text fields
  query: z.string().optional(),
  // Entity types to search
  entityTypes: z.array(SearchEntityTypeSchema).optional(),
  // Specific filters
  filters: z.array(SearchFilterSchema).default([]),
  // Sorting
  sort: z.array(SearchSortSchema).default([{ field: "updatedAt", order: "desc" }]),
  // Pagination
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
  // Include archived items
  includeArchived: z.boolean().default(false),
});

// Search result item
export const SearchResultItemSchema = z.object({
  entityType: SearchEntityTypeSchema,
  entityId: z.string(),
  // Relevance score (0-1)
  score: z.number().min(0).max(1),
  // Matched fields and snippets
  matches: z.array(z.object({
    field: z.string(),
    snippet: z.string(),
  })).default([]),
  // Entity data (lightweight)
  data: z.record(z.unknown()),
});

// Full search result
export const SearchResultSchema = z.object({
  query: SearchQuerySchema,
  results: z.array(SearchResultItemSchema),
  // Total count (for pagination)
  total: z.number().int().min(0),
  // Execution time in ms
  executionTimeMs: z.number(),
});

// ============ Pagination Schema ============
// Pagination request parameters
export const PaginationRequestSchema = z.object({
  // Page number (1-based)
  page: z.number().int().min(1).default(1),
  // Items per page
  pageSize: z.number().int().min(1).max(100).default(20),
  // Alternative: offset-based pagination
  offset: z.number().int().min(0).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

// Pagination metadata in response
export const PaginationMetaSchema = z.object({
  // Current page (1-based)
  page: z.number().int().min(1),
  // Items per page
  pageSize: z.number().int().min(1),
  // Total number of items
  totalItems: z.number().int().min(0),
  // Total number of pages
  totalPages: z.number().int().min(0),
  // Has previous page
  hasPrevious: z.boolean(),
  // Has next page
  hasNext: z.boolean(),
  // First item index (0-based)
  startIndex: z.number().int().min(0),
  // Last item index (0-based)
  endIndex: z.number().int().min(0),
});

// Cursor-based pagination (for efficient large datasets)
export const CursorPaginationRequestSchema = z.object({
  // Cursor for next page
  cursor: z.string().optional(),
  // Items per page
  limit: z.number().int().min(1).max(100).default(20),
  // Direction
  direction: z.enum(["forward", "backward"]).default("forward"),
});

export const CursorPaginationMetaSchema = z.object({
  // Cursor for next page
  nextCursor: z.string().optional(),
  // Cursor for previous page
  previousCursor: z.string().optional(),
  // Has more items
  hasMore: z.boolean(),
  // Total count (optional, may be expensive to compute)
  totalCount: z.number().int().min(0).optional(),
});

// Generic paginated result wrapper
export const PaginatedResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: PaginationMetaSchema,
  });

// Generic cursor-paginated result wrapper
export const CursorPaginatedResultSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    cursor: CursorPaginationMetaSchema,
  });

// Pre-defined paginated types for common entities
export const PaginatedPlansSchema = PaginatedResultSchema(PlanSchema);
export const PaginatedTasksSchema = PaginatedResultSchema(TaskSchema);
export const PaginatedTemplatesSchema = PaginatedResultSchema(TemplateSchema);
export const PaginatedSnapshotsSchema = PaginatedResultSchema(SnapshotSchema);
export const PaginatedMemoriesSchema = PaginatedResultSchema(MemorySchema);

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
  templates: z.record(TemplateIdSchema, TemplateSchema).default({}),
  snapshots: z.record(SnapshotIdSchema, SnapshotSchema).default({}),
  history: z.array(HistoryEntrySchema).default([]),
  context: ContextSchema,
});

// ============ Input Schemas for Tools ============
// Cross-staging task reference for plan creation (uses indices instead of IDs)
export const CrossStagingTaskRefInputSchema = z.object({
  staging_index: z.number().int().min(0),
  task_index: z.number().int().min(0),
});

export const CreatePlanInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  stagings: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    execution_type: ExecutionTypeSchema.default("parallel"),
    // Default model for tasks in this staging
    default_model: ModelTypeSchema.optional(),
    // Session budget for context management
    session_budget: SessionBudgetSchema.optional(),
    // Recommended number of sessions (0.5, 1, 2, etc.)
    recommended_sessions: z.number().min(0.5).max(10).optional(),
    // Staging dependencies (indices of other stagings to depend on)
    depends_on_staging_indices: z.array(z.number().int().min(0)).default([]),
    // Auto-include artifacts from dependent stagings
    auto_include_artifacts: z.boolean().default(true),
    tasks: z.array(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      priority: TaskPrioritySchema.default("medium"),
      execution_mode: ExecutionTypeSchema.default("parallel"),
      // Model to use for this task (overrides staging default_model)
      model: ModelTypeSchema.optional(),
      // Task dependencies within the same staging
      depends_on_index: z.array(z.number().int().min(0)).default([]),
      // Cross-staging task references (staging_index, task_index)
      cross_staging_task_refs: z.array(CrossStagingTaskRefInputSchema).default([]),
      // Memory tags for context-specific memory lookup
      memory_tags: z.array(z.string()).default([]),
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

// ============ Template Input Schemas ============
export const CreateTemplateInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: TemplateCategorySchema.default("custom"),
  tags: z.array(z.string()).default([]),
  stagings: z.array(TemplateStagingDefSchema).default([]),
  variables: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    defaultValue: z.string().optional(),
    required: z.boolean().default(false),
  })).default([]),
});

export const UpdateTemplateInputSchema = z.object({
  templateId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  category: TemplateCategorySchema.optional(),
  tags: z.array(z.string()).optional(),
  stagings: z.array(TemplateStagingDefSchema).optional(),
  variables: z.array(z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    defaultValue: z.string().optional(),
    required: z.boolean().default(false),
  })).optional(),
});

export const ApplyTemplateInputSchema = z.object({
  templateId: z.string(),
  planTitle: z.string().min(1),
  planDescription: z.string().optional(),
  // Variable substitutions: { variableName: value }
  variables: z.record(z.string()).default({}),
});

export const ListTemplatesInputSchema = z.object({
  category: TemplateCategorySchema.optional(),
  tags: z.array(z.string()).optional(),
});

// ============ Snapshot Input Schemas ============
export const CreateSnapshotInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  type: SnapshotTypeSchema.default("full"),
  // For plan/staging snapshots, specify the target
  planId: z.string().optional(),
  stagingId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  // Optional expiration
  expiresAt: z.string().optional(),
});

export const RestoreSnapshotInputSchema = z.object({
  snapshotId: z.string(),
  // Restore options
  restorePlans: z.boolean().default(true),
  restoreStagings: z.boolean().default(true),
  restoreTasks: z.boolean().default(true),
  restoreTemplates: z.boolean().default(false),
  restoreMemories: z.boolean().default(false),
  // Create backup before restore
  createBackup: z.boolean().default(true),
});

export const ListSnapshotsInputSchema = z.object({
  type: SnapshotTypeSchema.optional(),
  planId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  // Limit results
  limit: z.number().int().min(1).max(100).default(20),
});

export const DeleteSnapshotInputSchema = z.object({
  snapshotId: z.string(),
});

// ============ Type Exports ============
export type Template = z.infer<typeof TemplateSchema>;
export type TemplateCategory = z.infer<typeof TemplateCategorySchema>;
export type TemplateTaskDef = z.infer<typeof TemplateTaskDefSchema>;
export type TemplateStagingDef = z.infer<typeof TemplateStagingDefSchema>;
export type TemplateVariable = z.infer<typeof TemplateSchema>["variables"][number];
export type State = z.infer<typeof StateSchema>;
export type Plan = z.infer<typeof PlanSchema>;
export type Staging = z.infer<typeof StagingSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskOutput = z.infer<typeof TaskOutputSchema>;
export type Memory = z.infer<typeof MemorySchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type HistoryEntry = z.infer<typeof HistoryEntrySchema>;
export type HistoryEntryType = z.infer<typeof HistoryEntryTypeSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type StagingStatus = z.infer<typeof StagingStatusSchema>;
export type PlanStatus = z.infer<typeof PlanStatusSchema>;
export type ExecutionType = z.infer<typeof ExecutionTypeSchema>;
export type ModelType = z.infer<typeof ModelTypeSchema>;
export type SessionBudget = z.infer<typeof SessionBudgetSchema>;
export type Snapshot = z.infer<typeof SnapshotSchema>;
export type SnapshotType = z.infer<typeof SnapshotTypeSchema>;
export type SnapshotTrigger = z.infer<typeof SnapshotTriggerSchema>;
export type SnapshotData = z.infer<typeof SnapshotDataSchema>;
export type SearchEntityType = z.infer<typeof SearchEntityTypeSchema>;
export type SearchOperator = z.infer<typeof SearchOperatorSchema>;
export type SearchFilter = z.infer<typeof SearchFilterSchema>;
export type SearchSort = z.infer<typeof SearchSortSchema>;
export type SearchQuery = z.infer<typeof SearchQuerySchema>;
export type SearchResultItem = z.infer<typeof SearchResultItemSchema>;
export type SearchResult = z.infer<typeof SearchResultSchema>;
export type PaginationRequest = z.infer<typeof PaginationRequestSchema>;
export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;
export type CursorPaginationRequest = z.infer<typeof CursorPaginationRequestSchema>;
export type CursorPaginationMeta = z.infer<typeof CursorPaginationMetaSchema>;
export type PaginatedPlans = z.infer<typeof PaginatedPlansSchema>;
export type PaginatedTasks = z.infer<typeof PaginatedTasksSchema>;
export type PaginatedTemplates = z.infer<typeof PaginatedTemplatesSchema>;
export type PaginatedSnapshots = z.infer<typeof PaginatedSnapshotsSchema>;
export type PaginatedMemories = z.infer<typeof PaginatedMemoriesSchema>;
