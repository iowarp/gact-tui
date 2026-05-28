import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_COMMANDS,
  SlashPalette,
} from '../../src/components/SlashPalette.js';

afterEach(cleanup);

function withQuery(initial = '') {
  const [q, setQ] = createSignal(initial);
  return { q, setQ };
}

describe('SlashPalette', () => {
  it('renders nothing when closed', () => {
    render(() => (
      <SlashPalette
        open={false}
        query=""
        commands={DEFAULT_COMMANDS}
        onQueryChange={() => undefined}
        onPick={() => undefined}
        onClose={() => undefined}
      />
    ));
    expect(screen.queryByTestId('slash-palette')).toBeNull();
  });

  it('filters by query', () => {
    const { q, setQ } = withQuery('doctor');
    render(() => (
      <SlashPalette
        open={true}
        query={q()}
        commands={DEFAULT_COMMANDS}
        onQueryChange={setQ}
        onPick={() => undefined}
        onClose={() => undefined}
      />
    ));
    expect(screen.queryByTestId('slash-palette-item-doctor')).toBeTruthy();
    expect(screen.queryByTestId('slash-palette-item-help')).toBeNull();
  });

  it('fires onPick when an item is clicked', () => {
    let picked = '';
    render(() => (
      <SlashPalette
        open={true}
        query=""
        commands={DEFAULT_COMMANDS}
        onQueryChange={() => undefined}
        onPick={(c) => {
          picked = c.id;
        }}
        onClose={() => undefined}
      />
    ));
    fireEvent.click(screen.getByTestId('slash-palette-item-tools'));
    expect(picked).toBe('tools');
  });
});
