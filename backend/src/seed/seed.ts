import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Logger } from '@nestjs/common';
import { Model } from 'mongoose';
import { AppModule } from '../app.module.js';
import { DepartmentEntity } from '../module/departments/departments.schema.js';
import { DoctorEntity } from '../module/doctors/doctors.schema.js';
import { ScheduleEntity } from '../module/schedules/schedules.schema.js';
import { PatientEntity } from '../module/patients/patients.schema.js';
import { AppointmentEntity } from '../module/appointments/appointments.schema.js';
import { DEPARTMENTS, DOCTORS, PATIENTS, SCHEDULES } from './seed-data.js';
import { dayOfWeekForDate } from '../module/schedules/schedules.types.js';

const logger = new Logger('Seed');

/** ISO date (clinic-local) N days from today. */
function isoDateIn(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Pre-book a scattering of slots over the next week.
 *
 * Deterministic rather than random, so a demo behaves the same way twice
 * and a failing scenario can actually be reproduced. The pattern leaves
 * gaps on purpose — a fully-booked or fully-free day would let the agent
 * look correct without ever consulting the schedule.
 */
function buildAppointments() {
  const bookings: Array<{
    patientId: string; doctorId: string; date: string;
    startTime: string; endTime: string; status: 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  }> = [];

  // Plan section 8's worked example: Dr. Mehta tomorrow, partly booked,
  // including two evening slots so "after 6" has both a taken and a free option.
  const tomorrow = isoDateIn(1);
  const mehtaTaken = ['09:00', '09:30', '11:00', '18:00'];
  mehtaTaken.forEach((startTime, index) => {
    bookings.push({
      patientId: PATIENTS[index]._id,
      doctorId: 'DOC001',
      date: tomorrow,
      startTime,
      endTime: addMinutes(startTime, 30),
      status: 'CONFIRMED',
    });
  });

  // A cancelled slot that must be offered again — proves cancellation
  // frees a slot rather than blocking it forever.
  bookings.push({
    patientId: PATIENTS[5]._id, doctorId: 'DOC001', date: tomorrow,
    startTime: '10:00', endTime: '10:30', status: 'CANCELLED',
  });

  // Spread the rest across the coming week for the other active doctors.
  const activeDoctors = DOCTORS.filter((d) => d.status === 'ACTIVE' && d._id !== 'DOC001');
  let patientIndex = 6;
  for (let dayOffset = 1; dayOffset <= 6; dayOffset += 1) {
    const date = isoDateIn(dayOffset);
    const weekday = dayOfWeekForDate(date);
    activeDoctors.forEach((doctor, doctorIndex) => {
      const schedule = SCHEDULES.find((s) => s.doctorId === doctor._id && s.dayOfWeek === weekday);
      if (!schedule) return;
      // Two bookings per doctor per day, offset so different doctors are
      // busy at different times.
      for (let n = 0; n < 2; n += 1) {
        const startTime = addMinutes(
          schedule.startTime,
          schedule.slotDurationMinutes * (doctorIndex + n * 3),
        );
        if (startTime >= schedule.endTime) continue;
        bookings.push({
          patientId: PATIENTS[patientIndex % PATIENTS.length]._id,
          doctorId: doctor._id,
          date,
          startTime,
          endTime: addMinutes(startTime, schedule.slotDurationMinutes),
          status: dayOffset === 1 && n === 1 ? 'COMPLETED' : 'CONFIRMED',
        });
        patientIndex += 1;
      }
    });
  }

  return bookings;
}

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const departments = app.get<Model<DepartmentEntity>>(getModelToken(DepartmentEntity.name));
    const doctors = app.get<Model<DoctorEntity>>(getModelToken(DoctorEntity.name));
    const schedules = app.get<Model<ScheduleEntity>>(getModelToken(ScheduleEntity.name));
    const patients = app.get<Model<PatientEntity>>(getModelToken(PatientEntity.name));
    const appointments = app.get<Model<AppointmentEntity>>(getModelToken(AppointmentEntity.name));

    // Re-runnable: clear only the collections this script owns, so a
    // reseed during development is predictable rather than additive.
    await Promise.all([
      departments.deleteMany({}),
      doctors.deleteMany({}),
      schedules.deleteMany({}),
      patients.deleteMany({}),
      appointments.deleteMany({}),
    ]);

    // The partial unique index on appointments is what prevents
    // double-booking; build it explicitly so a fresh database has it
    // before any data lands.
    await appointments.syncIndexes();

    await departments.insertMany(DEPARTMENTS);
    await doctors.insertMany(DOCTORS);
    await schedules.insertMany(SCHEDULES);
    await patients.insertMany(PATIENTS);

    const bookings = buildAppointments();
    await appointments.insertMany(bookings);

    logger.log(
      `Seeded ${DEPARTMENTS.length} departments, ${DOCTORS.length} doctors ` +
        `(1 ON_LEAVE, 1 BUSY, 1 OFFLINE), ${SCHEDULES.length} schedules, ` +
        `${PATIENTS.length} patients, ${bookings.length} appointments.`,
    );
    logger.log(`Tomorrow (${isoDateIn(1)}) Dr. Amit Mehta has evening availability after 18:30.`);
  } finally {
    await app.close();
  }
}

seed().catch((error: unknown) => {
  logger.error('Seed failed', error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
