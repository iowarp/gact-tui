import { plural } from '@lingui/core/macro';
import { formatNumber } from '@/lib/locale-format';

export interface ChartZoneSelection {
  selected: boolean;
  /** Every point of each selected curve is selected. */
  completeCurves: boolean;
  /** The chart selects series points rather than table rows. */
  selectsSeries: boolean;
  selectedCurves: number;
  selectedRows: number;
  totalRows: number;
}

/** What a chart's "Reference this" zone covers, as one sentence. */
export function chartZoneDescription({
  selected,
  completeCurves,
  selectsSeries,
  selectedCurves,
  selectedRows,
  totalRows,
}: ChartZoneSelection): string {
  const selectedRowsText = formatNumber(selectedRows, 0);
  const totalText = formatNumber(totalRows, 0);
  if (!selected) {
    return plural(totalRows, {
      one: 'the filtered current view (# row)',
      other: 'the filtered current view (# rows)',
    });
  }
  if (completeCurves) {
    return plural(selectedCurves, {
      one: `# selected curve containing ${selectedRowsText} of ${totalText} rows`,
      other: `# selected curves containing ${selectedRowsText} of ${totalText} rows`,
    });
  }
  return selectsSeries
    ? plural(selectedRows, {
        one: `# selected point of ${totalText}`,
        other: `# selected points of ${totalText}`,
      })
    : plural(selectedRows, {
        one: `# selected row of ${totalText}`,
        other: `# selected rows of ${totalText}`,
      });
}
