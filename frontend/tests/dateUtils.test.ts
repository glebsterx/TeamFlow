import { describe, it, expect } from 'vitest';
import {
  parseUTC,
  getDueStatus,
  plural,
  formatTime,
  toDateInputValue,
  toISOString,
} from '../src/utils/dateUtils';

describe('parseUTC', () => {
  it('returns Invalid Date for empty input', () => {
    expect(isNaN(parseUTC('').getTime())).toBe(true);
  });

  it('treats a naive SQLite datetime string as UTC', () => {
    const withZ = parseUTC('2026-01-15T10:00:00Z');
    const naive = parseUTC('2026-01-15T10:00:00');
    expect(naive.getTime()).toBe(withZ.getTime());
  });

  it('leaves an already-offset string untouched', () => {
    const date = parseUTC('2026-01-15T10:00:00+03:00');
    expect(date.getTime()).toBe(new Date('2026-01-15T10:00:00+03:00').getTime());
  });
});

describe('getDueStatus', () => {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  const addDays = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return iso(d);
  };

  it('returns null when there is no due date', () => {
    expect(getDueStatus(undefined, 'TODO')).toBeNull();
  });

  it('returns null for DONE tasks regardless of due date', () => {
    expect(getDueStatus(addDays(-5), 'DONE')).toBeNull();
  });

  it('returns null for CANCELLED tasks', () => {
    expect(getDueStatus(addDays(-5), 'CANCELLED')).toBeNull();
  });

  it('flags a past due date as overdue', () => {
    expect(getDueStatus(addDays(-1), 'TODO')).toBe('overdue');
  });

  it('flags today as today', () => {
    expect(getDueStatus(addDays(0), 'TODO')).toBe('today');
  });

  it('flags the next 3 days as soon', () => {
    expect(getDueStatus(addDays(3), 'TODO')).toBe('soon');
  });

  it('flags anything further out as upcoming', () => {
    expect(getDueStatus(addDays(10), 'TODO')).toBe('upcoming');
  });
});

describe('plural (Russian pluralization)', () => {
  const forms: [string, string, string] = ['подзадача', 'подзадачи', 'подзадач'];

  it('picks the singular form for 1, 21, 31...', () => {
    expect(plural(1, forms)).toBe('подзадача');
    expect(plural(21, forms)).toBe('подзадача');
  });

  it('picks the "few" form for 2-4 (and 22-24...)', () => {
    expect(plural(2, forms)).toBe('подзадачи');
    expect(plural(4, forms)).toBe('подзадачи');
    expect(plural(22, forms)).toBe('подзадачи');
  });

  it('picks the "many" form for 0, 5-20, 25...', () => {
    expect(plural(0, forms)).toBe('подзадач');
    expect(plural(5, forms)).toBe('подзадач');
    expect(plural(11, forms)).toBe('подзадач');
    expect(plural(25, forms)).toBe('подзадач');
  });
});

describe('formatTime', () => {
  it('formats zero as "0 мин"', () => {
    expect(formatTime(0)).toBe('0 мин');
  });

  it('formats minutes under an hour', () => {
    expect(formatTime(45)).toBe('45 мин');
  });

  it('formats whole hours without a minutes part', () => {
    expect(formatTime(120)).toBe('2 ч');
  });

  it('formats hours and minutes together', () => {
    expect(formatTime(125)).toBe('2 ч 5 мин');
  });
});

describe('toDateInputValue / toISOString round-trip', () => {
  it('round-trips a UTC datetime through the <input type="datetime-local"> format', () => {
    const original = '2026-03-10T14:30:00Z';
    const inputValue = toDateInputValue(original);
    // toDateInputValue renders in the local timezone (no explicit tz), so
    // going back through toISOString and re-parsing must land on the same
    // instant regardless of which timezone the test runner is in.
    const roundTripped = toISOString(inputValue);
    expect(roundTripped).toBeDefined();
    expect(new Date(roundTripped!).getTime()).toBe(new Date(original).getTime());
  });

  it('returns undefined for empty/invalid input', () => {
    expect(toDateInputValue(undefined)).toBe('');
    expect(toISOString(undefined)).toBeUndefined();
    expect(toISOString('not a date')).toBeUndefined();
  });
});
