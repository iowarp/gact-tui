/**
 * The widget gallery's linked scenarios: several components reading the same
 * rows (chart, map and table) and the report review flows.
 */
import { t, ph } from '@lingui/core/macro';
import type { DemoComponent } from './widget-gallery-demos';
import { chartRows, linkedRows } from './widget-gallery-sample-rows';

const action = (event: string) => ({ event: { name: event } });

/** The scenario named `name`, or undefined when it is a single component's demo. */
export function scenarioDemo(name: string): DemoComponent[] | undefined {
  switch (name) {
    case 'linked':
      return [
        { id: 'root', component: 'Column', children: ['chart', 'map', 'table'] },
        {
          id: 'chart',
          component: 'clio.chart.v1',
          title: t`Depth and magnitude`,
          preset: 'scatter',
          data: linkedRows,
          xField: 'depth',
          yField: 'magnitude',
          entityField: 'id',
          colorField: 'region',
          height: 300,
          selection: { path: '/selection/sites' },
          selectionField: 'id',
        },
        {
          id: 'map',
          component: 'clio.map.v1',
          title: t`Field sites`,
          points: linkedRows.map((row) => ({
            id: row.id,
            label: row.site,
            latitude: row.latitude,
            longitude: row.longitude,
            category: row.region,
            detail: t`${ph({ magnitude: row.magnitude.toFixed(1) })} magnitude`,
          })),
          selection: { path: '/selection/sites' },
          selectionField: 'id',
        },
        {
          id: 'table',
          component: 'clio.data-table.v1',
          columns: ['id', 'region', 'depth', 'magnitude'],
          rows: linkedRows,
          selection: { path: '/selection/sites' },
          selectionField: 'id',
        },
      ];
    case 'linked-hurricanes':
      return [
        { id: 'root', component: 'Column', children: ['map', 'chart', 'table'] },
        {
          id: 'map',
          component: 'clio.map.v1',
          title: t`Atlantic hurricane tracks`,
          dataUri: 'artifact://artifact_gallery_hurricane_tracks',
          latitudeField: 'lat',
          longitudeField: 'lon',
          labelField: 'label',
          idField: 'observation_id',
          trackField: 'storm',
          orderField: 'time',
          filterFields: ['storm', 'year', 'wind_kt'],
          selection: { path: '/selection/hurricanes' },
          selectionField: 'observation_id',
        },
        {
          id: 'chart',
          component: 'clio.chart.v1',
          title: t`Wind speed along each track`,
          preset: 'trajectories',
          dataUri: 'artifact://artifact_gallery_hurricane_tracks',
          xField: 'elapsed_hours',
          yField: 'wind_kt',
          colorField: 'storm',
          entityField: 'storm',
          selection: { path: '/selection/hurricanes' },
          selectionField: 'observation_id',
          height: 400,
        },
        {
          id: 'table',
          component: 'clio.data-table.v1',
          dataUri: 'artifact://artifact_gallery_hurricane_tracks',
          columns: ['storm', 'time', 'wind_kt', 'lat', 'lon'],
          selection: { path: '/selection/hurricanes' },
          selectionField: 'observation_id',
        },
      ];
    case 'linked-regions':
      return [
        { id: 'root', component: 'Column', children: ['scatter', 'boxplot', 'table'] },
        {
          id: 'scatter',
          component: 'clio.chart.v1',
          title: t`Earthquake depth and magnitude`,
          preset: 'scatter',
          data: chartRows,
          xField: 'depth',
          yField: 'magnitude',
          entityField: 'id',
          colorField: 'region',
          height: 300,
          selection: { path: '/selection/events' },
          selectionField: 'id',
        },
        {
          id: 'boxplot',
          component: 'clio.chart.v1',
          title: t`Magnitude by region`,
          preset: 'boxplot',
          data: chartRows,
          xField: 'region',
          yField: 'magnitude',
          entityField: 'id',
          colorField: 'region',
          height: 300,
          selection: { path: '/selection/events' },
          selectionField: 'id',
        },
        {
          id: 'table',
          component: 'clio.data-table.v1',
          columns: ['id', 'region', 'depth', 'magnitude'],
          rows: chartRows,
          selection: { path: '/selection/events' },
          selectionField: 'id',
        },
      ];
    case 'report-review':
      return [
        {
          id: 'root',
          component: 'Column',
          children: ['metrics', 'progress', 'warning', 'decision'],
        },
        { id: 'metrics', component: 'Grid', columns: 2, children: ['reviewed', 'state'] },
        {
          id: 'reviewed',
          component: 'clio.metric.v1',
          label: t`Records reviewed`,
          value: 68,
          unit: 'of 100',
        },
        {
          id: 'state',
          component: 'clio.status.v1',
          label: t`Quality check`,
          state: 'running',
          detail: t`Two sites need attention`,
        },
        {
          id: 'progress',
          component: 'clio.progress.v1',
          label: t`Report readiness`,
          value: 68,
          max: 100,
          state: 'running',
          detail: '68 records checked',
        },
        {
          id: 'warning',
          component: 'clio.callout.v1',
          title: t`Review flagged sites`,
          severity: 'warning',
          body: t`Two stations have incomplete observations. Confirm their records before publishing.`,
        },
        {
          id: 'decision',
          component: 'clio.action-card.v1',
          title: t`Choose the next step`,
          body: t`Open the flagged records or continue the review.`,
          severity: 'info',
          actions: [
            { label: t`Open flagged records`, action: action('gallery.open-flagged-records') },
            { label: t`Continue review`, action: action('gallery.continue-review') },
          ],
        },
      ];
    case 'report-ready':
      return [
        { id: 'root', component: 'Column', children: ['state', 'approval'] },
        {
          id: 'state',
          component: 'clio.status.v1',
          label: t`Report quality check`,
          state: 'completed',
          detail: t`All 100 records checked`,
        },
        {
          id: 'approval',
          component: 'clio.approval.v1',
          title: t`Publish the report?`,
          reason: t`The checked results will be available to the team.`,
          risk: 'low',
          actions: [
            { label: t`Approve`, action: action('gallery.approve') },
            { label: t`Keep reviewing`, action: action('gallery.keep-reviewing') },
          ],
        },
      ];
    default:
      return undefined;
  }
}
