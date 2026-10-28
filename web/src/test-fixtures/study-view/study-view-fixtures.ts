import { CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';

/**
 * A study view (Addendum B) as the server returns it: the root's surface, a chart
 * over the study's live measurements, and that source's rows as the study route
 * answers them.
 */

/** The root's dashboard of the study: a chart over its live measurements. */
export const MEASUREMENTS = 'study://e_000000000001/measurements';
export const readingsSurface = {
  id: 'readings',
  session_id: 'sess_root',
  catalog_id: CLIO_WORKSPACE_CATALOG_ROW.catalogId,
  protocol_version: '0.9.1',
  revision: 2,
  state: 'ready',
  messages: [
    {
      version: 'v0.9.1',
      createSurface: { surfaceId: 'readings', catalogId: CLIO_WORKSPACE_CATALOG_ROW.catalogId },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'readings',
        components: [
          {
            id: 'root',
            component: 'clio.chart.v1',
            preset: 'scatter',
            xField: 'condition.arm_m',
            yField: 'value',
            entityField: 'branch_title',
            dataUri: MEASUREMENTS,
          },
        ],
      },
    },
  ],
  message_revisions: [1, 2],
};

/** The study's measurements as the live source answers them. */
export const measurementsTable = {
  study: 'e_000000000001',
  source: 'measurements',
  schema: [
    { name: 'condition.arm_m', type: 'double' },
    { name: 'value', type: 'double' },
    { name: 'branch_title', type: 'string' },
  ],
  columns: {
    'condition.arm_m': [0.5, 1],
    value: [1.4, 1.9],
    branch_title: ['Pendulum study', 'Arm sweep'],
  },
  totalRows: 2,
  matchedRows: 2,
  returnedRows: 2,
  truncated: false,
  downsample: { mode: 'none' },
  cached: false,
};
