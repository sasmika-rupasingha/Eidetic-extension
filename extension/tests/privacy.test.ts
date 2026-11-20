import { describe, expect, it } from 'vitest';
import { findSensitive, locate, luhn, maskText } from '../src/privacy/detect';
import type { OcrLine } from '../src/detect/table';

describe('privacy shield', () => {
  it('finds keys, tokens, cards, IDs, emails, phones and passwords', () => {
    const text = [
      'OPENAI_API_KEY=sk-proj-abcdefghijklmnopqrstuvwx1234',
      'contact: nimal.perera@example.com or 077 123 4567',
      'card 4111 1111 1111 1111',
      'NIC 199012345678',
      'password: hunter2!',
      'token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.abcdefghijk',
    ].join('\n');
    const kinds = findSensitive(text).map((f) => f.kind);
    expect(kinds).toEqual(['api-key', 'email', 'phone', 'card', 'id-number', 'password', 'token']);
  });
  it('checks card numbers with Luhn', () => {
    expect(luhn('4111111111111111')).toBe(true);
    expect(luhn('4111111111111112')).toBe(false);
    expect(findSensitive('order 4111 1111 1111 1112').some((f) => f.kind === 'card')).toBe(false);
  });
  it('locates values that span several words', () => {
    const words = ['Call', '077', '123', '4567', 'today'].map((t, i) => ({ text: t, bbox: { x0: i * 50, y0: 0, x1: i * 50 + 40, y1: 10 } }));
    const lines: OcrLine[] = [{ text: 'Call 077 123 4567 today', bbox: { x0: 0, y0: 0, x1: 250, y1: 10 }, words }];
    expect(locate('077 123 4567', lines).map((b) => b.x0)).toEqual([50, 100, 150]);
  });
  it('masks findings for a safe copy', () => {
    const text = 'Email me at a@b.co';
    expect(maskText(text, findSensitive(text))).toBe('Email me at [email address hidden]');
  });
});
