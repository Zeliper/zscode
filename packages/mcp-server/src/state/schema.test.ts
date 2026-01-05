import { describe, it, expect } from 'vitest';
import {
  PlanIdSchema,
  StagingIdSchema,
  TaskIdSchema,
  MemoryIdSchema,
  TaskStatusSchema,
  PlanStatusSchema,
  StagingStatusSchema,
  TaskSchema,
  PlanSchema,
  StagingSchema,
  ProjectSchema,
  MemorySchema,
  StateSchema,
  CreatePlanInputSchema,
  TaskOutputInputSchema,
  STATE_VERSION,
} from './schema.js';

describe('Schema Validation', () => {
  describe('ID Patterns', () => {
    it('should validate correct plan ID format', () => {
      expect(() => PlanIdSchema.parse('plan-abc12345')).not.toThrow();
      expect(() => PlanIdSchema.parse('plan-00000000')).not.toThrow();
      expect(() => PlanIdSchema.parse('plan-zzzzzzzz')).not.toThrow();
    });

    it('should reject invalid plan ID formats', () => {
      expect(() => PlanIdSchema.parse('plan-abc')).toThrow(); // Too short
      expect(() => PlanIdSchema.parse('plan-123456789')).toThrow(); // Too long
      expect(() => PlanIdSchema.parse('plan-ABC12345')).toThrow(); // Uppercase
      expect(() => PlanIdSchema.parse('invalid-abc12345')).toThrow(); // Wrong prefix
      expect(() => PlanIdSchema.parse('')).toThrow(); // Empty
    });

    it('should validate correct staging ID format', () => {
      expect(() => StagingIdSchema.parse('staging-abc1')).not.toThrow();
      expect(() => StagingIdSchema.parse('staging-0000')).not.toThrow();
    });

    it('should reject invalid staging ID formats', () => {
      expect(() => StagingIdSchema.parse('staging-ab')).toThrow(); // Too short
      expect(() => StagingIdSchema.parse('staging-abcde')).toThrow(); // Too long
      expect(() => StagingIdSchema.parse('staging-ABCD')).toThrow(); // Uppercase
    });

    it('should validate correct task ID format', () => {
      expect(() => TaskIdSchema.parse('task-abc12345')).not.toThrow();
      expect(() => TaskIdSchema.parse('task-00000000')).not.toThrow();
    });

    it('should reject invalid task ID formats', () => {
      expect(() => TaskIdSchema.parse('task-abc')).toThrow();
      expect(() => TaskIdSchema.parse('task-123456789')).toThrow();
    });

    it('should validate correct memory ID format', () => {
      expect(() => MemoryIdSchema.parse('mem-abc12345')).not.toThrow();
      expect(() => MemoryIdSchema.parse('mem-00000000')).not.toThrow();
    });

    it('should reject invalid memory ID formats', () => {
      expect(() => MemoryIdSchema.parse('mem-abc')).toThrow();
      expect(() => MemoryIdSchema.parse('memory-abc12345')).toThrow();
    });
  });

  describe('Enum Schemas', () => {
    it('should validate task status values', () => {
      expect(TaskStatusSchema.parse('pending')).toBe('pending');
      expect(TaskStatusSchema.parse('in_progress')).toBe('in_progress');
      expect(TaskStatusSchema.parse('done')).toBe('done');
      expect(TaskStatusSchema.parse('blocked')).toBe('blocked');
      expect(TaskStatusSchema.parse('cancelled')).toBe('cancelled');
    });

    it('should reject invalid task status values', () => {
      expect(() => TaskStatusSchema.parse('invalid')).toThrow();
      expect(() => TaskStatusSchema.parse('completed')).toThrow(); // Not a valid value
    });

    it('should validate plan status values', () => {
      expect(PlanStatusSchema.parse('draft')).toBe('draft');
      expect(PlanStatusSchema.parse('active')).toBe('active');
      expect(PlanStatusSchema.parse('completed')).toBe('completed');
      expect(PlanStatusSchema.parse('archived')).toBe('archived');
      expect(PlanStatusSchema.parse('cancelled')).toBe('cancelled');
    });

    it('should validate staging status values', () => {
      expect(StagingStatusSchema.parse('pending')).toBe('pending');
      expect(StagingStatusSchema.parse('in_progress')).toBe('in_progress');
      expect(StagingStatusSchema.parse('completed')).toBe('completed');
      expect(StagingStatusSchema.parse('failed')).toBe('failed');
      expect(StagingStatusSchema.parse('cancelled')).toBe('cancelled');
    });
  });

  describe('TaskSchema', () => {
    const validTask = {
      id: 'task-abc12345',
      planId: 'plan-abc12345',
      stagingId: 'staging-abc1',
      title: 'Test Task',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should validate a minimal valid task', () => {
      const result = TaskSchema.parse(validTask);
      expect(result.id).toBe('task-abc12345');
      expect(result.title).toBe('Test Task');
      expect(result.priority).toBe('medium'); // Default
      expect(result.status).toBe('pending'); // Default
    });

    it('should validate a complete task', () => {
      const completeTask = {
        ...validTask,
        description: 'A test task description',
        priority: 'high',
        status: 'in_progress',
        execution_mode: 'sequential',
        depends_on: ['task-dep12345'],
        order: 0,
        notes: 'Some notes',
        startedAt: '2024-01-01T01:00:00.000Z',
      };
      const result = TaskSchema.parse(completeTask);
      expect(result.description).toBe('A test task description');
      expect(result.priority).toBe('high');
    });

    it('should require title', () => {
      const { title, ...taskWithoutTitle } = validTask;
      expect(() => TaskSchema.parse(taskWithoutTitle)).toThrow();
    });

    it('should reject empty title', () => {
      expect(() => TaskSchema.parse({ ...validTask, title: '' })).toThrow();
    });
  });

  describe('PlanSchema', () => {
    const validPlan = {
      id: 'plan-abc12345',
      title: 'Test Plan',
      artifacts_root: '.claude/plans/plan-abc12345/artifacts',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should validate a minimal valid plan', () => {
      const result = PlanSchema.parse(validPlan);
      expect(result.id).toBe('plan-abc12345');
      expect(result.status).toBe('draft'); // Default
      expect(result.stagings).toEqual([]); // Default
    });

    it('should validate a complete plan', () => {
      const completePlan = {
        ...validPlan,
        description: 'A test plan description',
        status: 'active',
        stagings: ['staging-abc1', 'staging-def2'],
        currentStagingId: 'staging-abc1',
      };
      const result = PlanSchema.parse(completePlan);
      expect(result.stagings).toHaveLength(2);
    });

    it('should require title', () => {
      const { title, ...planWithoutTitle } = validPlan;
      expect(() => PlanSchema.parse(planWithoutTitle)).toThrow();
    });
  });

  describe('StagingSchema', () => {
    const validStaging = {
      id: 'staging-abc1',
      planId: 'plan-abc12345',
      name: 'Phase 1',
      order: 0,
      artifacts_path: '.claude/plans/plan-abc12345/artifacts/staging-abc1',
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    it('should validate a minimal valid staging', () => {
      const result = StagingSchema.parse(validStaging);
      expect(result.id).toBe('staging-abc1');
      expect(result.execution_type).toBe('parallel'); // Default
      expect(result.status).toBe('pending'); // Default
    });

    it('should require name', () => {
      const { name, ...stagingWithoutName } = validStaging;
      expect(() => StagingSchema.parse(stagingWithoutName)).toThrow();
    });

    it('should require non-negative order', () => {
      expect(() => StagingSchema.parse({ ...validStaging, order: -1 })).toThrow();
    });
  });

  describe('ProjectSchema', () => {
    it('should validate a minimal project', () => {
      const project = {
        name: 'Test Project',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const result = ProjectSchema.parse(project);
      expect(result.name).toBe('Test Project');
      expect(result.goals).toEqual([]); // Default
      expect(result.constraints).toEqual([]); // Default
    });

    it('should require name', () => {
      const project = {
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      expect(() => ProjectSchema.parse(project)).toThrow();
    });
  });

  describe('MemorySchema', () => {
    const validMemory = {
      id: 'mem-abc12345',
      category: 'coding',
      title: 'Test Memory',
      content: 'Some content',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };

    it('should validate a minimal memory', () => {
      const result = MemorySchema.parse(validMemory);
      expect(result.priority).toBe(50); // Default
      expect(result.enabled).toBe(true); // Default
      expect(result.tags).toEqual([]); // Default
    });

    it('should validate priority bounds', () => {
      expect(() => MemorySchema.parse({ ...validMemory, priority: -1 })).toThrow();
      expect(() => MemorySchema.parse({ ...validMemory, priority: 101 })).toThrow();
      expect(() => MemorySchema.parse({ ...validMemory, priority: 0 })).not.toThrow();
      expect(() => MemorySchema.parse({ ...validMemory, priority: 100 })).not.toThrow();
    });

    it('should require content', () => {
      const { content, ...memoryWithoutContent } = validMemory;
      expect(() => MemorySchema.parse(memoryWithoutContent)).toThrow();
    });

    it('should reject empty content', () => {
      expect(() => MemorySchema.parse({ ...validMemory, content: '' })).toThrow();
    });
  });

  describe('TaskOutputInputSchema', () => {
    it('should validate valid task output', () => {
      const output = {
        status: 'success',
        summary: 'Task completed successfully',
      };
      const result = TaskOutputInputSchema.parse(output);
      expect(result.artifacts).toEqual([]); // Default
    });

    it('should accept all status values', () => {
      expect(() => TaskOutputInputSchema.parse({ status: 'success', summary: 'Done' })).not.toThrow();
      expect(() => TaskOutputInputSchema.parse({ status: 'failure', summary: 'Failed' })).not.toThrow();
      expect(() => TaskOutputInputSchema.parse({ status: 'partial', summary: 'Partial' })).not.toThrow();
    });

    it('should require summary', () => {
      expect(() => TaskOutputInputSchema.parse({ status: 'success' })).toThrow();
    });
  });

  describe('CreatePlanInputSchema', () => {
    it('should validate minimal plan creation input', () => {
      const input = {
        title: 'New Plan',
        stagings: [],
      };
      const result = CreatePlanInputSchema.parse(input);
      expect(result.title).toBe('New Plan');
    });

    it('should validate plan with stagings and tasks', () => {
      const input = {
        title: 'New Plan',
        stagings: [
          {
            name: 'Phase 1',
            tasks: [
              { title: 'Task 1' },
              { title: 'Task 2', priority: 'high', depends_on_index: [0] },
            ],
          },
        ],
      };
      const result = CreatePlanInputSchema.parse(input);
      expect(result.stagings[0]?.tasks).toHaveLength(2);
      expect(result.stagings[0]?.tasks[0]?.priority).toBe('medium'); // Default
    });

    it('should require staging name', () => {
      const input = {
        title: 'New Plan',
        stagings: [{ tasks: [] }],
      };
      expect(() => CreatePlanInputSchema.parse(input)).toThrow();
    });
  });

  describe('StateSchema', () => {
    it('should validate correct version', () => {
      expect(STATE_VERSION).toBe('2.0.0');
    });

    it('should validate a minimal state', () => {
      const state = {
        version: STATE_VERSION,
        project: {
          name: 'Test',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        context: {
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      };
      const result = StateSchema.parse(state);
      expect(result.plans).toEqual({}); // Default
      expect(result.history).toEqual([]); // Default
    });

    it('should reject wrong version', () => {
      const state = {
        version: '1.0.0', // Wrong version
        project: {
          name: 'Test',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        context: {
          lastUpdated: '2024-01-01T00:00:00.000Z',
        },
      };
      expect(() => StateSchema.parse(state)).toThrow();
    });
  });
});
