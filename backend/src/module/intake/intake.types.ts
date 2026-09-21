/** Public contract for the intake module — the structured patient state
 *  the agent builds up during a conversation (plan section 10). */

export const INTAKE_STATUSES = [
  'collecting_information',
  'validating',
  'searching_slots',
  'awaiting_confirmation',
  'booked',
  'escalated',
  'abandoned',
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

/**
 * Domain-specific intake fields (plan section 7).
 *
 * Config, not hardcoded prompt logic — a fifth department can be added
 * here without touching the agent.
 */
export interface DomainConfig {
  requiredFields: string[];
  optionalFields: string[];
}

export const DOMAIN_CONFIG: Record<string, DomainConfig> = {
  DENTAL: {
    requiredFields: ['complaint', 'duration', 'location'],
    optionalFields: ['severity', 'swelling', 'bleeding', 'sensitivity'],
  },
  CARDIOLOGY: {
    requiredFields: ['reasonForVisit', 'duration'],
    optionalFields: ['medicalHistory', 'medications', 'previousVisit'],
  },
  GENERAL_MEDICINE: {
    requiredFields: ['complaint', 'duration'],
    optionalFields: ['symptoms', 'severity', 'medicalHistory', 'medications', 'allergies'],
  },
  OPHTHALMOLOGY: {
    requiredFields: ['complaint', 'duration', 'affectedEye'],
    optionalFields: ['pain', 'redness', 'visionChanges', 'glasses'],
  },
};

/**
 * Collected answers. Deliberately open-ended per department, but a field
 * is only ever present because the patient actually said it — a missing
 * value stays missing rather than being invented (plan section 42).
 */
export type IntakeFields = Record<string, string | number | boolean | string[]>;

export interface AppointmentPreference {
  preferredDoctorId?: string;
  preferredDate?: string;
  /** Free text as spoken ("evening", "after 6"), normalised downstream. */
  preferredTime?: string;
  earliestTime?: string;
  latestTime?: string;
}

export interface IntakeSession {
  id: string;
  sessionId: string;
  patientId?: string;
  intent?: string;
  departmentId?: string;
  fields: IntakeFields;
  preference: AppointmentPreference;
  status: IntakeStatus;
  transcript: TranscriptTurn[];
}

export interface TranscriptTurn {
  speaker: 'patient' | 'agent';
  text: string;
  at: Date;
}

/** Which required fields are still missing for the chosen department. */
export function missingRequiredFields(
  departmentId: string | undefined,
  fields: IntakeFields,
): string[] {
  if (!departmentId) return [];
  const config = DOMAIN_CONFIG[departmentId];
  if (!config) return [];
  return config.requiredFields.filter((field) => {
    const value = fields[field];
    return value === undefined || value === null || value === '';
  });
}

/**
 * Answer to "what should the agent ask next?" (plan section 10).
 *
 * Additive contract — the shapes above are unchanged. `complete` is
 * deliberately stricter than `missingRequiredFields().length === 0`:
 * that helper returns `[]` both when nothing is missing *and* when there
 * is no department (or no DOMAIN_CONFIG entry for it) to check against,
 * so on its own it reads as "complete" for a session that has barely
 * started. `departmentConfigured` keeps that distinction visible instead
 * of silently deciding on the caller's behalf.
 */
export interface IntakeCompleteness {
  sessionId: string;
  departmentId?: string;
  /** False when no department is chosen yet, or it has no DOMAIN_CONFIG entry. */
  departmentConfigured: boolean;
  requiredFields: string[];
  optionalFields: string[];
  missingRequiredFields: string[];
  complete: boolean;
}
