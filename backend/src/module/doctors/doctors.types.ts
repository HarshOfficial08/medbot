/** Public contract for the doctors module. */

/** Plan section 9. Only ACTIVE doctors may be offered appointment slots. */
export const DOCTOR_STATUSES = ['ACTIVE', 'BUSY', 'ON_LEAVE', 'OFFLINE'] as const;
export type DoctorStatus = (typeof DOCTOR_STATUSES)[number];

/** A doctor who can currently be booked. */
export const BOOKABLE_STATUSES: readonly DoctorStatus[] = ['ACTIVE'];

export interface Doctor {
  id: string;
  name: string;
  departmentId: string;
  specialization: string;
  status: DoctorStatus;
}

export interface FindDoctorsQuery {
  departmentId?: string;
  status?: DoctorStatus;
  /** Only doctors who can actually be booked right now. */
  bookableOnly?: boolean;
}
