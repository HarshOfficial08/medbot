import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model, QueryFilter } from 'mongoose';
import { DepartmentEntity } from './departments.schema.js';
import type { DepartmentDocument } from './departments.schema.js';
import type { Department } from './departments.types.js';

/** The fields this module reads off a stored department. */
type DepartmentRow = Pick<DepartmentEntity, '_id' | 'name' | 'active'>;

/**
 * Mongo row -> public contract.
 *
 * `_id` becomes `id` here and nowhere else, so no caller ever sees the
 * storage shape (CLAUDE.md, Architecture rule 4).
 */
function toDepartment(row: DepartmentRow): Department {
  return {
    id: row._id,
    name: row.name,
    active: row.active,
  };
}

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(DepartmentEntity.name)
    private readonly departmentModel: Model<DepartmentDocument>,
  ) {}

  /**
   * Every department, or only the ones currently accepting patients.
   *
   * Sorted by id so the agent's prompt and the UI's list are stable
   * between calls — an LLM reading a differently-ordered list each turn
   * is needless nondeterminism.
   */
  async findAll(activeOnly = false): Promise<Department[]> {
    const filter: QueryFilter<DepartmentDocument> = activeOnly
      ? { active: true }
      : {};

    const rows = await this.departmentModel
      .find(filter)
      .sort({ _id: 1 })
      .lean()
      .exec();

    return rows.map(toDepartment);
  }

  /**
   * Returns null rather than throwing when nothing matches: "missing" is
   * an ordinary answer for a service, and only the HTTP layer knows that
   * it should become a 404 (CLAUDE.md, Building blocks).
   */
  async findById(id: string): Promise<Department | null> {
    const row = await this.departmentModel.findById(id).lean().exec();

    return row ? toDepartment(row) : null;
  }
}
