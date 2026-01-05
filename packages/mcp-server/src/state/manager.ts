import { readFile, access, rm, cp } from "fs/promises";
import { join, dirname } from "path";
import { constants } from "fs";
import { StateSchema } from "./schema.js";
import {
  STATE_VERSION,
  type State,
  type Plan,
  type Staging,
  type Task,
  type Project,
  type HistoryEntry,
  type Decision,
  type Memory,
  type TaskStatus,
  type PlanStatus,
  type HistoryEntryType,
  type TaskOutput,
  type IdGenerator,
  type MemoryEventType,
  type RelatedStagingArtifacts,
  type CrossReferencedTaskOutput,
  type ModelType,
  type SessionBudget,
} from "./types.js";
import {
  normalizePath,
  toPosixPath,
  ensureDir,
  isPathSafe,
  isValidId,
  atomicWriteFile,
  generateSecureId,
} from "../utils/paths.js";
import {
  ProjectNotInitializedError,
  PlanNotFoundError,
  PlanInvalidStateError,
  StagingNotFoundError,
  StagingOrderError,
  StagingPlanMismatchError,
  StagingInvalidStateError,
  TaskNotFoundError,
  TaskInvalidStateError,
  TaskStateTransitionError,
  CircularDependencyError,
  MemoryNotFoundError,
  PathTraversalError,
  InvalidIdError,
} from "../errors/index.js";



// ============ Constants ============
const MAX_HISTORY_ENTRIES = 1000;

// Valid task state transitions
const VALID_TASK_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  pending: ["in_progress", "blocked", "cancelled"],
  in_progress: ["done", "blocked", "cancelled"],
  blocked: ["in_progress", "cancelled"],
  done: [], // Terminal state - no transitions allowed
  cancelled: [], // Terminal state - no transitions allowed
};
// ============ ID Generator ============
// Uses cryptographically secure random generation
const idGenerator: IdGenerator = {
  generatePlanId: () => `plan-${generateSecureId(8)}`,
  generateStagingId: () => `staging-${generateSecureId(4)}`,
  generateTaskId: () => `task-${generateSecureId(8)}`,
  generateHistoryId: () => `hist-${Date.now()}-${generateSecureId(4)}`,
  generateDecisionId: () => `dec-${Date.now()}-${generateSecureId(4)}`,
  generateMemoryId: () => `mem-${generateSecureId(8)}`,
};

// ============ StateManager Class ============
export class StateManager {
  private static instance: StateManager | null = null;
  private state: State | null = null;
  private projectRoot: string;
  private stateFilePath: string;

  private constructor(projectRoot: string) {
    this.projectRoot = normalizePath(projectRoot);
    this.stateFilePath = normalizePath(join(projectRoot, ".claude", "state.json"));
  }

  static async initialize(projectRoot: string): Promise<StateManager> {
    if (!StateManager.instance || StateManager.instance.projectRoot !== projectRoot) {
      StateManager.instance = new StateManager(projectRoot);
      await StateManager.instance.load();
    }
    return StateManager.instance;
  }

  static getInstance(): StateManager {
    if (!StateManager.instance) {
      throw new Error("StateManager not initialized. Call StateManager.initialize() first.");
    }
    return StateManager.instance;
  }

  // ============ File Operations ============
  private async load(): Promise<void> {
    try {
      await access(this.stateFilePath, constants.R_OK);
      const content = await readFile(this.stateFilePath, "utf-8");
      const parsed = JSON.parse(content);
      this.state = StateSchema.parse(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // State file doesn't exist, will be created on first save
        this.state = null;
      } else {
        throw error;
      }
    }
  }

  private async save(): Promise<void> {
    if (!this.state) {
      throw new Error("No state to save");
    }
    // Use atomic write to prevent data corruption
    await atomicWriteFile(this.stateFilePath, JSON.stringify(this.state, null, 2));
  }

  // ============ Validation Helpers ============
  private ensureInitialized(): State {
    if (!this.state) {
      throw new ProjectNotInitializedError();
    }
    return this.state;
  }

  private requirePlan(planId: string): Plan {
    const state = this.ensureInitialized();
    const plan = state.plans[planId];
    if (!plan) {
      throw new PlanNotFoundError(planId);
    }
    return plan;
  }

  private requireStaging(stagingId: string): Staging {
    const state = this.ensureInitialized();
    const staging = state.stagings[stagingId];
    if (!staging) {
      throw new StagingNotFoundError(stagingId);
    }
    return staging;
  }

  private requireTask(taskId: string): Task {
    const state = this.ensureInitialized();
    const task = state.tasks[taskId];
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }
    return task;
  }

  private requireMemory(memoryId: string): Memory {
    const state = this.ensureInitialized();
    const memory = state.context.memories.find(m => m.id === memoryId);
    if (!memory) {
      throw new MemoryNotFoundError(memoryId);
    }
    return memory;
  }

  // ============ Getters ============
  getState(): State | null {
    return this.state;
  }

  getProject(): Project | null {
    return this.state?.project ?? null;
  }

  getPlan(planId: string): Plan | undefined {
    return this.state?.plans[planId];
  }

  getStaging(stagingId: string): Staging | undefined {
    return this.state?.stagings[stagingId];
  }

  getTask(taskId: string): Task | undefined {
    return this.state?.tasks[taskId];
  }

  getAllPlans(): Plan[] {
    if (!this.state) return [];
    return Object.values(this.state.plans);
  }

  getStagingsByPlan(planId: string): Staging[] {
    if (!this.state) return [];
    const plan = this.getPlan(planId);
    if (!plan) return [];
    return plan.stagings.map(id => this.state!.stagings[id]).filter((s): s is Staging => !!s);
  }

  getTasksByStaging(stagingId: string): Task[] {
    if (!this.state) return [];
    const staging = this.getStaging(stagingId);
    if (!staging) return [];
    return staging.tasks.map(id => this.state!.tasks[id]).filter((t): t is Task => !!t);
  }

  getStagingByOrder(planId: string, order: number): Staging | undefined {
    const stagings = this.getStagingsByPlan(planId);
    return stagings.find(s => s.order === order);
  }

  // ============ Project Operations ============
  async initializeProject(name: string, description?: string, goals?: string[], constraints?: string[]): Promise<Project> {
    const now = new Date().toISOString();
    const project: Project = {
      name,
      description,
      goals: goals ?? [],
      constraints: constraints ?? [],
      createdAt: now,
      updatedAt: now,
    };

    this.state = {
      version: STATE_VERSION,
      project,
      plans: {},
      stagings: {},
      tasks: {},
      history: [],
      context: {
        lastUpdated: now,
        activeFiles: [],
        decisions: [],
        memories: [],
      },
    };

    await this.addHistory("project_initialized", { projectName: name });
    await this.save();
    return project;
  }

  // ============ Plan Operations ============
  async createPlan(
    title: string,
    description: string | undefined,
    stagingConfigs: Array<{
      name: string;
      description?: string;
      execution_type: "parallel" | "sequential";
      default_model?: ModelType;
      session_budget?: SessionBudget;
      recommended_sessions?: number;
      tasks: Array<{
        title: string;
        description?: string;
        priority: "high" | "medium" | "low";
        execution_mode: "parallel" | "sequential";
        model?: ModelType;
        depends_on_index: number[];
      }>;
    }>
  ): Promise<Plan> {
    const state = this.ensureInitialized();

    const now = new Date().toISOString();
    const planId = idGenerator.generatePlanId();
    const artifactsRoot = toPosixPath(join(".claude", "plans", planId, "artifacts"));

    // Create stagings and tasks
    const stagingIds: string[] = [];
    const allTasksByStaging: Map<string, Task[]> = new Map();

    for (let stagingIndex = 0; stagingIndex < stagingConfigs.length; stagingIndex++) {
      const config = stagingConfigs[stagingIndex]!;
      const stagingId = idGenerator.generateStagingId();
      const artifactsPath = toPosixPath(join(artifactsRoot, stagingId));

      // Create tasks for this staging
      const taskIds: string[] = [];
      const tasks: Task[] = [];

      for (let taskIndex = 0; taskIndex < config.tasks.length; taskIndex++) {
        const taskConfig = config.tasks[taskIndex]!;
        const taskId = idGenerator.generateTaskId();

        const task: Task = {
          id: taskId,
          planId,
          stagingId,
          title: taskConfig.title,
          description: taskConfig.description,
          priority: taskConfig.priority,
          status: "pending",
          execution_mode: taskConfig.execution_mode,
          model: taskConfig.model, // Model override for this task
          depends_on: [], // Will be resolved after all tasks are created
          cross_staging_refs: [], // Will be populated if cross-staging refs are provided
          memory_tags: [], // Will be populated if memory tags are provided
          order: taskIndex,
          createdAt: now,
          updatedAt: now,
        };

        tasks.push(task);
        taskIds.push(taskId);
        state.tasks[taskId] = task;
      }

      // Resolve task dependencies within the same staging
      for (let i = 0; i < tasks.length; i++) {
        const taskConfig = config.tasks[i]!;
        const task = tasks[i]!;
        task.depends_on = taskConfig.depends_on_index
          .filter(idx => idx >= 0 && idx < tasks.length && idx !== i)
          .map(idx => tasks[idx]!.id);
      }

      allTasksByStaging.set(stagingId, tasks);

      // Create staging
      const staging: Staging = {
        id: stagingId,
        planId,
        name: config.name,
        description: config.description,
        order: stagingIndex,
        execution_type: config.execution_type,
        status: "pending",
        default_model: config.default_model, // Default model for tasks in this staging
        session_budget: config.session_budget, // Session budget category
        recommended_sessions: config.recommended_sessions, // Recommended session count
        tasks: taskIds,
        depends_on_stagings: [], // Will be populated if staging dependencies are provided
        auto_include_artifacts: true, // Default to auto-include
        artifacts_path: artifactsPath,
        createdAt: now,
      };

      state.stagings[stagingId] = staging;
      stagingIds.push(stagingId);
    }

    // Create plan
    const plan: Plan = {
      id: planId,
      title,
      description,
      status: "draft",
      stagings: stagingIds,
      artifacts_root: artifactsRoot,
      createdAt: now,
      updatedAt: now,
    };

    state.plans[planId] = plan;
    await this.addHistory("plan_created", { planId, title, stagingCount: stagingIds.length });
    await this.save();

    return plan;
  }

  async updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
    const plan = this.requirePlan(planId);

    plan.status = status;
    plan.updatedAt = new Date().toISOString();

    if (status === "completed") {
      plan.completedAt = plan.updatedAt;
    } else if (status === "archived") {
      plan.archivedAt = plan.updatedAt;
    }

    await this.save();
  }

  // ============ Staging Operations ============
  async startStaging(planId: string, stagingId: string): Promise<Staging> {
    const state = this.ensureInitialized();
    const plan = this.requirePlan(planId);
    const staging = this.requireStaging(stagingId);

    if (staging.planId !== planId) {
      throw new StagingPlanMismatchError(stagingId, planId, staging.planId);
    }

    // Check if previous staging is completed
    if (staging.order > 0) {
      const prevStaging = this.getStagingByOrder(planId, staging.order - 1);
      if (prevStaging && prevStaging.status !== "completed") {
        throw new StagingOrderError(stagingId, prevStaging.id);
      }
    }

    const now = new Date().toISOString();
    staging.status = "in_progress";
    staging.startedAt = now;

    plan.currentStagingId = stagingId;
    plan.status = "active";
    plan.updatedAt = now;

    state.context.currentPlanId = planId;
    state.context.currentStagingId = stagingId;
    state.context.lastUpdated = now;

    // Create artifacts directory
    const artifactsDir = normalizePath(join(this.projectRoot, staging.artifacts_path));
    await ensureDir(artifactsDir);

    await this.addHistory("staging_started", { planId, stagingId, stagingName: staging.name });
    await this.save();

    return staging;
  }

  async completeStaging(stagingId: string): Promise<void> {
    const state = this.ensureInitialized();
    const staging = this.requireStaging(stagingId);

    const now = new Date().toISOString();
    staging.status = "completed";
    staging.completedAt = now;

    const plan = this.getPlan(staging.planId);
    if (plan) {
      plan.updatedAt = now;

      // Check if all stagings are completed
      const allCompleted = plan.stagings.every(id => {
        const s = this.getStaging(id);
        return s?.status === "completed";
      });

      if (allCompleted) {
        plan.status = "completed";
        plan.completedAt = now;
        state.context.currentPlanId = undefined;
        state.context.currentStagingId = undefined;
      }
    }

    await this.addHistory("staging_completed", { stagingId, stagingName: staging.name });
    await this.save();
  }

  // ============ Task Operations ============
  async updateTaskStatus(taskId: string, status: TaskStatus, notes?: string): Promise<void> {
    const task = this.requireTask(taskId);

    // Validate state transition
    const allowedTransitions = VALID_TASK_TRANSITIONS[task.status];
    if (!allowedTransitions.includes(status)) {
      throw new TaskStateTransitionError(taskId, task.status, status, allowedTransitions);
    }

    const now = new Date().toISOString();
    task.status = status;
    task.updatedAt = now;

    if (notes) {
      task.notes = notes;
    }

    if (status === "in_progress") {
      task.startedAt = now;
      await this.addHistory("task_started", { taskId, taskTitle: task.title });
    } else if (status === "done") {
      task.completedAt = now;
      await this.addHistory("task_completed", { taskId, taskTitle: task.title });

      // Check if staging is completed
      const staging = this.getStaging(task.stagingId);
      if (staging) {
        const allTasksDone = staging.tasks.every(id => {
          const t = this.getTask(id);
          return t?.status === "done";
        });
        if (allTasksDone) {
          await this.completeStaging(staging.id);
        }
      }
    } else if (status === "blocked") {
      await this.addHistory("task_blocked", { taskId, taskTitle: task.title, notes });
    }

    await this.save();
  }

  async saveTaskOutput(taskId: string, output: TaskOutput): Promise<void> {
    // Validate taskId to prevent path traversal
    if (!isValidId(taskId)) {
      throw new InvalidIdError(taskId, "task");
    }

    const task = this.requireTask(taskId);

    task.output = output;
    task.updatedAt = new Date().toISOString();

    // Save output to artifacts file
    const staging = this.getStaging(task.stagingId);
    if (staging) {
      const claudeDir = normalizePath(join(this.projectRoot, ".claude"));
      const outputPath = normalizePath(
        join(this.projectRoot, staging.artifacts_path, `${taskId}-output.json`)
      );

      // Verify path is within the .claude directory (path traversal protection)
      if (!isPathSafe(claudeDir, outputPath)) {
        throw new PathTraversalError(outputPath);
      }

      // Use atomic write to prevent data corruption
      await atomicWriteFile(outputPath, JSON.stringify(output, null, 2));
    }

    await this.save();
  }

  getExecutableTasks(stagingId: string): Task[] {
    const staging = this.getStaging(stagingId);
    if (!staging || staging.status !== "in_progress") return [];

    const tasks = this.getTasksByStaging(stagingId);

    if (staging.execution_type === "parallel") {
      return tasks.filter(t => t.status === "pending");
    }

    // Sequential: only return tasks whose dependencies are all done
    return tasks.filter(task => {
      if (task.status !== "pending") return false;
      return task.depends_on.every(depId => {
        const depTask = this.getTask(depId);
        return depTask?.status === "done";
      });
    });
  }

  // ============ Archive Operations ============
  async archivePlan(planId: string, reason?: string): Promise<string> {
    const state = this.ensureInitialized();

    // Validate planId to prevent path traversal
    if (!isValidId(planId)) {
      throw new InvalidIdError(planId, "plan");
    }

    const plan = this.requirePlan(planId);

    if (plan.status !== "completed" && plan.status !== "cancelled") {
      throw new PlanInvalidStateError(planId, plan.status, ["completed", "cancelled"]);
    }

    const now = new Date().toISOString();
    const claudeDir = normalizePath(join(this.projectRoot, ".claude"));
    const sourcePath = normalizePath(join(this.projectRoot, ".claude", "plans", planId));
    const archivePath = normalizePath(join(this.projectRoot, ".claude", "archive", planId));

    // Verify paths are within the .claude directory (path traversal protection)
    if (!isPathSafe(claudeDir, sourcePath) || !isPathSafe(claudeDir, archivePath)) {
      throw new PathTraversalError(planId);
    }

    // Move plan directory to archive
    try {
      await ensureDir(dirname(archivePath));
      await cp(sourcePath, archivePath, { recursive: true });
      await rm(sourcePath, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist if no artifacts were created
      console.error(`Archive directory operation failed: ${error}`);
    }

    plan.status = "archived";
    plan.archivedAt = now;
    plan.updatedAt = now;

    // Clear current context if this was the active plan
    if (state.context.currentPlanId === planId) {
      state.context.currentPlanId = undefined;
      state.context.currentStagingId = undefined;
    }

    await this.addHistory("plan_archived", { planId, title: plan.title, reason });
    await this.save();

    return toPosixPath(join(".claude", "archive", planId));
  }

  async unarchivePlan(planId: string): Promise<{ plan: Plan; restoredPath: string }> {
    this.ensureInitialized();

    // Validate planId to prevent path traversal
    if (!isValidId(planId)) {
      throw new InvalidIdError(planId, "plan");
    }

    const plan = this.requirePlan(planId);

    if (plan.status !== "archived") {
      throw new PlanInvalidStateError(planId, plan.status, ["archived"]);
    }

    const now = new Date().toISOString();
    const claudeDir = normalizePath(join(this.projectRoot, ".claude"));
    const archivePath = normalizePath(join(this.projectRoot, ".claude", "archive", planId));
    const restorePath = normalizePath(join(this.projectRoot, ".claude", "plans", planId));

    // Verify paths are within the .claude directory (path traversal protection)
    if (!isPathSafe(claudeDir, archivePath) || !isPathSafe(claudeDir, restorePath)) {
      throw new PathTraversalError(planId);
    }

    // Move plan directory back from archive
    try {
      await ensureDir(dirname(restorePath));
      await cp(archivePath, restorePath, { recursive: true });
      await rm(archivePath, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist if no artifacts were created
      console.error(`Unarchive directory operation failed: ${error}`);
    }

    // Restore plan to completed status (since it was completed before archiving)
    plan.status = "completed";
    plan.archivedAt = undefined;
    plan.updatedAt = now;

    await this.addHistory("plan_unarchived", { planId, title: plan.title });
    await this.save();

    return { plan, restoredPath: toPosixPath(join(".claude", "plans", planId)) };
  }

  // ============ Cancel Operations ============
  async cancelPlan(planId: string, reason?: string): Promise<{ affectedStagings: number; affectedTasks: number }> {
    const state = this.ensureInitialized();
    const plan = this.requirePlan(planId);

    if (plan.status === "archived" || plan.status === "cancelled") {
      throw new PlanInvalidStateError(planId, plan.status, ["draft", "active", "completed"]);
    }

    const now = new Date().toISOString();
    let affectedStagings = 0;
    let affectedTasks = 0;

    // Cancel all pending/in_progress stagings
    for (const stagingId of plan.stagings) {
      const staging = this.getStaging(stagingId);
      if (staging && (staging.status === "pending" || staging.status === "in_progress")) {
        staging.status = "cancelled";
        affectedStagings++;

        // Cancel all pending/in_progress tasks in this staging
        for (const taskId of staging.tasks) {
          const task = this.getTask(taskId);
          if (task && (task.status === "pending" || task.status === "in_progress")) {
            task.status = "cancelled";
            task.updatedAt = now;
            affectedTasks++;
          }
        }
      }
    }

    plan.status = "cancelled";
    plan.updatedAt = now;

    // Clear current context if this was the active plan
    if (state.context.currentPlanId === planId) {
      state.context.currentPlanId = undefined;
      state.context.currentStagingId = undefined;
    }

    await this.addHistory("plan_cancelled", { planId, title: plan.title, reason, affectedStagings, affectedTasks });
    await this.save();

    return { affectedStagings, affectedTasks };
  }

  // ============ History & Decision Operations ============
  async addHistory(type: HistoryEntryType, details: Record<string, unknown>): Promise<void> {
    if (!this.state) return;

    const entry: HistoryEntry = {
      id: idGenerator.generateHistoryId(),
      timestamp: new Date().toISOString(),
      type,
      details,
    };

    this.state.history.push(entry);
    this.state.context.lastUpdated = entry.timestamp;

    // Enforce history size limit - remove oldest entries if exceeded
    if (this.state.history.length > MAX_HISTORY_ENTRIES) {
      const excess = this.state.history.length - MAX_HISTORY_ENTRIES;
      this.state.history.splice(0, excess);
    }
  }

  async addDecision(
    title: string,
    decision: string,
    rationale?: string,
    relatedPlanId?: string,
    relatedStagingId?: string
  ): Promise<Decision> {
    const state = this.ensureInitialized();

    const now = new Date().toISOString();
    const decisionEntry: Decision = {
      id: idGenerator.generateDecisionId(),
      title,
      decision,
      rationale,
      relatedPlanId,
      relatedStagingId,
      timestamp: now,
    };

    state.context.decisions.push(decisionEntry);
    await this.addHistory("decision_added", { decisionId: decisionEntry.id, title });
    await this.save();

    return decisionEntry;
  }

  // ============ Memory Operations ============
  async addMemory(
    category: string,
    title: string,
    content: string,
    tags?: string[],
    priority?: number
  ): Promise<Memory> {
    const state = this.ensureInitialized();

    const now = new Date().toISOString();
    const memory: Memory = {
      id: idGenerator.generateMemoryId(),
      category,
      title,
      content,
      tags: tags ?? [],
      priority: priority ?? 50,
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };

    state.context.memories.push(memory);
    await this.addHistory("memory_added", { memoryId: memory.id, title, category });
    await this.save();

    return memory;
  }

  listMemories(
    category?: string,
    tags?: string[],
    enabledOnly: boolean = true
  ): Memory[] {
    if (!this.state) return [];

    let memories = this.state.context.memories;

    if (enabledOnly) {
      memories = memories.filter(m => m.enabled);
    }

    if (category) {
      memories = memories.filter(m => m.category === category);
    }

    if (tags && tags.length > 0) {
      memories = memories.filter(m =>
        tags.some(tag => m.tags.includes(tag))
      );
    }

    // Sort by priority (descending)
    return memories.sort((a, b) => b.priority - a.priority);
  }

  getMemoriesForContext(context: "planning" | "coding" | "review" | "general" | "all"): Memory[] {
    if (!this.state) return [];

    const enabledMemories = this.state.context.memories.filter(m => m.enabled);

    let result: Memory[];
    if (context === "all") {
      result = enabledMemories;
    } else if (context === "general") {
      result = enabledMemories.filter(m => m.category === "general");
    } else {
      // Return general + context-specific memories
      result = enabledMemories.filter(m =>
        m.category === "general" || m.category === context
      );
    }

    // Sort by priority (descending)
    return result.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get memories for a specific event (staging-start, task-start, etc.)
   * Returns general + event-specific memories, optionally filtered by additional tags
   */
  getMemoriesForEvent(event: MemoryEventType, additionalTags?: string[]): Memory[] {
    if (!this.state) return [];

    const enabledMemories = this.state.context.memories.filter(m => m.enabled);

    // Get general + event-specific memories
    let result = enabledMemories.filter(m =>
      m.category === "general" || m.category === event
    );

    // If additional tags are provided, also include memories matching those tags
    if (additionalTags && additionalTags.length > 0) {
      const tagMatched = enabledMemories.filter(m =>
        additionalTags.some(tag => m.tags.includes(tag))
      );
      // Add tag-matched memories that aren't already in result
      const resultIds = new Set(result.map(m => m.id));
      for (const m of tagMatched) {
        if (!resultIds.has(m.id)) {
          result.push(m);
        }
      }
    }

    // Sort by priority (descending)
    return result.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get artifacts from stagings that this staging depends on
   */
  getRelatedStagingArtifacts(stagingId: string): RelatedStagingArtifacts[] {
    const staging = this.getStaging(stagingId);
    if (!staging) return [];

    const results: RelatedStagingArtifacts[] = [];

    for (const ref of staging.depends_on_stagings) {
      const depStaging = this.getStaging(ref.stagingId);
      if (!depStaging) continue;

      const tasks = this.getTasksByStaging(ref.stagingId);
      const taskOutputs: Record<string, TaskOutput> = {};

      // If taskIds is specified, only include those tasks; otherwise include all
      const targetTaskIds = ref.taskIds ?? tasks.map(t => t.id);

      for (const task of tasks) {
        if (targetTaskIds.includes(task.id) && task.output) {
          taskOutputs[task.id] = task.output;
        }
      }

      results.push({
        stagingId: depStaging.id,
        stagingName: depStaging.name,
        taskOutputs,
      });
    }

    return results;
  }

  /**
   * Get task outputs for cross-staging references
   */
  getCrossReferencedTaskOutputs(taskId: string): CrossReferencedTaskOutput[] {
    const task = this.getTask(taskId);
    if (!task) return [];

    const results: CrossReferencedTaskOutput[] = [];

    for (const ref of task.cross_staging_refs) {
      const refTask = this.getTask(ref.taskId);
      if (!refTask) continue;

      results.push({
        taskId: refTask.id,
        taskTitle: refTask.title,
        stagingId: ref.stagingId,
        output: refTask.output ?? null,
      });
    }

    return results;
  }

  async updateMemory(
    memoryId: string,
    updates: {
      title?: string;
      content?: string;
      category?: string;
      tags?: string[];
      priority?: number;
      enabled?: boolean;
    }
  ): Promise<Memory> {
    const memory = this.requireMemory(memoryId);

    const now = new Date().toISOString();
    if (updates.title !== undefined) memory.title = updates.title;
    if (updates.content !== undefined) memory.content = updates.content;
    if (updates.category !== undefined) memory.category = updates.category;
    if (updates.tags !== undefined) memory.tags = updates.tags;
    if (updates.priority !== undefined) memory.priority = updates.priority;
    if (updates.enabled !== undefined) memory.enabled = updates.enabled;
    memory.updatedAt = now;

    await this.addHistory("memory_updated", { memoryId, updates });
    await this.save();

    return memory;
  }

  async removeMemory(memoryId: string): Promise<void> {
    const state = this.ensureInitialized();
    const memory = this.requireMemory(memoryId);

    const index = state.context.memories.findIndex(m => m.id === memoryId);
    state.context.memories.splice(index, 1);

    await this.addHistory("memory_removed", { memoryId, title: memory.title });
    await this.save();
  }

  getMemory(memoryId: string): Memory | undefined {
    return this.state?.context.memories.find(m => m.id === memoryId);
  }

  getCategories(): string[] {
    if (!this.state) return [];

    const categories = new Set<string>();
    for (const memory of this.state.context.memories) {
      categories.add(memory.category);
    }
    return Array.from(categories).sort();
  }

  // ============ Project Summary Operations ============
  /**
   * Get the existing project summary memory (if any)
   */
  getProjectSummary(): Memory | undefined {
    if (!this.state) return undefined;
    return this.state.context.memories.find(m => m.category === "project-summary");
  }

  /**
   * Generate a project summary from current state
   */
  generateProjectSummaryContent(): string {
    if (!this.state) return "";

    const project = this.state.project;
    const plans = Object.values(this.state.plans);
    const memories = this.state.context.memories.filter(m => m.category !== "project-summary");

    // Calculate stats
    const activePlans = plans.filter(p => p.status === "active");
    const completedPlans = plans.filter(p => p.status === "completed");
    const totalTasks = Object.keys(this.state.tasks).length;
    const completedTasks = Object.values(this.state.tasks).filter(t => t.status === "done").length;

    // Build summary content
    const lines: string[] = [];

    // Project info
    lines.push(`# ${project.name}`);
    if (project.description) {
      lines.push(`\n${project.description}`);
    }

    // Goals
    if (project.goals.length > 0) {
      lines.push(`\n## Goals`);
      project.goals.forEach(g => lines.push(`- ${g}`));
    }

    // Constraints
    if (project.constraints.length > 0) {
      lines.push(`\n## Constraints`);
      project.constraints.forEach(c => lines.push(`- ${c}`));
    }

    // Current status
    lines.push(`\n## Status`);
    lines.push(`- Active Plans: ${activePlans.length}`);
    lines.push(`- Completed Plans: ${completedPlans.length}`);
    lines.push(`- Tasks: ${completedTasks}/${totalTasks} completed`);

    // Active plan details
    if (activePlans.length > 0) {
      lines.push(`\n## Active Work`);
      for (const plan of activePlans) {
        const stagings = this.getStagingsByPlan(plan.id);
        const currentStaging = stagings.find(s => s.status === "in_progress");
        lines.push(`- **${plan.title}**`);
        if (currentStaging) {
          const tasks = this.getTasksByStaging(currentStaging.id);
          const inProgress = tasks.filter(t => t.status === "in_progress");
          lines.push(`  - Current: ${currentStaging.name}`);
          if (inProgress.length > 0) {
            lines.push(`  - Tasks: ${inProgress.map(t => t.title).join(", ")}`);
          }
        }
      }
    }

    // Key memories (non project-summary)
    const keyMemories = memories.filter(m => m.enabled && m.priority >= 70);
    if (keyMemories.length > 0) {
      lines.push(`\n## Key Rules`);
      for (const m of keyMemories.slice(0, 5)) {
        lines.push(`- **${m.title}** (${m.category})`);
      }
    }

    // Recent decisions
    const recentDecisions = this.state.context.decisions.slice(-3);
    if (recentDecisions.length > 0) {
      lines.push(`\n## Recent Decisions`);
      for (const d of recentDecisions) {
        lines.push(`- ${d.title}: ${d.decision}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Create or update the project summary memory
   */
  async saveProjectSummary(content?: string): Promise<Memory> {
    const state = this.ensureInitialized();

    const summaryContent = content ?? this.generateProjectSummaryContent();
    const existingSummary = this.getProjectSummary();

    if (existingSummary) {
      // Update existing summary
      return this.updateMemory(existingSummary.id, {
        content: summaryContent,
        title: `${state.project.name} - Project Summary`,
      });
    } else {
      // Create new summary
      return this.addMemory(
        "project-summary",
        `${state.project.name} - Project Summary`,
        summaryContent,
        ["auto-generated", "summary"],
        100 // Highest priority to appear first
      );
    }
  }

  /**
   * Get memories that should always be applied (general + project-summary)
   */
  getAlwaysAppliedMemories(): Memory[] {
    if (!this.state) return [];

    const enabledMemories = this.state.context.memories.filter(m => m.enabled);

    // Return general + project-summary memories
    const result = enabledMemories.filter(m =>
      m.category === "general" || m.category === "project-summary"
    );

    // Sort by priority (descending)
    return result.sort((a, b) => b.priority - a.priority);
  }

  // ============ Session Operations ============
  async startSession(): Promise<void> {
    await this.addHistory("session_started", {});
    await this.save();
  }

  async endSession(summary?: string): Promise<void> {
    if (!this.state) return;

    if (summary) {
      this.state.context.sessionSummary = summary;
    }

    await this.addHistory("session_ended", { summary });
    await this.save();
  }

  // ============ Modify Operations ============
  async updatePlan(planId: string, updates: { title?: string; description?: string }): Promise<Plan> {
    const plan = this.requirePlan(planId);

    if (plan.status === "archived" || plan.status === "cancelled") {
      throw new PlanInvalidStateError(planId, plan.status, ["draft", "active", "completed"]);
    }

    const now = new Date().toISOString();
    if (updates.title !== undefined) plan.title = updates.title;
    if (updates.description !== undefined) plan.description = updates.description;
    plan.updatedAt = now;

    await this.addHistory("plan_updated", { planId, updates });
    await this.save();

    return plan;
  }

  async updateStaging(stagingId: string, updates: {
    name?: string;
    description?: string;
    execution_type?: "parallel" | "sequential";
    default_model?: ModelType;
    session_budget?: SessionBudget;
    recommended_sessions?: number;
  }): Promise<Staging> {
    const staging = this.requireStaging(stagingId);

    if (staging.status === "completed" || staging.status === "cancelled") {
      throw new StagingInvalidStateError(stagingId, staging.status, ["pending", "in_progress"]);
    }

    if (updates.name !== undefined) staging.name = updates.name;
    if (updates.description !== undefined) staging.description = updates.description;
    if (updates.execution_type !== undefined) staging.execution_type = updates.execution_type;
    if (updates.default_model !== undefined) staging.default_model = updates.default_model;
    if (updates.session_budget !== undefined) staging.session_budget = updates.session_budget;
    if (updates.recommended_sessions !== undefined) staging.recommended_sessions = updates.recommended_sessions;

    await this.addHistory("staging_updated", { stagingId, updates });
    await this.save();

    return staging;
  }

  async addStaging(
    planId: string,
    config: {
      name: string;
      description?: string;
      execution_type: "parallel" | "sequential";
      default_model?: ModelType;
      session_budget?: SessionBudget;
      recommended_sessions?: number;
      insertAt?: number; // If not provided, adds at the end
    }
  ): Promise<Staging> {
    const state = this.ensureInitialized();
    const plan = this.requirePlan(planId);

    if (plan.status === "archived" || plan.status === "cancelled" || plan.status === "completed") {
      throw new PlanInvalidStateError(planId, plan.status, ["draft", "active"]);
    }

    const now = new Date().toISOString();
    const stagingId = idGenerator.generateStagingId();
    const insertAt = config.insertAt ?? plan.stagings.length;

    // Reorder existing stagings
    const stagings = this.getStagingsByPlan(planId);
    for (const s of stagings) {
      if (s.order >= insertAt) {
        s.order++;
      }
    }

    const artifactsPath = toPosixPath(join(plan.artifacts_root, stagingId));
    const staging: Staging = {
      id: stagingId,
      planId,
      name: config.name,
      description: config.description,
      order: insertAt,
      execution_type: config.execution_type,
      status: "pending",
      default_model: config.default_model,
      session_budget: config.session_budget,
      recommended_sessions: config.recommended_sessions,
      tasks: [],
      depends_on_stagings: [],
      auto_include_artifacts: true,
      artifacts_path: artifactsPath,
      createdAt: now,
    };

    state.stagings[stagingId] = staging;

    // Insert into plan's staging list
    plan.stagings.splice(insertAt, 0, stagingId);
    plan.updatedAt = now;

    await this.addHistory("staging_added", { planId, stagingId, name: config.name });
    await this.save();

    return staging;
  }

  async removeStaging(stagingId: string): Promise<void> {
    const state = this.ensureInitialized();
    const staging = this.requireStaging(stagingId);

    if (staging.status === "in_progress") {
      throw new StagingInvalidStateError(stagingId, staging.status, ["pending", "completed", "cancelled"]);
    }

    const plan = this.requirePlan(staging.planId);

    // Remove all tasks in this staging
    for (const taskId of staging.tasks) {
      delete state.tasks[taskId];
    }

    // Remove staging from plan
    plan.stagings = plan.stagings.filter(id => id !== stagingId);
    plan.updatedAt = new Date().toISOString();

    // Reorder remaining stagings
    const remainingStagings = this.getStagingsByPlan(staging.planId);
    remainingStagings.sort((a, b) => a.order - b.order);
    remainingStagings.forEach((s, i) => {
      s.order = i;
    });

    // Remove staging
    delete state.stagings[stagingId];

    await this.addHistory("staging_removed", { stagingId, stagingName: staging.name });
    await this.save();
  }


  // ============ Circular Dependency Detection ============
  /**
   * Check for circular dependencies in task dependencies
   * @param taskId - The task being checked
   * @param depends_on - Dependencies to validate
   * @returns dependency chain if circular, null otherwise
   */
  private detectCircularDependency(taskId: string, depends_on: string[], visited: Set<string> = new Set()): string[] | null {
    if (visited.has(taskId)) {
      return Array.from(visited);
    }
    visited.add(taskId);

    for (const depId of depends_on) {
      const depTask = this.getTask(depId);
      if (!depTask) continue;

      if (depTask.depends_on.includes(taskId)) {
        return [...Array.from(visited), depId, taskId];
      }

      const chain = this.detectCircularDependency(depId, depTask.depends_on, new Set(visited));
      if (chain) {
        return chain;
      }
    }

    return null;
  }

  async addTask(
    stagingId: string,
    config: {
      title: string;
      description?: string;
      priority: "high" | "medium" | "low";
      execution_mode: "parallel" | "sequential";
      model?: ModelType;
      depends_on?: string[]; // Task IDs
    }
  ): Promise<Task> {
    const state = this.ensureInitialized();
    const staging = this.requireStaging(stagingId);

    if (staging.status === "completed" || staging.status === "cancelled") {
      throw new StagingInvalidStateError(stagingId, staging.status, ["pending", "in_progress"]);
    }

    const now = new Date().toISOString();
    const taskId = idGenerator.generateTaskId();
    const existingTasks = this.getTasksByStaging(stagingId);

    // Check for circular dependencies
    if (config.depends_on && config.depends_on.length > 0) {
      const circularChain = this.detectCircularDependency(taskId, config.depends_on);
      if (circularChain) {
        throw new CircularDependencyError(taskId, circularChain);
      }
    }

    const task: Task = {
      id: taskId,
      planId: staging.planId,
      stagingId,
      title: config.title,
      description: config.description,
      priority: config.priority,
      status: "pending",
      execution_mode: config.execution_mode,
      model: config.model,
      depends_on: config.depends_on ?? [],
      cross_staging_refs: [],
      memory_tags: [],
      order: existingTasks.length,
      createdAt: now,
      updatedAt: now,
    };

    state.tasks[taskId] = task;
    staging.tasks.push(taskId);

    await this.addHistory("task_added", { stagingId, taskId, title: config.title });
    await this.save();

    return task;
  }

  async removeTask(taskId: string): Promise<void> {
    const state = this.ensureInitialized();
    const task = this.requireTask(taskId);

    if (task.status === "in_progress") {
      throw new TaskInvalidStateError(taskId, task.status, ["pending", "done", "blocked", "cancelled"]);
    }

    const staging = this.requireStaging(task.stagingId);

    // Remove task from staging
    staging.tasks = staging.tasks.filter(id => id !== taskId);

    // Remove this task from other tasks' dependencies
    for (const t of Object.values(state.tasks)) {
      t.depends_on = t.depends_on.filter(id => id !== taskId);
    }

    // Reorder remaining tasks
    const remainingTasks = this.getTasksByStaging(task.stagingId);
    remainingTasks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    remainingTasks.forEach((t, i) => {
      t.order = i;
    });

    // Remove task
    delete state.tasks[taskId];

    await this.addHistory("task_removed", { taskId, taskTitle: task.title });
    await this.save();
  }

  async updateTaskDetails(taskId: string, updates: {
    title?: string;
    description?: string;
    priority?: "high" | "medium" | "low";
    execution_mode?: "parallel" | "sequential";
    model?: ModelType;
    depends_on?: string[];
  }): Promise<Task> {
    const task = this.requireTask(taskId);

    if (task.status === "done" || task.status === "cancelled") {
      throw new TaskInvalidStateError(taskId, task.status, ["pending", "in_progress", "blocked"]);
    }

    const now = new Date().toISOString();
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.description !== undefined) task.description = updates.description;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.execution_mode !== undefined) task.execution_mode = updates.execution_mode;
    if (updates.model !== undefined) task.model = updates.model;

    // Handle depends_on updates with circular dependency check
    if (updates.depends_on !== undefined) {
      // Validate all dependency IDs exist and are in the same staging
      for (const depId of updates.depends_on) {
        const depTask = this.getTask(depId);
        if (!depTask) {
          throw new TaskNotFoundError(depId);
        }
        if (depTask.stagingId !== task.stagingId) {
          throw new TaskInvalidStateError(
            depId,
            "different staging",
            ["same staging as dependent task"]
          );
        }
        // Cannot depend on itself
        if (depId === taskId) {
          throw new CircularDependencyError(taskId, [taskId]);
        }
      }

      // Check for circular dependencies
      const circularChain = this.detectCircularDependency(taskId, updates.depends_on);
      if (circularChain) {
        throw new CircularDependencyError(taskId, circularChain);
      }

      task.depends_on = updates.depends_on;
    }

    task.updatedAt = now;

    await this.addHistory("task_updated", { taskId, updates });
    await this.save();

    return task;
  }

  // ============ Utility Methods ============
  getProjectRoot(): string {
    return this.projectRoot;
  }

  isInitialized(): boolean {
    return this.state !== null;
  }
}

export { idGenerator };
