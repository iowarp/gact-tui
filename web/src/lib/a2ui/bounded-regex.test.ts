import { describe, expect, it, vi } from 'vitest';
import { boundedRegexTest, unsafePatternReason } from './bounded-regex';
import { KERNEL_FUNCTIONS } from './kernel-catalog-functions';

describe('unsafePatternReason', () => {
  it.each([
    '^\\d{10}$',
    '^[A-Z]{2}-\\d+$',
    '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
    '^(?:yes|no)$',
    '^(ab)?c$',
    '^[(+*)]+$',
    '^\\(\\d{3}\\) \\d{3}-\\d{4}$',
  ])('lets a form pattern run: %s', (pattern) => {
    expect(unsafePatternReason(pattern)).toBeNull();
  });

  it.each([
    ['^(a+)+$', 'repeats a group'],
    ['^(a*)*b$', 'repeats a group'],
    ['^(a|aa)*$', 'repeats a group'],
    ['^(?:\\w+\\s?){2,}$', 'repeats a group'],
    ['^((a+))+$', 'repeats a group'],
    ['^(a+){10}$', 'repeats a group'],
    ['^(a)\\1$', 'backreference'],
    ['^(?<x>a)\\k<x>$', 'backreference'],
    ['^a*a*a*a*b$', 'unbounded quantifiers'],
    ['a'.repeat(300), 'longer than'],
  ])('refuses %s', (pattern, reason) => {
    expect(unsafePatternReason(pattern)).toContain(reason);
  });
});

describe('the kernel regex check', () => {
  const regex = KERNEL_FUNCTIONS.get('regex')!;
  const run = (pattern: string, value: string) =>
    regex.execute({ pattern, value }, {} as never) as boolean;

  it('replaces the library implementation and still matches', () => {
    expect(run('^\\d{3}$', '123')).toBe(true);
    expect(run('^\\d{3}$', '12a')).toBe(false);
  });

  it('fails a catastrophic pattern at once instead of hanging', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const started = performance.now();
    expect(run('^(a+)+$', `${'a'.repeat(40)}!`)).toBe(false);
    expect(performance.now() - started).toBeLessThan(50);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('fails a value over the bound', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(boundedRegexTest('^a+$', 'a'.repeat(300))).toEqual({
      ok: false,
      reason: 'the value is longer than 256 characters',
    });
    expect(run('^a+$', 'a'.repeat(300))).toBe(false);
    warn.mockRestore();
  });

  it('raises an expression error for an invalid pattern, as the library does', () => {
    expect(() => run('(', 'x')).toThrow(/Invalid regex pattern/);
  });
});
