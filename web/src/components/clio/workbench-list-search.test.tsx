import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { matchesListQuery, useWorkbenchListSearch } from './workbench-list-search';

const SECTIONS = ['1 Introduction', '2 Data', '2.1 SMAP L3'];

function Outline() {
  const search = useWorkbenchListSearch('Search the outline');
  const rows = SECTIONS.filter((name) => matchesListQuery(name, search.query));
  return (
    <>
      {search.toggle}
      {search.withField(
        <ul>
          {rows.map((name) => (
            <li key={name}>{name}</li>
          ))}
        </ul>,
      )}
    </>
  );
}

describe('useWorkbenchListSearch', () => {
  it('opens a field that filters the list, and Escape closes it and clears the query', () => {
    render(
      <TooltipProvider>
        <Outline />
      </TooltipProvider>,
    );
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Search the outline' }));
    const field = screen.getByRole('textbox', { name: 'Search the outline' });
    fireEvent.change(field, { target: { value: 'smap' } });
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '2.1 SMAP L3',
    ]);
    expect(screen.getByRole('button', { name: 'Close search' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('matches the trimmed query in any case, and an empty query matches everything', () => {
    expect(matchesListQuery('2.1 SMAP L3', '  smap ')).toBe(true);
    expect(matchesListQuery('2 Data', 'smap')).toBe(false);
    expect(matchesListQuery('2 Data', ' ')).toBe(true);
  });
});
