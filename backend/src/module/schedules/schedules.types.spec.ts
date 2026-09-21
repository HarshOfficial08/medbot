import { DAYS_OF_WEEK, TIME_PATTERN, dayOfWeekForDate } from './schedules.types.js';

/** Runs `fn` as if the server were in `timeZone`. */
function inTimeZone<T>(timeZone: string, fn: () => T): T {
  const saved = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return fn();
  } finally {
    if (saved === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = saved;
    }
  }
}

describe('dayOfWeekForDate', () => {
  it('returns the weekday of an ISO date', () => {
    expect(dayOfWeekForDate('2026-09-21')).toBe('MONDAY');
    expect(dayOfWeekForDate('2026-09-20')).toBe('SUNDAY');
    expect(dayOfWeekForDate('2026-09-26')).toBe('SATURDAY');
  });

  it('agrees with the calendar across a whole week', () => {
    const week = [
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
      '2026-09-23',
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
    ];

    expect(week.map(dayOfWeekForDate)).toEqual([...DAYS_OF_WEEK]);
  });

  it('does not shift a day west of Greenwich', () => {
    // This helper exists precisely for this case: in Los Angeles,
    // `new Date('2026-09-21')` parses as UTC midnight, which is 17:00 on
    // the 20th locally — a naive read would call Monday a Sunday and
    // book against the wrong working window.
    inTimeZone('America/Los_Angeles', () => {
      expect(dayOfWeekForDate('2026-09-21')).toBe('MONDAY');

      // Only assert the trap itself if the runtime honoured the TZ change.
      if (new Date('2026-09-21T12:00:00Z').getHours() !== 12) {
        expect(new Date('2026-09-21').getDay()).toBe(0); // "Sunday" — the bug
      }
    });
  });

  it('does not shift a day east of Greenwich either', () => {
    inTimeZone('Pacific/Kiritimati', () => {
      expect(dayOfWeekForDate('2026-09-21')).toBe('MONDAY');
    });
  });

  it('is stable across timezones for a month boundary', () => {
    // 1 March after a leap day: the date arithmetic and the timezone
    // offset can each be off by one, and would cancel out invisibly.
    const days = ['America/Los_Angeles', 'UTC', 'Asia/Kolkata', 'Pacific/Auckland'].map(
      (timeZone) => inTimeZone(timeZone, () => dayOfWeekForDate('2028-03-01')),
    );

    expect(days).toEqual(['WEDNESDAY', 'WEDNESDAY', 'WEDNESDAY', 'WEDNESDAY']);
  });
});

describe('TIME_PATTERN', () => {
  it('accepts a 24-hour "HH:mm"', () => {
    for (const time of ['00:00', '09:05', '13:30', '23:59']) {
      expect(TIME_PATTERN.test(time)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const time of ['24:00', '9:00', '09:60', '09:00:00', '0900', '', 'noon']) {
      expect(TIME_PATTERN.test(time)).toBe(false);
    }
  });
});
