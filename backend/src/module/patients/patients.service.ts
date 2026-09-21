import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { PatientEntity } from './patients.schema.js';
import type { PatientDocument } from './patients.schema.js';
import type { Gender, Patient } from './patients.types.js';

/** Readable ids, e.g. "PAT001" (plan section 9). */
const ID_PREFIX = 'PAT';
const ID_PAD = 3;

/**
 * A generated id can still lose a race with a concurrent create — the
 * voice agent and the dashboard can both be creating patients. The
 * duplicate-key error is retried rather than surfaced.
 */
const MAX_ID_ATTEMPTS = 5;

/** What callers may supply when creating a patient. */
export interface CreatePatientInput {
  name: string;
  age?: number;
  gender?: Gender;
  phone?: string;
}

/** What callers may change. Omitted fields are left as they are. */
export interface UpdatePatientInput {
  name?: string;
  age?: number;
  gender?: Gender;
  phone?: string;
}

/** The fields this module reads off a stored patient. */
type PatientRow = Pick<
  PatientEntity,
  '_id' | 'name' | 'age' | 'gender' | 'phone'
>;

/** What actually gets written. */
type PatientWrite = Omit<PatientRow, 'age' | 'phone'> & {
  age?: number;
  phone?: string;
};

/**
 * Mongo row -> public contract.
 *
 * `_id` becomes `id` here and nowhere else, so nothing outside this
 * module ever sees a Mongoose document (CLAUDE.md, Architecture rule 4).
 *
 * `age`/`phone` keys are omitted entirely when unset rather than set to
 * null: an absent value must read as absent, not as an asserted blank
 * (plan section 42).
 */
function toPatient(row: PatientRow): Patient {
  const patient: Patient = {
    id: row._id,
    name: row.name,
    gender: row.gender,
  };

  if (row.age !== undefined && row.age !== null) {
    patient.age = row.age;
  }
  if (row.phone !== undefined && row.phone !== null) {
    patient.phone = row.phone;
  }

  return patient;
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}

@Injectable()
export class PatientsService {
  constructor(
    @InjectModel(PatientEntity.name)
    private readonly patientModel: Model<PatientDocument>,
  ) {}

  async findById(id: string): Promise<Patient | null> {
    const row = await this.patientModel.findById(id).lean().exec();

    return row ? toPatient(row) : null;
  }

  /**
   * Everyone reachable on this number — a household can share one, so
   * this is deliberately not "the" patient. Callers disambiguate; the
   * agent must never assume the first match is the caller.
   */
  async findByPhone(phone: string): Promise<Patient[]> {
    const rows = await this.patientModel
      .find({ phone })
      .sort({ _id: 1 })
      .lean()
      .exec();

    return rows.map(toPatient);
  }

  async create(input: CreatePatientInput): Promise<Patient> {
    for (let attempt = 1; attempt <= MAX_ID_ATTEMPTS; attempt += 1) {
      const write: PatientWrite = {
        _id: await this.nextId(),
        name: input.name,
        // The contract's explicit "we were not told" marker, which is not
        // the same thing as inventing a value.
        gender: input.gender ?? 'unknown',
      };

      // Only write what was actually supplied: an absent age or phone
      // stays absent from the document.
      if (input.age !== undefined) {
        write.age = input.age;
      }
      if (input.phone !== undefined) {
        write.phone = input.phone;
      }

      try {
        const created = await this.patientModel.create(write);
        return toPatient(created.toObject());
      } catch (error) {
        if (!isDuplicateKeyError(error) || attempt === MAX_ID_ATTEMPTS) {
          throw error;
        }
        // Lost the id race; recompute and try again.
      }
    }

    /* c8 ignore next */
    throw new Error(`Could not allocate a patient id after ${MAX_ID_ATTEMPTS} attempts.`);
  }

  /** Returns null when the patient does not exist — the 404 is the controller's call. */
  async update(id: string, changes: UpdatePatientInput): Promise<Patient | null> {
    const write: Partial<Omit<PatientWrite, '_id'>> = {};

    if (changes.name !== undefined) {
      write.name = changes.name;
    }
    if (changes.age !== undefined) {
      write.age = changes.age;
    }
    if (changes.gender !== undefined) {
      write.gender = changes.gender;
    }
    if (changes.phone !== undefined) {
      write.phone = changes.phone;
    }

    // Nothing to change: don't issue a write that would only bump
    // `updatedAt` and look like a real edit in the audit trail.
    if (Object.keys(write).length === 0) {
      return this.findById(id);
    }

    const row = await this.patientModel
      .findByIdAndUpdate(
        id,
        { $set: write },
        // 'after' so the response is the stored record, not the
        // pre-update one; runValidators keeps schema rules (the gender
        // enum) enforced on updates as well as on inserts.
        { returnDocument: 'after', runValidators: true },
      )
      .lean()
      .exec();

    return row ? toPatient(row) : null;
  }

  /**
   * Next sequential id.
   *
   * Computed with $max over the numeric suffix rather than a
   * lexicographic `sort({_id: -1})`: as strings "PAT999" sorts above
   * "PAT1000", so the simple version would start reissuing taken ids at
   * the thousandth patient.
   */
  private async nextId(): Promise<string> {
    const [row] = await this.patientModel
      .aggregate<{ maxSequence: number }>([
        { $match: { _id: { $regex: `^${ID_PREFIX}[0-9]+$` } } },
        {
          $group: {
            _id: null,
            maxSequence: {
              $max: {
                $toInt: {
                  $replaceOne: {
                    input: '$_id',
                    find: ID_PREFIX,
                    replacement: '',
                  },
                },
              },
            },
          },
        },
      ])
      .exec();

    const next = (row?.maxSequence ?? 0) + 1;

    return `${ID_PREFIX}${String(next).padStart(ID_PAD, '0')}`;
  }
}
