import { describe, expect, it } from 'vitest';
import { calendarLink, entityHref, extractEntities } from '../src/detect/entities';

const kinds = (t: string) => extractEntities(t).map((e) => `${e.type}:${e.normalized}`);

describe('extractEntities', () => {
  it('finds links, emails and Sri Lankan phone numbers', () => {
    const got = kinds('Visit www.sliit.lk or https://example.com/path?x=1. Mail info@sliit.lk, call 077 123 4567 or +94 11 234 5678.');
    expect(got).toContain('url:https://www.sliit.lk/');
    expect(got).toContain('url:https://example.com/path?x=1');
    expect(got).toContain('email:info@sliit.lk');
    expect(got).toContain('phone:+94771234567');
    expect(got).toContain('phone:+94112345678');
  });

  it('does not treat an email domain as a link', () => {
    expect(kinds('write to a.b@mail.example.org')).toEqual(['email:a.b@mail.example.org']);
  });

  it('reads dates in common formats, day first', () => {
    const got = kinds('Due 2026-12-05, exam 05/01/2027, viva 3rd March 2027, release Nov 19, 2026.');
    expect(got).toEqual(expect.arrayContaining(['date:2026-12-05', 'date:2027-01-05', 'date:2027-03-03', 'date:2026-11-19']));
  });

  it('rejects impossible dates and short numbers', () => {
    expect(kinds('31/02/2026 and 2026-13-01')).toEqual([]);
    expect(kinds('Room 1234 costs 5,000')).toEqual([]);
  });

  it('builds actions', () => {
    expect(calendarLink('Exam', '2026-12-31')).toContain('dates=20261231/20270101');
    const [e] = extractEntities('call +44 20 7946 0018');
    expect(entityHref(e!)).toBe('tel:+442079460018');
  });
});
