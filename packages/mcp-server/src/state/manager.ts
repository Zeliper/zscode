import { readFile, writeFile, access, rm, cp } from "fs/promises";
import { join, dirname } from "path";
import { constants } from "fs";
import { StateSchema } from "./schema.js";
import type {
  State,
  Plan,
  Staging,
  Task,
  Project,
  HistoryEntry,
  Decision,
  TaskStatus,
  PlanStatus,
  HistoryEntryType,
  TaskOutput,
  IdGenerator,
} from "./types.js";
import { normalizePath, toPosixPath, ensureDir } from "../utils/paths.js";

// ============ ID Generator ============
function generateRandomId(length: number): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const idGenerator: IdGenerator = {
  generatePlanId: () => `plan-${generateRandomId(8)}`,
  generateStagingId: () => `staging-${generateRandomId(4)}`,
  generateTaskId: () => `task-${generateRandomId(8)}`,
  generateHistoryId: () => `hist-${Date.now()}-${generateRandomId(4)}`,
  generateDecisionId: () => `dec-${Date.now()}-${generateRandomId(4)}`,
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
    await ensureDir(dirname(this.stateFilePath));
    await writeFile(this.stateFilePath, JSON.stringify(this.state, null, 2), "utf-8");
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
      version: "2.0.0",
      project,
      plans: {},
      stagings: {},
      tasks: {},
      history: [],
      context: {
        lastUpdated: now,
        activeFiles: [],
        decisions: [],
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
      tasks: Array<{
        title: string;
        description?: string;
        priority: "high" | "medium" | "low";
        execution_mode: "parallel" | "sequential";
        depends_on_index: number[];
      }>;
    }>
  ): Promise<Plan> {
    if (!this.state) {
      throw new Error("Project not initialized");
    }

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
          depends_on: [], // Will be resolved after all tasks are created
          order: taskIndex,
          createdAt: now,
          updatedAt: now,
        };

        tasks.push(task);
        taskIds.push(taskId);
        this.state.tasks[taskId] = task;
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
        tasks: taskIds,
        artifacts_path: artifactsPath,
        createdAt: now,
      };

      this.state.stagings[stagingId] = staging;
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

    this.state.plans[planId] = plan;
    await this.addHistory("plan_created", { planId, title, stagingCount: stagingIds.length });
    await this.save();

    return plan;
  }

  async updatePlanStatus(planId: string, status: PlanStatus): Promise<void> {
    if (!this.state) throw new Error("Project not initialized");
    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

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
    if (!this.state) throw new Error("Project not initialized");

    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    const staging = this.getStaging(stagingId);
    if (!staging) throw new Error(`Staging not found: ${stagingId}`);

    if (staging.planId !== planId) {
      throw new Error(`Staging ${stagingId} does not belong to plan ${planId}`);
    }

    // Check if previous staging is completed
    if (staging.order > 0) {
      const prevStaging = this.getStagingByOrder(planId, staging.order - 1);
      if (prevStaging && prevStaging.status !== "completed") {
        throw new Error(`Cannot start staging: previous staging ${prevStaging.id} is not completed`);
      }
    }

    const now = new Date().toISOString();
    staging.status = "in_progress";
    staging.startedAt = now;

    plan.currentStagingId = stagingId;
    plan.status = "active";
    plan.updatedAt = now;

    this.state.context.currentPlanId = planId;
    this.state.context.currentStagingId = stagingId;
    this.state.context.lastUpdated = now;

    // Create artifacts directory
    const artifactsDir = normalizePath(join(this.projectRoot, staging.artifacts_path));
    await ensureDir(artifactsDir);

    await this.addHistory("staging_started", { planId, stagingId, stagingName: staging.name });
    await this.save();

    return staging;
  }

  async completestaging(stagingId: string): Promise<void> {
    if (!this.state) throw new Error("Project not initialized");

    const staging = this.getStaging(stagingId);
    if (!staging) throw new Error(`Staging not found: ${stagingId}`);

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
        this.state.context.currentPlanId = undefined;
        this.state.context.currentStagingId = undefined;
      }
    }

    await this.addHistory("staging_completed", { stagingId, stagingName: staging.name });
    await this.save();
  }

  // ============ Task Operations ============
  async updateTaskStatus(taskId: string, status: TaskStatus, notes?: string): Promise<void> {
    if (!this.state) throw new Error("Project not initialized");

    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

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
          await this.completestaging(staging.id);
        }
      }
    } else if (status === "blocked") {
      await this.addHistory("task_blocked", { taskId, taskTitle: task.title, notes });
    }

    await this.save();
  }

  async saveTaskOutput(taskId: string, output: TaskOutput): Promise<void> {
    if (!this.state) throw new Error("Project not initialized");

    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task not found: ${taskId}`);

    task.output = output;
    task.updatedAt = new Date().toISOString();

    // Save output to artifacts file
    const staging = this.getStaging(task.stagingId);
    if (staging) {
      const outputPath = normalizePath(
        join(this.projectRoot, staging.artifacts_path, `${taskId}-output.json`)
      );
      await ensureDir(dirname(outputPath));
      await writeFile(outputPath, JSON.stringify(output, null, 2), "utf-8");
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
    if (!this.state) throw new Error("Project not initialized");

    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    if (plan.status !== "completed" && plan.status !== "cancelled") {
      throw new Error(`Cannot archive plan in ${plan.status} status. Only completed or cancelled plans can be archived.`);
    }

    const now = new Date().toISOString();
    const sourcePath = normalizePath(join(this.projectRoot, ".claude", "plans", planId));
    const archivePath = normalizePath(join(this.projectRoot, ".claude", "archive", planId));

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
    if (this.state.context.currentPlanId === planId) {
      this.state.context.currentPlanId = undefined;
      this.state.context.currentStagingId = undefined;
    }

    await this.addHistory("plan_archived", { planId, title: plan.title, reason });
    await this.save();

    return toPosixPath(join(".claude", "archive", planId));
  }

  // ============ Cancel Operations ============
  async cancelPlan(planId: string, reason?: string): Promise<{ affectedStagings: number; affectedTasks: number }> {
    if (!this.state) throw new Error("Project not initialized");

    const plan = this.getPlan(planId);
    if (!plan) throw new Error(`Plan not found: ${planId}`);

    if (plan.status === "archived" || plan.status === "cancelled") {
      throw new Error(`Plan is already ${plan.status}`);
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
    if (this.state.context.currentPlanId === planId) {
      this.state.context.currentPlanId = undefined;
      this.state.context.currentStagingId = undefined;
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
  }

  async addDecision(
    title: string,
    decision: string,
    rationale?: string,
    relatedPlanId?: string,
    relatedStagingId?: string
  ): Promise<Decision> {
    if (!this.state) throw new Error("Project not initialized");

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

    this.state.context.decisions.push(decisionEntry);
    await this.addHistory("decision_added", { decisionId: decisionEntry.id, title });
    await this.save();

    return decisionEntry;
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

  // ============ Utility Methods ============
  getProjectRoot(): string {
    return this.projectRoot;
  }

  isInitialized(): boolean {
    return this.state !== null;
  }
}

export { idGenerator };
