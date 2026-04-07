import {
  timeToMinutes,
  formatTime,
  minuteToY,
  buildTimeline,
  initials,
  withAlpha,
  timeStringToDate,
  formatHHMM,
  timeToTotalMinutes,
  formatDisplayTime,
  SLOT_MINUTES,
  SLOT_HEIGHT,
} from '../utils';

// ─── timeToMinutes ────────────────────────────────────────────────────────────

describe('timeToMinutes', () => {
  it('converts normal PM hours', () => {
    expect(timeToMinutes('21:30')).toBe(1290);
    expect(timeToMinutes('22:00')).toBe(1320);
  });

  it('converts normal AM hours (6+) without extension', () => {
    expect(timeToMinutes('06:00')).toBe(360);
    expect(timeToMinutes('12:00')).toBe(720);
  });

  it('extends hours 0–5 by 24 (next-day late-night sets)', () => {
    expect(timeToMinutes('00:00')).toBe(1440);
    expect(timeToMinutes('02:30')).toBe(1590);
    expect(timeToMinutes('05:59')).toBe(1799);
  });

  it('handles null/undefined with "00:00" fallback (extended)', () => {
    expect(timeToMinutes(undefined)).toBe(1440);
    expect(timeToMinutes(null)).toBe(1440);
  });
});

// ─── formatTime ───────────────────────────────────────────────────────────────

describe('formatTime', () => {
  it('formats PM hours', () => {
    expect(formatTime(1290)).toBe('9:30 PM');
    expect(formatTime(780)).toBe('1:00 PM');
  });

  it('formats noon correctly', () => {
    expect(formatTime(720)).toBe('12:00 PM');
  });

  it('formats midnight correctly', () => {
    expect(formatTime(0)).toBe('12:00 AM');
  });

  it('formats standard AM hours', () => {
    expect(formatTime(60)).toBe('1:00 AM');
    expect(formatTime(390)).toBe('6:30 AM');
  });

  it('normalizes extended hours (e.g. 25:30 → 1:30 AM)', () => {
    expect(formatTime(1530)).toBe('1:30 AM');
  });
});

// ─── minuteToY ────────────────────────────────────────────────────────────────

describe('minuteToY', () => {
  it('returns 0 when minute equals startMinute', () => {
    expect(minuteToY(720, 720)).toBe(0);
  });

  it('returns SLOT_HEIGHT for one slot (30 min)', () => {
    expect(minuteToY(750, 720)).toBe(SLOT_HEIGHT);
  });

  it('scales linearly', () => {
    expect(minuteToY(780, 720)).toBe(SLOT_HEIGHT * 2);
    expect(minuteToY(735, 720)).toBe(SLOT_HEIGHT / 2);
  });
});

// ─── buildTimeline ────────────────────────────────────────────────────────────

describe('buildTimeline', () => {
  it('returns null for empty sets', () => {
    expect(buildTimeline([], 0)).toBeNull();
  });

  it('builds correct timeline for a single set', () => {
    const sets = [{ start_time_pt: '21:00', end_time_pt: '22:00' }];
    const result = buildTimeline(sets, 0);
    expect(result.startMinute).toBe(1260);
    expect(result.endMinute).toBe(1320);
    expect(result.labels).toEqual([1260, 1290, 1320]);
    expect(result.totalHeight).toBe(88);
  });

  it('uses 90-min default duration when end < start', () => {
    const sets = [{ start_time_pt: '22:00', end_time_pt: '21:00' }];
    const result = buildTimeline(sets, 0);
    expect(result.startMinute).toBe(1320);
    expect(result.endMinute).toBe(1410);
    expect(result.totalHeight).toBe(132);
  });

  it('spans multiple sets correctly', () => {
    const sets = [
      { start_time_pt: '21:00', end_time_pt: '22:00' },
      { start_time_pt: '22:30', end_time_pt: '23:30' },
    ];
    const result = buildTimeline(sets, 0);
    expect(result.startMinute).toBe(1260);
    expect(result.endMinute).toBe(1410);
  });

  it('extends endMinute to fill minBodyHeight', () => {
    const sets = [{ start_time_pt: '21:00', end_time_pt: '22:00' }];
    const result = buildTimeline(sets, 200);
    expect(result.endMinute).toBe(1410);
    expect(result.totalHeight).toBe(220);
  });

  it('snaps startMinute down to nearest 30-min slot', () => {
    const sets = [{ start_time_pt: '21:15', end_time_pt: '22:00' }];
    const result = buildTimeline(sets, 0);
    expect(result.startMinute).toBe(1260);
  });
});

// ─── initials ─────────────────────────────────────────────────────────────────

describe('initials', () => {
  it('returns first two letters of a single word uppercased', () => {
    expect(initials('Drake')).toBe('DR');
  });

  it('returns first letter of each word for two-word names', () => {
    expect(initials('Bad Bunny')).toBe('BB');
    expect(initials('tyler the creator')).toBe('TT');
  });

  it('returns "?" for empty string', () => {
    expect(initials('')).toBe('?');
  });

  it('returns "?" for null/undefined', () => {
    expect(initials(null)).toBe('?');
    expect(initials(undefined)).toBe('?');
  });
});

// ─── withAlpha ────────────────────────────────────────────────────────────────

describe('withAlpha', () => {
  it('converts valid hex to rgba', () => {
    expect(withAlpha('#4D73FF', 0.2)).toBe('rgba(77, 115, 255, 0.2)');
    expect(withAlpha('#FF0000', 1)).toBe('rgba(255, 0, 0, 1)');
  });

  it('works without leading #', () => {
    expect(withAlpha('FF0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)');
  });

  it('returns rgba(0,0,0,α) for invalid hex', () => {
    expect(withAlpha('invalid', 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(withAlpha(null, 0.5)).toBe('rgba(0, 0, 0, 0.5)');
    expect(withAlpha(undefined, 0.5)).toBe('rgba(0, 0, 0, 0.5)');
  });
});

// ─── timeStringToDate ─────────────────────────────────────────────────────────

describe('timeStringToDate', () => {
  it('converts "HH:MM" string to Date with correct hours and minutes', () => {
    const d = timeStringToDate('21:00');
    expect(d.getHours()).toBe(21);
    expect(d.getMinutes()).toBe(0);
  });

  it('normalizes extended hours (25:30 → 1:30)', () => {
    const d = timeStringToDate('25:30');
    expect(d.getHours()).toBe(1);
    expect(d.getMinutes()).toBe(30);
  });

  it('returns default 20:00 for empty/undefined input', () => {
    const d = timeStringToDate('');
    expect(d.getHours()).toBe(20);
    expect(d.getMinutes()).toBe(0);

    const d2 = timeStringToDate(undefined);
    expect(d2.getHours()).toBe(20);
    expect(d2.getMinutes()).toBe(0);
  });
});

// ─── formatHHMM ───────────────────────────────────────────────────────────────

describe('formatHHMM', () => {
  it('pads single-digit hours and minutes', () => {
    const d = new Date();
    d.setHours(9, 5, 0, 0);
    expect(formatHHMM(d)).toBe('09:05');
  });

  it('formats double-digit hours and minutes', () => {
    const d = new Date();
    d.setHours(21, 30, 0, 0);
    expect(formatHHMM(d)).toBe('21:30');
  });
});

// ─── timeToTotalMinutes ───────────────────────────────────────────────────────

describe('timeToTotalMinutes', () => {
  it('converts normal hours to total minutes', () => {
    const d = new Date();
    d.setHours(21, 30, 0, 0);
    expect(timeToTotalMinutes(d)).toBe(1290);
  });

  it('extends hours 0–5 by 24 (next-day)', () => {
    const d = new Date();
    d.setHours(2, 0, 0, 0);
    expect(timeToTotalMinutes(d)).toBe(1560);
  });

  it('does not extend hour 6', () => {
    const d = new Date();
    d.setHours(6, 0, 0, 0);
    expect(timeToTotalMinutes(d)).toBe(360);
  });
});

// ─── formatDisplayTime ────────────────────────────────────────────────────────

describe('formatDisplayTime', () => {
  it('formats a PM time', () => {
    const d = new Date();
    d.setHours(21, 30, 0, 0);
    expect(formatDisplayTime(d)).toBe('9:30 PM');
  });

  it('formats noon', () => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    expect(formatDisplayTime(d)).toBe('12:00 PM');
  });

  it('formats midnight as 12:00 AM', () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    expect(formatDisplayTime(d)).toBe('12:00 AM');
  });
});
