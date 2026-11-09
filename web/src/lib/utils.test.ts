import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('cn and the spec type scale', () => {
  it('keeps a type-scale size next to a text color', () => {
    expect(cn('text-ui text-muted-foreground')).toBe('text-ui text-muted-foreground');
    expect(cn('text-label', 'text-foreground')).toBe('text-label text-foreground');
  });

  it('lets a later size replace an earlier one', () => {
    expect(cn('text-sm', 'text-menu')).toBe('text-menu');
    expect(cn('text-caption', 'text-[13px]')).toBe('text-[13px]');
  });
});
