import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CATEGORY_LEGEND_SHOWN,
  tallyCategories,
  type CategoryLegend,
} from './layered-map-categories';
import { LayeredMapCategoryLegend } from './layered-map-category-legend';
import type { FeatureProperties } from './layered-map-model';

afterEach(cleanup);

function point(category: string | undefined, color: string, type = 'Point') {
  return {
    geometry: { type },
    properties: { layer: 'track', id: 'p', category, color } as FeatureProperties & {
      color: string;
    },
  };
}

const painted = (feature: { properties: FeatureProperties }) =>
  (feature.properties as FeatureProperties & { color: string }).color;

describe('tallyCategories', () => {
  it('lists the colours as painted, most frequent first, with uncategorised points last', () => {
    const entries = tallyCategories(
      [
        point('transect 18', '#111'),
        point(undefined, '#999'),
        point('transect 43', '#222'),
        point('transect 43', '#222'),
        // A track's line is not a point; its head point counts the track once.
        point('transect 18', '#111', 'LineString'),
      ],
      painted,
    );
    expect(entries).toEqual([
      { category: 'transect 43', color: '#222', count: 2 },
      { category: 'transect 18', color: '#111', count: 1 },
      { category: null, color: '#999', count: 1 },
    ]);
  });

  it('leaves out features coloured by value', () => {
    expect(tallyCategories([point('a', '#111')], () => undefined)).toEqual([]);
  });
});

describe('LayeredMapCategoryLegend', () => {
  // The glider's legs (Q3): seventeen categories, more than the palette holds.
  const legs: CategoryLegend = {
    layerId: 'track',
    label: 'ru29-20200908T1623 track',
    field: 'leg',
    entries: [
      { category: 'between transects', color: '#aaa', count: 900 },
      ...Array.from({ length: 15 }, (_, index) => ({
        category: `transect ${index + 1}`,
        color: `#${(index % 8) + 1}${(index % 8) + 1}${(index % 8) + 1}`,
        count: 80 - index,
      })),
      { category: null, color: '#999', count: 3 },
    ],
  };

  it('names each shown category beside its colour and folds the rest into +N more', () => {
    render(<LayeredMapCategoryLegend legends={[legs]} />);
    const list = screen.getByRole('list', { name: 'Map category colours' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(CATEGORY_LEGEND_SHOWN);
    expect(items[0]).toHaveTextContent('between transects');
    expect(items[0]!.querySelector('[aria-hidden="true"]')).toHaveStyle({
      backgroundColor: '#aaa',
    });
    expect(screen.getByText('ru29-20200908T1623 track')).toBeInTheDocument();
    expect(screen.getByText('colored by leg')).toBeInTheDocument();
    expect(screen.getByText(/colours repeat/u)).toBeInTheDocument();

    const more = screen.getByRole('button', { name: `+${17 - CATEGORY_LEGEND_SHOWN} more` });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(more);
    expect(within(list).getAllByRole('listitem')).toHaveLength(17);
    expect(within(list).getAllByRole('listitem').at(-1)).toHaveTextContent('Uncategorized');
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(within(list).getAllByRole('listitem')).toHaveLength(CATEGORY_LEGEND_SHOWN);
  });

  it('shows a few categories without a fold or a repeat note, and nothing without categories', () => {
    const { container, rerender } = render(
      <LayeredMapCategoryLegend
        legends={[
          {
            ...legs,
            entries: legs.entries.slice(0, 3).map((e, i) => ({ ...e, color: `#${i}${i}${i}` })),
          },
        ]}
      />,
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/colours repeat/u)).toBeNull();
    rerender(<LayeredMapCategoryLegend legends={[{ ...legs, entries: [] }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
