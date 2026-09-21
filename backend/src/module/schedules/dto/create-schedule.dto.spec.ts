import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateScheduleDto, minutesSinceMidnight } from './create-schedule.dto.js';

function errorsFor(payload: Record<string, unknown>): string[] {
  const dto = plainToInstance(CreateScheduleDto, payload);
  return validateSync(dto).map((error) => error.property);
}

const VALID = {
  doctorId: 'DOC001',
  dayOfWeek: 'MONDAY',
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: 30,
};

describe('CreateScheduleDto', () => {
  it('accepts a well-formed window', () => {
    expect(errorsFor(VALID)).toEqual([]);
  });

  it('rejects times that are not "HH:mm"', () => {
    expect(errorsFor({ ...VALID, startTime: '9:00' })).toContain('startTime');
    expect(errorsFor({ ...VALID, endTime: '25:00' })).toContain('endTime');
  });

  it('rejects an endTime that is not after startTime', () => {
    // A window that ends before it starts yields zero slots silently —
    // the doctor looks fully booked with nothing to explain why.
    expect(errorsFor({ ...VALID, startTime: '17:00', endTime: '09:00' })).toContain(
      'endTime',
    );
    expect(errorsFor({ ...VALID, startTime: '09:00', endTime: '09:00' })).toContain(
      'endTime',
    );
  });

  it('rejects an unknown weekday', () => {
    expect(errorsFor({ ...VALID, dayOfWeek: 'CATURDAY' })).toContain('dayOfWeek');
  });

  it('rejects an implausible slot duration', () => {
    expect(errorsFor({ ...VALID, slotDurationMinutes: 0 })).toContain(
      'slotDurationMinutes',
    );
    expect(errorsFor({ ...VALID, slotDurationMinutes: 1440 })).toContain(
      'slotDurationMinutes',
    );
  });
});

describe('minutesSinceMidnight', () => {
  it('orders times within a day', () => {
    expect(minutesSinceMidnight('00:00')).toBe(0);
    expect(minutesSinceMidnight('09:30')).toBe(570);
    expect(minutesSinceMidnight('23:59')).toBe(1439);
  });
});
