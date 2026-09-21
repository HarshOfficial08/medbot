import { DayOfWeek } from '../module/schedules/schedules.types.js';
import type { DoctorStatus } from '../module/doctors/doctors.types.js';
import type { Gender } from '../module/patients/patients.types.js';

/**
 * Synthetic seed data (plan section 8). No real patient information —
 * every name, phone and complaint here is invented.
 *
 * The point of this data is not volume, it's *interesting states*: a
 * doctor on leave, days that are partly booked, and evening clinics — so
 * the agent has to actually check the system rather than always finding
 * the first slot it looks at.
 */

export interface SeedDepartment {
  _id: string;
  name: string;
  active: boolean;
}

export interface SeedDoctor {
  _id: string;
  name: string;
  departmentId: string;
  specialization: string;
  status: DoctorStatus;
}

export interface SeedSchedule {
  doctorId: string;
  dayOfWeek: DayOfWeek;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
}

export interface SeedPatient {
  _id: string;
  name: string;
  age?: number;
  gender: Gender;
  phone?: string;
}

export const DEPARTMENTS: SeedDepartment[] = [
  { _id: 'DENTAL', name: 'Dental', active: true },
  { _id: 'CARDIOLOGY', name: 'Cardiology', active: true },
  { _id: 'GENERAL_MEDICINE', name: 'General Medicine', active: true },
  { _id: 'OPHTHALMOLOGY', name: 'Ophthalmology', active: true },
];

export const DOCTORS: SeedDoctor[] = [
  // Dental — includes the ON_LEAVE case from plan section 8, which is what
  // forces the agent to notice status instead of assuming availability.
  { _id: 'DOC001', name: 'Dr. Amit Mehta', departmentId: 'DENTAL', specialization: 'General Dentistry', status: 'ACTIVE' },
  { _id: 'DOC002', name: 'Dr. Priya Shah', departmentId: 'DENTAL', specialization: 'Endodontics', status: 'ON_LEAVE' },
  { _id: 'DOC003', name: 'Dr. Ravi Patel', departmentId: 'DENTAL', specialization: 'Oral Surgery', status: 'ACTIVE' },

  { _id: 'DOC004', name: 'Dr. Sunita Rao', departmentId: 'CARDIOLOGY', specialization: 'Interventional Cardiology', status: 'ACTIVE' },
  { _id: 'DOC005', name: 'Dr. Vikram Nair', departmentId: 'CARDIOLOGY', specialization: 'Electrophysiology', status: 'ACTIVE' },
  { _id: 'DOC006', name: 'Dr. Anjali Desai', departmentId: 'CARDIOLOGY', specialization: 'Preventive Cardiology', status: 'BUSY' },

  { _id: 'DOC007', name: 'Dr. Kiran Joshi', departmentId: 'GENERAL_MEDICINE', specialization: 'Internal Medicine', status: 'ACTIVE' },
  { _id: 'DOC008', name: 'Dr. Meera Iyer', departmentId: 'GENERAL_MEDICINE', specialization: 'Family Medicine', status: 'ACTIVE' },
  { _id: 'DOC009', name: 'Dr. Arjun Bose', departmentId: 'GENERAL_MEDICINE', specialization: 'Internal Medicine', status: 'OFFLINE' },

  { _id: 'DOC010', name: 'Dr. Neha Kulkarni', departmentId: 'OPHTHALMOLOGY', specialization: 'Retina', status: 'ACTIVE' },
  { _id: 'DOC011', name: 'Dr. Sanjay Gupta', departmentId: 'OPHTHALMOLOGY', specialization: 'Cornea', status: 'ACTIVE' },
  { _id: 'DOC012', name: 'Dr. Farah Khan', departmentId: 'OPHTHALMOLOGY', specialization: 'General Ophthalmology', status: 'ACTIVE' },
];

const WEEKDAYS: DayOfWeek[] = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY'];
const ALL_DAYS: DayOfWeek[] = [...WEEKDAYS, 'SATURDAY'];

function schedulesFor(
  doctorId: string,
  days: DayOfWeek[],
  startTime: string,
  endTime: string,
  slotDurationMinutes = 30,
): SeedSchedule[] {
  return days.map((dayOfWeek) => ({ doctorId, dayOfWeek, startTime, endTime, slotDurationMinutes }));
}

/**
 * Deliberate spread of clinic hours. Several doctors run evening clinics
 * past 18:00 because the canonical demo asks for "a dentist tomorrow
 * after 6" — without an evening schedule that request has no answer and
 * the demo proves nothing.
 */
export const SCHEDULES: SeedSchedule[] = [
  ...schedulesFor('DOC001', ALL_DAYS, '09:00', '20:00'),
  ...schedulesFor('DOC002', WEEKDAYS, '09:00', '17:00'),
  ...schedulesFor('DOC003', ALL_DAYS, '14:00', '20:00'),

  ...schedulesFor('DOC004', WEEKDAYS, '09:00', '13:00'),
  ...schedulesFor('DOC005', WEEKDAYS, '15:00', '19:00'),
  ...schedulesFor('DOC006', WEEKDAYS, '10:00', '16:00'),

  ...schedulesFor('DOC007', ALL_DAYS, '08:00', '14:00', 20),
  ...schedulesFor('DOC008', ALL_DAYS, '15:00', '21:00', 20),
  ...schedulesFor('DOC009', WEEKDAYS, '09:00', '17:00'),

  ...schedulesFor('DOC010', WEEKDAYS, '10:00', '17:00'),
  ...schedulesFor('DOC011', ['TUESDAY', 'THURSDAY', 'SATURDAY'], '09:00', '18:00'),
  ...schedulesFor('DOC012', ALL_DAYS, '11:00', '19:00'),
];

const FIRST_NAMES = ['Rahul', 'Sneha', 'Imran', 'Divya', 'Karan', 'Ananya', 'Rohit', 'Fatima', 'Nikhil', 'Pooja',
  'Aditya', 'Zara', 'Manish', 'Ishita', 'Varun', 'Leena', 'Siddharth', 'Nandini', 'Harsh', 'Tanvi',
  'Yash', 'Ritu', 'Gaurav', 'Shruti'];
const LAST_NAMES = ['Sharma', 'Verma', 'Qureshi', 'Menon', 'Singh', 'Chatterjee', 'Reddy', 'Ansari', 'Kapoor', 'Malhotra'];
const GENDER_CYCLE: Gender[] = ['male', 'female', 'other', 'unknown'];

/** 24 synthetic patients. Phone numbers use the 555-0xxx reserved range. */
export const PATIENTS: SeedPatient[] = FIRST_NAMES.map((firstName, index) => {
  const id = `PAT${String(index + 1).padStart(3, '0')}`;
  const patient: SeedPatient = {
    _id: id,
    name: `${firstName} ${LAST_NAMES[index % LAST_NAMES.length]}`,
    gender: GENDER_CYCLE[index % GENDER_CYCLE.length],
    phone: `+1555010${String(index + 1).padStart(2, '0')}`,
  };
  // Every fourth patient has no recorded age, so "unknown stays unknown"
  // is represented in the data rather than only in the rules.
  if (index % 4 !== 3) patient.age = 22 + ((index * 7) % 45);
  return patient;
});
