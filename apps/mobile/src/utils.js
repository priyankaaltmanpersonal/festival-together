// ─── Grid layout constants ────────────────────────────────────────────────────

export const SLOT_MINUTES = 30;
export const SLOT_HEIGHT = 44;

// ─── Time string utilities ────────────────────────────────────────────────────

/**
 * Convert a "HH:MM" time string to total minutes since festival "day start" (06:00).
 * Hours 0–5 are treated as next-day (extended: +24h), matching festival late-night sets.
 */
export function timeToMinutes(timePt) {
  const [h, m] = (timePt || '00:00').split(':').map((n) => parseInt(n, 10));
  const adjustedHour = h < 6 ? h + 24 : h;
  return adjustedHour * 60 + m;
}

/**
 * Format total minutes (since midnight) as "h:mm AM/PM".
 * Handles extended hours (e.g. 1530 = 25:30 normalizes to 1:30 AM).
 */
export function formatTime(totalMinutes) {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const normalizedHour = h24 % 24;
  const suffix = normalizedHour >= 12 ? 'PM' : 'AM';
  const h12 = ((normalizedHour + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

// ─── Grid position utilities ──────────────────────────────────────────────────

/**
 * Convert a minute value to a pixel Y position within the schedule grid.
 */
export function minuteToY(minute, startMinute) {
  return ((minute - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT;
}

/**
 * Build the timeline descriptor for the schedule grid given a list of sets.
 * Returns null if there are no sets.
 */
export function buildTimeline(sets, minBodyHeight = 0) {
  if (!sets.length) return null;

  let minStart = Number.POSITIVE_INFINITY;
  let maxEnd = Number.NEGATIVE_INFINITY;
  for (const setItem of sets) {
    const start = timeToMinutes(setItem.start_time_pt);
    const rawEnd = timeToMinutes(setItem.end_time_pt);
    const rawDuration = rawEnd - start;
    const effectiveEnd = start + (rawDuration > 0 ? rawDuration : 90);
    minStart = Math.min(minStart, start);
    maxEnd = Math.max(maxEnd, effectiveEnd);
  }

  const startMinute = Math.floor(minStart / SLOT_MINUTES) * SLOT_MINUTES;
  let endMinute = Math.ceil(maxEnd / SLOT_MINUTES) * SLOT_MINUTES;

  while (((endMinute - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT < minBodyHeight) {
    endMinute += SLOT_MINUTES;
  }

  const labels = [];
  for (let minute = startMinute; minute <= endMinute; minute += SLOT_MINUTES) {
    labels.push(minute);
  }

  return {
    startMinute,
    endMinute,
    labels,
    totalHeight: ((endMinute - startMinute) / SLOT_MINUTES) * SLOT_HEIGHT,
  };
}

// ─── Display utilities ────────────────────────────────────────────────────────

/**
 * Generate 1–2 character initials from a display name.
 */
export function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] || '';
  const second = parts[1]?.[0] || parts[0]?.[1] || '';
  return `${first}${second}`.toUpperCase();
}

/**
 * Convert a hex color string to rgba with the given alpha.
 */
export function withAlpha(hexColor, alpha) {
  const raw = (hexColor || '').replace('#', '');
  if (!/^[0-9A-Fa-f]{6}$/.test(raw)) {
    return `rgba(0, 0, 0, ${alpha})`;
  }
  const intValue = parseInt(raw, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Date / time picker utilities ─────────────────────────────────────────────

/**
 * Convert a "HH:MM" 24h string to a Date object suitable for DateTimePicker.
 * Normalizes extended hours (>= 24) by subtracting 24.
 * Returns a default Date at 20:00 if input is falsy.
 */
export function timeStringToDate(timeStr) {
  if (!timeStr) return makeDefaultDate(20);
  const [hStr, mStr] = timeStr.split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr || '0', 10);
  if (h >= 24) h -= 24;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/**
 * Format a Date as a "HH:MM" 24h string, zero-padded.
 */
export function formatHHMM(date) {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Convert a Date to total minutes, treating hours 0–5 as next-day (+24h).
 */
export function timeToTotalMinutes(date) {
  const h = date.getHours();
  const m = date.getMinutes();
  return (h < 6 ? h + 24 : h) * 60 + m;
}

/**
 * Format a Date as "h:mm AM/PM" for display in the UI.
 */
export function formatDisplayTime(date) {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function makeDefaultDate(hour) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  return d;
}
