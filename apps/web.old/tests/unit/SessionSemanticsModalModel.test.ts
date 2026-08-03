import { describe, expect, it } from 'vitest';
import {
  buildSessionSemanticsSelection,
  selectedSessionSemanticDescription,
} from '../../src/routes/SessionSemanticsModalModel.js';

const options = [
  {
    id: 'earthscope-gnss-region',
    label: 'EarthScope GNSS',
    description: 'Finds station time series and plots motion.',
  },
  { id: 'default', label: 'Default agent' },
];

describe('SessionSemanticsModalModel', () => {
  it('builds the selected session semantics payload', () => {
    expect(buildSessionSemanticsSelection('earthscope-gnss-region', 'ndp-tools')).toEqual({
      blueprintId: 'earthscope-gnss-region',
      expertPackId: 'ndp-tools',
    });
  });

  it('finds the description for the selected option only when present', () => {
    expect(selectedSessionSemanticDescription(options, 'earthscope-gnss-region')).toBe(
      'Finds station time series and plots motion.',
    );
    expect(selectedSessionSemanticDescription(options, 'default')).toBeUndefined();
    expect(selectedSessionSemanticDescription(options, 'missing')).toBeUndefined();
    expect(selectedSessionSemanticDescription(options, '')).toBeUndefined();
  });
});
