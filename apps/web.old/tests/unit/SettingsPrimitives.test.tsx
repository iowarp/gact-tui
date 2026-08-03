/**
 * Task B2 §3 — the shared settings row vocabulary.
 *
 * Verifies the primitives render their structure: a SectionHeading with a
 * hint + action, a ListRow as label + description + right-aligned control +
 * badge, a Pill with a tone class, and the Empty / Loading states.
 */
import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EmptyState,
  ListRow,
  LoadingState,
  Pill,
  SectionHeading,
} from '../../src/components/SettingsPrimitives.js';

afterEach(cleanup);

describe('SettingsPrimitives', () => {
  it('SectionHeading renders a title, hint and action slot', () => {
    render(() => (
      <SectionHeading
        testid="sh"
        title="Theme"
        hint="pick a look"
        action={<button data-testid="sh-action">refresh</button>}
      />
    ));
    const el = screen.getByTestId('sh');
    expect(el.textContent).toContain('Theme');
    expect(el.textContent).toContain('pick a look');
    expect(screen.getByTestId('sh-action')).toBeTruthy();
  });

  it('ListRow lays out label, description, badge and control', () => {
    render(() => (
      <ListRow
        testid="row"
        label="Provider"
        description="who hosts the model"
        badge={<Pill testid="row-badge" tone="ok">ready</Pill>}
        control={<select data-testid="row-control" />}
      />
    ));
    const row = screen.getByTestId('row');
    expect(row.textContent).toContain('Provider');
    expect(row.textContent).toContain('who hosts the model');
    expect(screen.getByTestId('row-badge').textContent).toContain('ready');
    expect(screen.getByTestId('row-control')).toBeTruthy();
    // Control lives in the right-aligned control slot.
    expect(row.querySelector('.sx-row__control')).toBeTruthy();
  });

  it('Pill applies its tone modifier class', () => {
    render(() => <Pill testid="pill" tone="warn">needs setup</Pill>);
    const pill = screen.getByTestId('pill');
    expect(pill.classList.contains('sx-pill--warn')).toBe(true);
    expect(pill.textContent).toContain('needs setup');
  });

  it('EmptyState renders a title and body', () => {
    render(() => (
      <EmptyState testid="empty" title="Nothing here" body="add something" />
    ));
    const el = screen.getByTestId('empty');
    expect(el.textContent).toContain('Nothing here');
    expect(el.textContent).toContain('add something');
  });

  it('LoadingState renders its label', () => {
    render(() => <LoadingState testid="loading" label="Loading models…" />);
    expect(screen.getByTestId('loading').textContent).toContain('Loading models…');
  });
});
