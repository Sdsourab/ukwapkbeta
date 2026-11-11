import { UkwError, type TaskRecord, type TaskStatus } from '@ukw/domain';
import type { StoreContext } from './context';
import { EntityRepo, type CreateInput } from './repo';

export class TaskRepository extends EntityRepo<TaskRecord> {
  constructor(ctx: StoreContext) {
    super(ctx, ctx.db.tasks, 'tasks', 'task');
  }

  async createTask(input: Partial<CreateInput<TaskRecord>> & { title: string }): Promise<TaskRecord> {
    const title = input.title.trim();
    if (!title) throw new UkwError('VALIDATION_ERROR', 'A task needs a title.');
    return this.create({ status: 'todo', priority: 'normal', ...input, title } as CreateInput<TaskRecord>);
  }

  async setStatus(id: string, status: TaskStatus): Promise<TaskRecord> {
    return this.update(id, { status });
  }

  /** Open tasks ordered by due date (undated last), then priority. */
  async listOpen(): Promise<TaskRecord[]> {
    const rank = { high: 0, normal: 1, low: 2 } as const;
    const rows = await this.table.filter((t) => !t.deletedAt && t.status !== 'done').toArray();
    return rows.sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999') || rank[a.priority] - rank[b.priority]);
  }
}
