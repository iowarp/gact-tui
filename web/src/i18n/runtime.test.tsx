import { plural, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { i18n } from './instance';
import { applyDocumentLocale } from './runtime';

const SOURCE_COPY = 'Choose a theme';

describe('translation runtime', () => {
  afterEach(() => i18n.activate('en'));

  it('renders English from the source text with no catalog loaded', () => {
    const name = 'results.csv';
    expect(t`Open ${name}`).toBe('Open results.csv');
    expect(plural(1, { one: '# file', other: '# files' })).toBe('1 file');
    expect(plural(3, { one: '# file', other: '# files' })).toBe('3 files');
  });

  it('renders Trans without a provider, keeping its elements', () => {
    const path = '/data/run';
    render(
      <p data-testid="saved">
        <Trans>
          Saved to <code>{path}</code>
        </Trans>
      </p>,
    );
    expect(screen.getByTestId('saved').innerHTML).toBe('Saved to <code>/data/run</code>');
  });

  it('uses a loaded catalog and falls back to English for a missing message', () => {
    const compiled = i18n._(SOURCE_COPY);
    expect(compiled).toBe(SOURCE_COPY);
    i18n.load('es', { 'test.theme': 'Elige un tema' });
    i18n.activate('es');
    expect(t({ id: 'test.theme', message: 'Choose a theme' })).toBe('Elige un tema');
    expect(t`Not in the catalog`).toBe('Not in the catalog');
  });

  it('marks the document language and direction', () => {
    applyDocumentLocale(document.documentElement, 'ja');
    expect(document.documentElement.lang).toBe('ja');
    expect(document.documentElement.dir).toBe('ltr');
    applyDocumentLocale(document.documentElement, 'pseudo');
    expect(document.documentElement.lang).toBe('en-XA');
  });
});
