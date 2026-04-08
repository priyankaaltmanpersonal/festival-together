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

  it('pads 30 minutes before the earliest set', () => {
    const sets = [{ start_time_pt: '17:30', end_time_pt: '18:20' }];
    const result = buildTimeline(sets, 0);
    // 17:30 = 1050 min → floor to 1050 → minus 30 = 1020 (17:00)
    expect(result.startMinute).toBe(17 * 60);
  });

  it('pads 30 minutes even when set starts exactly on a slot boundary', () => {
    const sets = [{ start_time_pt: '18:00', end_time_pt: '19:00' }];
    const result = buildTimeline(sets, 0);
    // 18:00 = 1080 → floor to 1080 → minus 30 = 1050 (17:30)
    expect(result.startMinute).toBe(17 * 60 + 30);
  });

  it('builds correct timeline for a single set', () => {
    const sets = [{ start_time_pt: '21:00', end_time_pt: '22:00' }];
    const result = buildTimeline(sets, 0);
    // 21:00 = 1260 → minus 30 padding = 1230
    expect(result.startMinute).toBe(1230);
    expect(result.endMinute).toBe(1320);
    expect(result.labels).toEqual([1230, 1260, 1290, 1320]);
    expect(result.totalHeight).toBe(132); // (1320-1230)/30*44
  });

  it('uses 120-min default duration when end_time_pt is null', () => {
    // Backend omits end time for last artist on a stage — should span 2 hours
    const sets = [{ start_time_pt: '21:00', end_time_pt: null }];
    const result = buildTimeline(sets, 0);
    // effectiveEnd = 1260 + 120 = 1380; startMinute = 1260 - 30 = 1230
    expect(result.startMinute).toBe(1230);
    expect(result.endMinute).toBe(1380);
    expect(result.totalHeight).toBe(220); // (1380-1230)/30*44
  });

  it('uses 120-min default duration when end < start', () => {
    const sets = [{ start_time_pt: '22:00', end_time_pt: '21:00' }];
    const result = buildTimeline(sets, 0);
    // effectiveEnd = 1320 + 120 = 1440; startMinute = 1320 - 30 = 1290
    expect(result.startMinute).toBe(1290);
    expect(result.endMinute).toBe(1440);
    expect(result.totalHeight).toBe(220); // (1440-1290)/30*44
  });

  it('spans multiple sets correctly', () => {
    const sets = [
      { start_time_pt: '21:00', end_time_pt: '22:00' },
      { start_time_pt: '22:30', end_time_pt: '23:30' },
    ];
    const result = buildTimeline(sets, 0);
    // startMinute = 1260 - 30 = 1230
    expect(result.startMinute).toBe(1230);
    expect(result.endMinute).toBe(1410);
  });

  it('extends endMinute to fill minBodyHeight', () => {
    const sets = [{ start_time_pt: '21:00', end_time_pt: '22:00' }];
    // startMinute=1230, endMinute after padding=1320, height=132 < 200
    // extends: 1350→176, 1380→220 ≥ 200 → stop at 1380
    const result = buildTimeline(sets, 200);
    expect(result.endMinute).toBe(1380);
    expect(result.totalHeight).toBe(220);
  });

  it('snaps startMinute down to nearest 30-min slot then pads', () => {
    const sets = [{ start_time_pt: '21:15', end_time_pt: '22:00' }];
    const result = buildTimeline(sets, 0);
    // 21:15 = 1275 → floor(1275/30)*30 = 1260 → minus 30 = 1230
    expect(result.startMinute).toBe(1230);
  });
});

// ─── deletePersonalSet schedule snapshot transform ────────────────────────────

describe('deletePersonalSet schedule snapshot transform', () => {
  it('removes the deleted member from the matching set using id field', () => {
    const sets = [
      {
        id: 'set-abc',
        attendees: [{ member_id: 'me' }, { member_id: 'other' }],
        attendee_count: 2,
      },
      {
        id: 'set-xyz',
        attendees: [{ member_id: 'other' }],
        attendee_count: 1,
      },
    ];
    const canonicalSetId = 'set-abc';
    const myId = 'me';

    // This is the exact transform used in deletePersonalSet in App.js
    const updated = sets.map((setItem) => {
      if (setItem.id !== canonicalSetId) return setItem;
      const newAttendees = setItem.attendees.filter((a) => a.member_id !== myId);
      return { ...setItem, attendees: newAttendees, attendee_count: newAttendees.length };
    });

    expect(updated[0].attendees).toHaveLength(1);
    expect(updated[0].attendees[0].member_id).toBe('other');
    expect(updated[0].attendee_count).toBe(1);
    expect(updated[1].attendees).toHaveLength(1); // unrelated set unchanged
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
