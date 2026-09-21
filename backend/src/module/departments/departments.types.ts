/**
 * Public contract for the departments module.
 *
 * Other modules import from here — never from departments.schema.ts.
 * Nothing crosses a module boundary as a Mongoose document (CLAUDE.md,
 * Architecture rule 4).
 */
export interface Department {
  id: string;
  name: string;
  active: boolean;
}

/** The four clinical domains from plan section 6. */
export const DEPARTMENT_IDS = [
  'DENTAL',
  'CARDIOLOGY',
  'GENERAL_MEDICINE',
  'OPHTHALMOLOGY',
] as const;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];
