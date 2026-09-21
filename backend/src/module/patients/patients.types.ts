/** Public contract for the patients module. */

export const GENDERS = ['male', 'female', 'other', 'unknown'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * NOTE (plan section 54): once real PHI is in scope these fields are
 * protected health information. They must not be logged, echoed into
 * error messages, or sent to any third-party service without a BAA.
 */
export interface Patient {
  id: string;
  name: string;
  age?: number;
  gender: Gender;
  phone?: string;
}

export interface FindPatientQuery {
  phone?: string;
  name?: string;
}
