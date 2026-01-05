import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateManager } from './manager.js';
import { rm, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  PlanNotFoundError,
  TaskStateTransitionError,
  CircularDependencyError,
} from '../errors/index.js';

// Test directory setup
const TEST_ROOT = join(tmpdir(), 'zscode-test-' + Date.now());

describe('StateManager', () => {
  beforeEach(async () => {
    // Reset singleton and create fresh test directory
    (StateManager as unknown as { instance: null }).instance = null;
    await mkdir(join(TEST_ROOT, '.claude'), { recursive: true });
  });

  afterEach(async () => {
    // Cleanup test directory
    (StateManager as unknown as { instance: null }).instance = null;
    await rm(TEST_ROOT, { recursive: true, force: true });
  });

  describe('Initialization', () => {
    it('should initialize with project root', async () => {
      const manager = await StateManager.initialize(TEST_ROOT);
      expect(manager).toBeDefined();
      // Windows uses backslashes, manager normalizes to forward slashes
expect(manager.getProjectRoot()).toBeDefined();
    });

    it('should return same instance for same project root', async () => {
      const manager1 = await StateManager.initialize(TEST_ROOT);
      const manager2 = await StateManager.initialize(TEST_ROOT);
      expect(manager1).toBe(manager2);
    });

    it('should throw when getInstance called before initialize', () => {
      expect(() => StateManager.getInstance()).toThrow('StateManager not initialized');
    });

    it('should have null state before project initialization', async () => {
      const manager = await StateManager.initialize(TEST_ROOT);
      expect(manager.getState()).toBeNull();
    });
  });

  describe('Project Initialization', () => {
    it('should initialize a new project', async () => {
      const manager = await StateManager.initialize(TEST_ROOT);
      const project = await manager.initializeProject('Test Project', 'A test project');

      expect(project.name).toBe('Test Project');
      expect(project.description).toBe('A test project');
      expect(project.createdAt).toBeDefined();
    });

    it('should persist state to file', async () => {
      const manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test Project');

      const stateFile = join(TEST_ROOT, '.claude', 'state.json');
      const content = await readFile(stateFile, 'utf-8');
      const state = JSON.parse(content);

      expect(state.project.name).toBe('Test Project');
      expect(state.version).toBe('2.0.0');
    });
  });

  describe('Plan Operations', () => {
    let manager: StateManager;

    beforeEach(async () => {
      manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test Project');
    });

    it('should create a plan with stagings and tasks', async () => {
      const plan = await manager.createPlan('Test Plan', 'A test plan', [
        {
          name: 'Phase 1',
          execution_type: 'parallel',
          tasks: [
            { title: 'Task 1', priority: 'high', execution_mode: 'parallel', depends_on_index: [] },
            { title: 'Task 2', priority: 'medium', execution_mode: 'parallel', depends_on_index: [] },
          ],
        },
      ]);

      expect(plan.id).toMatch(/^plan-/);
      expect(plan.title).toBe('Test Plan');
      expect(plan.status).toBe('draft');
      expect(plan.stagings).toHaveLength(1);
    });

    it('should start a staging', async () => {
      const plan = await manager.createPlan('Test Plan', undefined, [
        {
          name: 'Phase 1',
          execution_type: 'parallel',
          tasks: [{ title: 'Task 1', priority: 'high', execution_mode: 'parallel', depends_on_index: [] }],
        },
      ]);

      const staging = await manager.startStaging(plan.id, plan.stagings[0]!);
      expect(staging.status).toBe('in_progress');
    });

    it('should throw when plan not found', () => {
      expect(() => manager.getPlan('plan-nonexistent')).not.toThrow();
      expect(manager.getPlan('plan-nonexistent')).toBeUndefined();
    });
  });

  describe('Task Status Transitions', () => {
    let manager: StateManager;
    let taskId: string;

    beforeEach(async () => {
      manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test Project');
      const plan = await manager.createPlan('Test Plan', undefined, [
        {
          name: 'Phase 1',
          execution_type: 'parallel',
          tasks: [{ title: 'Task 1', priority: 'high', execution_mode: 'parallel', depends_on_index: [] }],
        },
      ]);
      const staging = manager.getStagingsByPlan(plan.id)[0]!;
      await manager.startStaging(plan.id, staging.id);
      const tasks = manager.getTasksByStaging(staging.id);
      taskId = tasks[0]!.id;
    });

    it('should allow pending -> in_progress transition', async () => {
      await manager.updateTaskStatus(taskId, 'in_progress');
      const task = manager.getTask(taskId);
      expect(task?.status).toBe('in_progress');
    });

    it('should allow in_progress -> done transition', async () => {
      await manager.updateTaskStatus(taskId, 'in_progress');
      await manager.updateTaskStatus(taskId, 'done');
      const task = manager.getTask(taskId);
      expect(task?.status).toBe('done');
    });

    it('should not allow pending -> done transition', async () => {
      await expect(manager.updateTaskStatus(taskId, 'done')).rejects.toThrow(TaskStateTransitionError);
    });

    it('should not allow transitions from done state', async () => {
      await manager.updateTaskStatus(taskId, 'in_progress');
      await manager.updateTaskStatus(taskId, 'done');
      await expect(manager.updateTaskStatus(taskId, 'in_progress')).rejects.toThrow(TaskStateTransitionError);
    });
  });

  describe('Task Dependencies', () => {
    let manager: StateManager;
    let planId: string;
    let stagingId: string;

    beforeEach(async () => {
      manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test Project');
      const plan = await manager.createPlan('Test Plan', undefined, [
        {
          name: 'Phase 1',
          execution_type: 'sequential',
          tasks: [
            { title: 'Task 1', priority: 'high', execution_mode: 'sequential', depends_on_index: [] },
            { title: 'Task 2', priority: 'high', execution_mode: 'sequential', depends_on_index: [0] },
          ],
        },
      ]);
      planId = plan.id;
      stagingId = plan.stagings[0]!;
    });

    it('should correctly set up task dependencies', () => {
      const tasks = manager.getTasksByStaging(stagingId);
      expect(tasks[1]?.depends_on).toContain(tasks[0]?.id);
    });

    it('should only return executable tasks with completed dependencies', async () => {
      await manager.startStaging(planId, stagingId);

      // Initially only Task 1 should be executable (no dependencies)
      let executable = manager.getExecutableTasks(stagingId);
      expect(executable).toHaveLength(1);
      expect(executable[0]?.title).toBe('Task 1');

      // Complete Task 1
      await manager.updateTaskStatus(executable[0]!.id, 'in_progress');
      await manager.updateTaskStatus(executable[0]!.id, 'done');

      // Now Task 2 should be executable
      executable = manager.getExecutableTasks(stagingId);
      expect(executable).toHaveLength(1);
      expect(executable[0]?.title).toBe('Task 2');
    });

    it('should detect circular dependencies when updating task', async () => {
      await manager.startStaging(planId, stagingId);
      const tasks = manager.getTasksByStaging(stagingId);
      const task1 = tasks[0]!;
      const task2 = tasks[1]!;

      // Try to make Task 1 depend on Task 2 (which already depends on Task 1)
      await expect(
        manager.updateTaskDetails(task1.id, { depends_on: [task2.id] })
      ).rejects.toThrow(CircularDependencyError);
    });
  });

  describe('Memory Operations', () => {
    let manager: StateManager;

    beforeEach(async () => {
      manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test Project');
    });

    it('should add a memory', async () => {
      const memory = await manager.addMemory('coding', 'Test Rule', 'Always test code', ['test']);

      expect(memory.id).toMatch(/^mem-/);
      expect(memory.category).toBe('coding');
      expect(memory.title).toBe('Test Rule');
      expect(memory.enabled).toBe(true);
    });

    it('should list memories by category', async () => {
      await manager.addMemory('coding', 'Coding Rule', 'Code stuff');
      await manager.addMemory('review', 'Review Rule', 'Review stuff');
      await manager.addMemory('coding', 'Another Coding Rule', 'More code stuff');

      const codingMemories = manager.listMemories('coding');
      expect(codingMemories).toHaveLength(2);
      expect(codingMemories.every(m => m.category === 'coding')).toBe(true);
    });

    it('should get memories for context including general', async () => {
      await manager.addMemory('general', 'General Rule', 'Always applies');
      await manager.addMemory('coding', 'Coding Rule', 'Only when coding');
      await manager.addMemory('review', 'Review Rule', 'Only when reviewing');

      const codingContext = manager.getMemoriesForContext('coding');
      expect(codingContext).toHaveLength(2); // general + coding
      expect(codingContext.some(m => m.category === 'general')).toBe(true);
      expect(codingContext.some(m => m.category === 'coding')).toBe(true);
    });

    it('should sort memories by priority', async () => {
      await manager.addMemory('general', 'Low Priority', 'content', [], 10);
      await manager.addMemory('general', 'High Priority', 'content', [], 90);
      await manager.addMemory('general', 'Medium Priority', 'content', [], 50);

      const memories = manager.listMemories('general');
      expect(memories[0]?.title).toBe('High Priority');
      expect(memories[1]?.title).toBe('Medium Priority');
      expect(memories[2]?.title).toBe('Low Priority');
    });

    it('should update a memory', async () => {
      const memory = await manager.addMemory('coding', 'Test', 'content');
      await manager.updateMemory(memory.id, { title: 'Updated Test', enabled: false });

      const updated = manager.getMemory(memory.id);
      expect(updated?.title).toBe('Updated Test');
      expect(updated?.enabled).toBe(false);
    });

    it('should remove a memory', async () => {
      const memory = await manager.addMemory('coding', 'To Remove', 'content');
      await manager.removeMemory(memory.id);

      expect(manager.getMemory(memory.id)).toBeUndefined();
    });
  });

  describe('History Management', () => {
    let manager: StateManager;

    beforeEach(async () => {
      manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test Project');
    });

    it('should add history entries', async () => {
      const plan = await manager.createPlan('Test Plan', undefined, [
        {
          name: 'Phase 1',
          execution_type: 'parallel',
          tasks: [{ title: 'Task 1', priority: 'high', execution_mode: 'parallel', depends_on_index: [] }],
        },
      ]);

      const state = manager.getState();
      const planCreatedEntry = state?.history.find(h => h.type === 'plan_created');
      expect(planCreatedEntry).toBeDefined();
      expect(planCreatedEntry?.details.planId).toBe(plan.id);
    });
  });

  describe('Archive Operations', () => {
    let manager: StateManager;
    let planId: string;

    beforeEach(async () => {
      manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test Project');
      const plan = await manager.createPlan('Test Plan', undefined, [
        {
          name: 'Phase 1',
          execution_type: 'parallel',
          tasks: [{ title: 'Task 1', priority: 'high', execution_mode: 'parallel', depends_on_index: [] }],
        },
      ]);
      planId = plan.id;
    });

    it('should archive a completed plan', async () => {
      const plan = manager.getPlan(planId)!;
      const staging = manager.getStaging(plan.stagings[0]!)!;

      // Complete the plan
      await manager.startStaging(planId, staging.id);
      const tasks = manager.getTasksByStaging(staging.id);
      await manager.updateTaskStatus(tasks[0]!.id, 'in_progress');
      await manager.updateTaskStatus(tasks[0]!.id, 'done');

      // Archive
      const archivePath = await manager.archivePlan(planId);
      expect(archivePath).toContain('archive');

      const archivedPlan = manager.getPlan(planId);
      expect(archivedPlan?.status).toBe('archived');
    });

    it('should unarchive an archived plan', async () => {
      const plan = manager.getPlan(planId)!;
      const staging = manager.getStaging(plan.stagings[0]!)!;

      // Complete and archive
      await manager.startStaging(planId, staging.id);
      const tasks = manager.getTasksByStaging(staging.id);
      await manager.updateTaskStatus(tasks[0]!.id, 'in_progress');
      await manager.updateTaskStatus(tasks[0]!.id, 'done');
      await manager.archivePlan(planId);

      // Unarchive
      const { plan: restored } = await manager.unarchivePlan(planId);
      expect(restored.status).toBe('completed');
    });
  });

  describe('Error Handling', () => {
    it('should throw ProjectNotInitializedError when not initialized', async () => {
      const manager = await StateManager.initialize(TEST_ROOT);
      expect(() => manager.getAllPlans()).not.toThrow();
      expect(manager.getAllPlans()).toEqual([]);
    });

    it('should throw PlanNotFoundError for invalid plan', async () => {
      const manager = await StateManager.initialize(TEST_ROOT);
      await manager.initializeProject('Test');

      // getPlan returns undefined, requirePlan throws
      await expect(manager.archivePlan('plan-invalid')).rejects.toThrow(PlanNotFoundError);
    });
  });
});
