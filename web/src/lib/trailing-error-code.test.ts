import { describe, expect, it } from 'vitest';
import { splitTrailingErrorCode } from './trailing-error-code';

describe('splitTrailingErrorCode', () => {
  it('keeps the sentence and moves the trailing code aside', () => {
    expect(
      splitTrailingErrorCode('There is no scene a-1 here. Known scenes: b-2 [unknown_scene]'),
    ).toEqual({ sentence: 'There is no scene a-1 here. Known scenes: b-2', code: 'unknown_scene' });
  });

  it('leaves text without a trailing code, or that is only a code, alone', () => {
    expect(splitTrailingErrorCode('Plain failure.')).toEqual({ sentence: 'Plain failure.' });
    expect(splitTrailingErrorCode('Uses [a list] inside.')).toEqual({
      sentence: 'Uses [a list] inside.',
    });
    expect(splitTrailingErrorCode('[unknown_scene]')).toEqual({ sentence: '[unknown_scene]' });
    expect(splitTrailingErrorCode('Range is [0, 4]')).toEqual({ sentence: 'Range is [0, 4]' });
  });
});
