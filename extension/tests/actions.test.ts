import { describe, expect, it } from 'vitest';
import { eventLink, runLocal, vcard } from '../src/actions/local';
import { actionsFor } from '../src/actions/registry';
import { classify } from '../src/detect/classify';
import { validateSettings } from '../src/store/settings';
import { resumeUrl } from '../src/capture/capture';

const err = classify({ text: "Traceback (most recent call last):\nModuleNotFoundError: No module named 'pandas'" });

describe('contextual actions', () => {
  it('one primary, up to three secondary, the rest under More', () => {
    const a = actionsFor(err, true);
    expect(a.primary.label).toBe('Explain & fix');
    expect(a.secondary.map((x) => x.label)).toEqual(['Copy error', 'Search web']);
    expect(a.more.at(-1)!.label).toBe('Ask a question');
  });
  it('without AI the first local action becomes primary', () => {
    const a = actionsFor(err, false);
    expect(a.primary.label).toBe('Copy error');
    expect(a.demoted).toBe(true);
    expect(a.secondary[0]!.label).toBe('Explain & fix');
  });
  it('drops actions the capture can’t support', () => {
    const t = classify({ text: 'Contact Nimal Perera\nnimal@example.com\n+94 77 123 4567' });
    const a = actionsFor(t, true);
    expect(a.primary.label).toBe('Save contact');
    expect(a.secondary.map((x) => x.label)).toEqual(['Email', 'Call']);
  });
});

describe('local actions', () => {
  const settings = validateSettings({});
  it('builds calendar links with time and place', () => {
    const url = eventLink({ title: 'Symposium', date: '2026-12-12', time: '09:30', place: 'Main Hall' })!;
    expect(url).toContain('dates=20261212T093000%2F20261212T103000');
    expect(url).toContain('location=Main+Hall');
    expect(eventLink({ title: 'All day', date: '2026-12-31' })).toContain('dates=20261231%2F20270101');
  });
  it('makes a vCard from found details', () => {
    const t = 'Nimal Perera\nnimal@example.com\n+94 77 123 4567';
    const card = vcard(t, classify({ text: t }).entities);
    expect(card).toContain('FN:Nimal Perera');
    expect(card).toContain('EMAIL;TYPE=INTERNET:nimal@example.com');
    expect(card).toContain('TEL;TYPE=CELL:+94771234567');
  });
  it('copies the error line and searches the web for it', () => {
    const ctx = { text: 'x', detection: err, findings: [], settings, title: 't', number: 7 };
    expect(runLocal('copy-error', ctx)).toMatchObject({ kind: 'copy', text: "ModuleNotFoundError: No module named 'pandas'" });
    const s = runLocal('search-web', ctx);
    expect(s.kind === 'open' && s.url).toContain('google.com/search?q=ModuleNotFoundError');
  });
});

describe('video resume links', () => {
  it('YouTube and direct video files get a time link; other sites none', () => {
    expect(resumeUrl('https://www.youtube.com/watch?v=abc', 2292.7)).toBe('https://www.youtube.com/watch?v=abc&t=2292s');
    expect(resumeUrl('https://youtu.be/abc', 61)).toBe('https://youtu.be/abc?t=61s');
    expect(resumeUrl('https://cdn.example.edu/lecture.mp4', 30)).toBe('https://cdn.example.edu/lecture.mp4#t=30');
    expect(resumeUrl('https://lms.example.edu/course/7', 30)).toBeUndefined();
  });
});
