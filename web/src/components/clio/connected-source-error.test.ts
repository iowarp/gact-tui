import { TransportError } from '@clio/core/v3';
import { describe, expect, it } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { connectedSourceErrorMessage } from './connected-source-error';

describe('connectedSourceErrorMessage', () => {
  it('never shows a raw HTTP status line', () => {
    expect(
      connectedSourceErrorMessage(new TransportError('Request failed with 404 Not Found', 404)),
    ).toBe(`Connected data is not available on this ${vocab.agent}.`);
    expect(connectedSourceErrorMessage(new Error('Request failed with 502 Bad Gateway'))).toBe(
      'Connected data could not be loaded. Try again in a moment.',
    );
  });

  it('keeps a service-written sentence', () => {
    expect(connectedSourceErrorMessage(new Error('Folder unavailable'))).toBe('Folder unavailable');
  });
});
