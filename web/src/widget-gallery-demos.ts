/**
 * The widget gallery's demo content: the component groups, their names, and
 * the sample payload each CLIO component is shown with. Kept apart from the
 * gallery's interface so the sample data can grow without touching it.
 */
import { t } from '@lingui/core/macro';
import { vocab } from '@/lib/brand-vocabulary';
import galleryLoadProfile from '@/lib/gallery-load-profile.json';
import { scenarioDemo } from './widget-gallery-scenarios';
import { chartRows, heatmapRows, trajectoryRows, spectrumRows } from './widget-gallery-sample-rows';

export type ComponentName = string;
export type DemoComponent = Record<string, unknown> & { id: string; component: string };

export const basicExamples: Record<string, string> = {
  Column: '00_complex-layout',
  Divider: '01_flight-status',
  List: '34_child-list-template',
  Modal: '36_modal',
  Row: '00_row-layout',
  Text: '00_formatted-text',
};

export const groups: Array<{ title: string; names: string[] }> = [
  {
    title: t`Data and space`,
    names: [
      'clio.chart.v1',
      'clio.data-table.v1',
      'clio.map.v1',
      'clio.raster-viewport.v1',
      'clio.mesh-viewport.v1',
    ],
  },
  {
    title: t`Decisions and work`,
    names: [
      'clio.weather.v1',
      'clio.message-draft.v1',
      'clio.steps.v1',
      'clio.action-card.v1',
      'clio.approval.v1',
      'clio.workflow.v1',
    ],
  },
  {
    title: t`Information`,
    names: [
      'clio.metric.v1',
      'clio.status.v1',
      'clio.progress.v1',
      'clio.callout.v1',
      'clio.artifact.v1',
      'clio.code.v1',
      'clio.diff.v1',
      'clio.mermaid.v1',
    ],
  },
  {
    title: t`Controls`,
    names: [
      'Button',
      'CheckBox',
      'ChoicePicker',
      'DateTimeInput',
      'Slider',
      'TextField',
      'clio.slider.v1',
    ],
  },
  {
    title: t`Layout and media`,
    names: [
      'Carousel',
      'Column',
      'Divider',
      'Frame',
      'Grid',
      'Icon',
      'Image',
      'List',
      'Modal',
      'Row',
      'Tabs',
      'Text',
      'Video',
    ],
  },
];

export const labels: Record<string, string> = {
  'clio.chart.v1': t`Chart`,
  'clio.data-table.v1': t`Data table`,
  'clio.map.v1': t`Map`,
  'clio.raster-viewport.v1': t`Raster viewport`,
  'clio.mesh-viewport.v1': t`3D viewport`,
  'clio.message-draft.v1': t`Message draft`,
  'clio.action-card.v1': t`Action card`,
  'clio.approval.v1': t`Approval`,
  'clio.workflow.v1': t`Workflow`,
  'clio.callout.v1': t`Callout`,
  'clio.artifact.v1': t`Artifact`,
  'clio.mermaid.v1': t`Diagram`,
  'clio.slider.v1': t`Numeric slider`,
  'clio.weather.v1': t`Weather`,
  'clio.steps.v1': t`Steps`,
  'clio.metric.v1': t`Metric`,
  'clio.status.v1': t`Status`,
  'clio.progress.v1': t`Progress`,
  'clio.code.v1': t`Code`,
  'clio.diff.v1': t`Diff`,
};

export function clioDemo(name: ComponentName, variant: string): DemoComponent[] {
  const { agent } = vocab;
  const root = (component: DemoComponent): DemoComponent[] => [
    { id: 'root', component: 'Column', children: ['demo'] },
    component,
  ];
  const action = (event: string) => ({ event: { name: event } });
  const scenario = scenarioDemo(name);
  if (scenario) return scenario;
  switch (name) {
    case 'Button':
      return [
        { id: 'root', component: 'Column', children: ['button'] },
        {
          id: 'button',
          component: name,
          child: 'label',
          variant: 'primary',
          action: action('gallery.button-clicked'),
        },
        { id: 'label', component: 'Text', text: t`Run analysis` },
      ];
    case 'CheckBox':
      return root({
        id: 'demo',
        component: name,
        label: t`Include quality-flagged stations`,
        value: { path: '/demo/checked' },
      });
    case 'ChoicePicker': {
      const searchable = variant === 'single-search' || variant === 'multi-search';
      return root({
        id: 'demo',
        component: name,
        label: searchable ? t`Plant ID` : t`Compare by`,
        options: searchable
          ? Array.from({ length: 150 }, (_, index) => ({
              label: t`Plant ${index + 1}`,
              value: String(index + 1),
            }))
          : [
              { label: t`Region`, value: 'region' },
              { label: t`Station type`, value: 'type' },
              { label: t`Quality`, value: 'quality' },
            ],
        value: { path: '/demo/choice' },
        variant: variant === 'multi-search' ? 'multipleSelection' : 'mutuallyExclusive',
        displayStyle: 'chips',
      });
    }
    case 'DateTimeInput':
      return root({
        id: 'demo',
        component: name,
        label: t`Observation cutoff`,
        value: { path: '/demo/cutoff' },
        enableDate: true,
        enableTime: true,
      });
    case 'Slider':
      return root({
        id: 'demo',
        component: name,
        label: t`Minimum magnitude`,
        min: 0,
        max: 10,
        value: { path: '/demo/magnitude' },
      });
    case 'TextField':
      return root({
        id: 'demo',
        component: name,
        label: t`Station note`,
        value: { path: '/demo/note' },
        variant: 'longText',
      });
    case 'Icon':
      return root({ id: 'demo', component: name, name: 'calendarToday' });
    case 'Image':
      return root({
        id: 'demo',
        component: name,
        url: 'artifact://artifact_plot',
        description: t`Vertical displacement chart`,
        variant: 'mediumFeature',
      });
    case 'Video':
      return root({
        id: 'demo',
        component: name,
        url: 'artifact://artifact_guide_export',
        accessibility: { label: t`Export and open a saved conversation` },
      });
    case 'Carousel':
      return [
        {
          id: 'root',
          component: 'Carousel',
          children: ['find', 'mark', 'watch'],
          accessibility: { label: t`Find and keep useful messages` },
        },
        { id: 'find', component: 'Column', children: ['find-image', 'find-caption'] },
        {
          id: 'find-image',
          component: 'Image',
          url: 'artifact://artifact_guide_find',
          description: t`Message rail preview`,
          fit: 'contain',
          variant: 'largeFeature',
        },
        {
          id: 'find-caption',
          component: 'Text',
          text: t`Point to a message in the rail to see its title and context, then open it.`,
        },
        { id: 'mark', component: 'Column', children: ['mark-image', 'mark-caption'] },
        {
          id: 'mark-image',
          component: 'Image',
          url: 'artifact://artifact_guide_mark',
          description: t`Marked messages list`,
          fit: 'contain',
          variant: 'largeFeature',
        },
        {
          id: 'mark-caption',
          component: 'Text',
          text: t`Mark a useful message. Open Marked messages to return to it later.`,
        },
        { id: 'watch', component: 'Column', children: ['export-video', 'export-caption'] },
        {
          id: 'export-video',
          component: 'Video',
          url: 'artifact://artifact_guide_export',
          accessibility: { label: t`Export and open a saved conversation` },
        },
        {
          id: 'export-caption',
          component: 'Text',
          text: t`Export the conversation when you need a saved review to share.`,
        },
      ];
    case 'Tabs':
      return [
        {
          id: 'root',
          component: 'Tabs',
          tabs: [
            { title: t`Summary`, child: 'summary' },
            { title: t`Observations`, child: 'observations' },
            { title: t`Next steps`, child: 'next-steps' },
          ],
        },
        {
          id: 'summary',
          component: 'Text',
          text: t`Three field sites were reviewed this morning.`,
        },
        {
          id: 'observations',
          component: 'Text',
          text: t`Berkeley: clear signal. Fresno: incomplete record. Reno: follow-up needed.`,
        },
        {
          id: 'next-steps',
          component: 'Text',
          text: t`Check the Fresno record and schedule a Reno visit.`,
        },
      ];
    case 'Frame':
      return [
        {
          id: 'root',
          component: name,
          title: t`Station summary`,
          description: t`Three recent observations`,
          child: 'demo',
        },
        { id: 'demo', component: 'Text', text: t`Berkeley moved 2 mm this week.` },
      ];
    case 'Grid':
      return [
        { id: 'root', component: name, columns: 3, children: ['one', 'two', 'three'] },
        ...['Berkeley', 'Fresno', 'Reno'].map((text, index) => ({
          id: ['one', 'two', 'three'][index]!,
          component: 'Text',
          text,
        })),
      ];
    case 'clio.chart.v1': {
      const examples: Record<
        string,
        {
          title: string;
          data?: Record<string, unknown>[];
          dataUri?: string;
          xField: string;
          xType?: string;
          yField: string;
          colorField: string;
          entityField: string;
        }
      > = {
        scatter: {
          title: t`Earthquake depth and magnitude`,
          data: chartRows,
          xField: 'depth',
          yField: 'magnitude',
          colorField: 'region',
          entityField: 'id',
        },
        boxplot: {
          title: t`Magnitude by region`,
          data: chartRows,
          xField: 'region',
          yField: 'magnitude',
          colorField: 'region',
          entityField: 'id',
        },
        heatmap: {
          title: t`Events by region and day`,
          data: heatmapRows,
          xField: 'day',
          yField: 'region',
          colorField: 'events',
          entityField: 'id',
        },
        trajectories: {
          title: t`Displacement over time`,
          data: trajectoryRows,
          xField: 'day',
          yField: 'displacement',
          colorField: 'region',
          entityField: 'id',
        },
        'storm-series': {
          title: t`Storm wind speed over time`,
          dataUri: 'artifact://artifact_gallery_storm_tracks',
          xField: 'time',
          xType: 'temporal',
          yField: 'wind_kt',
          colorField: 'storm',
          entityField: 'storm',
        },
        spectra: {
          title: t`Sample spectra`,
          data: spectrumRows,
          xField: 'wavelength',
          yField: 'intensity',
          colorField: 'sample',
          entityField: 'id',
        },
        'intro-load': {
          title: t`Relative load by specimen height`,
          data: galleryLoadProfile,
          xField: 'height',
          yField: 'relative_load',
          colorField: 'zone',
          entityField: 'id',
        },
      };
      return root({
        id: 'demo',
        component: name,
        preset:
          variant === 'storm-series'
            ? 'trajectories'
            : variant === 'intro-load'
              ? 'scatter'
              : variant,
        height: 380,
        ...examples[variant],
      });
    }
    case 'clio.data-table.v1':
      return root({
        id: 'demo',
        component: name,
        columns: ['id', 'region', 'depth', 'magnitude'],
        rows: chartRows,
      });
    case 'clio.map.v1':
      return variant === 'storm-tracks'
        ? root({
            id: 'demo',
            component: name,
            title: t`Synthetic Atlantic storm tracks`,
            dataUri: 'artifact://artifact_gallery_storm_tracks',
            latitudeField: 'lat',
            longitudeField: 'lon',
            labelField: 'label',
            idField: 'observation_id',
            trackField: 'storm',
            orderField: 'time',
            filterFields: ['storm', 'time', 'wind_kt'],
          })
        : root({
            id: 'demo',
            component: name,
            title: t`Field sites`,
            selection: { path: '/selection/sites' },
            selectionField: 'id',
            points: [
              {
                id: 'berkeley',
                label: t`Berkeley`,
                latitude: 37.8715,
                longitude: -122.273,
                category: t`Field site`,
                detail: t`Northern California`,
              },
              {
                id: 'fresno',
                label: t`Fresno`,
                latitude: 36.7378,
                longitude: -119.7871,
                category: t`Lab`,
                detail: t`Central Valley`,
              },
              {
                id: 'reno',
                label: t`Reno`,
                latitude: 39.5296,
                longitude: -119.8138,
                category: t`Field site`,
                detail: t`Nevada`,
              },
            ],
          });
    case 'clio.mesh-viewport.v1':
      return variant === 'intro-load'
        ? root({
            id: 'demo',
            component: name,
            title: t`Illustrative load field`,
            meshUri: 'artifact://artifact_gallery_load_specimen_glb',
            format: 'glb',
            field: 'relative_load',
          })
        : root({
            id: 'demo',
            component: name,
            title: t`Surface mesh sample`,
            meshUri: 'artifact://artifact_gallery_terrain_glb',
            format: 'glb',
          });
    case 'clio.raster-viewport.v1':
      return root({
        id: 'demo',
        component: name,
        title: t`Temperature field`,
        rasterUri: 'artifact://artifact_raster_demo',
        colormap: 'viridis',
        unit: '°C',
      });
    case 'clio.weather.v1':
      return root({
        id: 'demo',
        component: name,
        location: t`Berkeley, California`,
        timeZone: 'America/Los_Angeles',
        observedAt: '2026-10-01T13:35:00-07:00',
        // i18n-ignore: sample agent output; the weather view reads English conditions
        condition: 'Partly cloudy',
        temperature: 67,
        temperatureUnit: 'F',
        source: t`Example forecast`,
        windSpeed: 9,
        windUnit: 'mph',
        hourly: Array.from({ length: 24 }, (_, index) => ({
          time: new Date(Date.parse('2026-10-01T14:00:00-07:00') + index * 3_600_000).toISOString(),
          condition: ['Sunny', 'Cloudy', 'Rain'][Math.floor(index / 4) % 3],
          temperature: 68 + Math.round(5 * Math.sin(index / 3)),
          precipitationChance: [5, 15, 60][Math.floor(index / 4) % 3],
        })),
        daily: Array.from({ length: 10 }, (_, index) => ({
          date: new Date(Date.parse('2026-10-01T12:00:00Z') + index * 86_400_000)
            .toISOString()
            .slice(0, 10),
          condition: ['Sunny', 'Cloudy', 'Rain'][index % 3],
          high: 76 - index,
          low: 53 - index,
          precipitationChance: [10, 20, 75][index % 3],
        })),
      });
    case 'clio.message-draft.v1':
      return root({
        id: 'demo',
        component: name,
        kind: 'email',
        title: t`Update a collaborator`,
        versions: [
          {
            label: t`Direct`,
            to: ['collaborator@example.org'],
            subject: t`Field data review`,
            body: t`Hi Morgan,

The review needs two more days. I will send the checked results Friday.

Thanks,
Alex`,
          },
          {
            label: t`Warm`,
            to: ['collaborator@example.org'],
            subject: t`An update on the field data`,
            body: t`Hi Morgan,

I am checking a few more records before sharing the results. Thank you for your patience.

Alex`,
          },
        ],
      });
    case 'clio.steps.v1':
      return root({
        id: 'demo',
        component: name,
        title: t`Simple tomato pasta`,
        baseAmount: 2,
        scaleLabel: t`Servings`,
        ingredients: [
          { name: t`Dried pasta`, quantity: 180, unit: 'g' },
          { name: t`Olive oil`, quantity: 1, unit: 'tbsp' },
          { name: t`Garlic`, quantity: 2, unit: 'clove', unitPlural: 'cloves' },
          { name: t`Crushed tomatoes`, quantity: 400, unit: 'g' },
        ],
        steps: [
          { id: 'prep', title: t`Prep`, detail: t`Mince garlic and bring salted water to a boil.` },
          {
            id: 'sauce',
            title: t`Start the sauce`,
            detail: t`Warm oil, add garlic until fragrant, then stir in tomatoes.`,
          },
          {
            id: 'simmer',
            title: t`Simmer sauce`,
            durationSeconds: 900,
            detail: t`Stir occasionally until slightly thickened.`,
          },
          {
            id: 'pasta',
            title: t`Cook pasta`,
            detail: t`Cook until al dente and reserve a splash of water.`,
          },
          {
            id: 'serve',
            title: t`Combine and serve`,
            detail: t`Toss pasta with sauce, adding reserved water as needed.`,
          },
        ],
      });
    case 'clio.metric.v1':
      return root({
        id: 'demo',
        component: name,
        label: t`Events reviewed`,
        value: 500,
        unit: 'events',
        trend: 'up',
      });
    case 'clio.status.v1':
      return root({
        id: 'demo',
        component: name,
        label: t`Quality review`,
        state: 'running',
        detail: t`Checking station coverage`,
      });
    case 'clio.progress.v1':
      return root({
        id: 'demo',
        component: name,
        label: t`Records processed`,
        value: 68,
        max: 100,
        state: 'running',
        detail: '68 of 100 complete',
      });
    case 'clio.callout.v1':
      return root({
        id: 'demo',
        component: name,
        title: t`Review before publishing`,
        severity: 'warning',
        body: t`Three stations have incomplete observations.`,
      });
    case 'clio.action-card.v1':
      return root({
        id: 'demo',
        component: name,
        title: t`Review the data`,
        body: t`Choose the next step for this station report.`,
        severity: 'info',
        actions: [
          { label: t`Open report`, action: action('gallery.open-report') },
          { label: t`Compare stations`, action: action('gallery.compare-stations') },
        ],
      });
    case 'clio.approval.v1':
      return root({
        id: 'demo',
        component: name,
        title: t`Publish the report?`,
        reason: t`This will make the checked results available to the team.`,
        risk: 'low',
        actions: [
          { label: t`Approve`, action: action('gallery.approve') },
          { label: t`Keep reviewing`, action: action('gallery.keep-reviewing') },
        ],
      });
    case 'clio.workflow.v1':
      return root({
        id: 'demo',
        component: name,
        nodes: [
          { id: 'collect', label: t`Collect`, state: 'completed' },
          { id: 'check', label: t`Check quality`, state: 'running' },
          { id: 'publish', label: t`Publish`, state: 'pending' },
        ],
        edges: [
          { source: 'collect', target: 'check' },
          { source: 'check', target: 'publish' },
        ],
      });
    case 'clio.code.v1':
      return root({
        id: 'demo',
        component: name,
        title: t`Station summary`,
        language: 'python',
        code: 'stations = ["Berkeley", "Fresno", "Reno"]\nfor station in stations:\n    print(station)',
      });
    case 'clio.diff.v1':
      return root({
        id: 'demo',
        component: name,
        path: 'analysis.py',
        diff: '@@ -1,2 +1,3 @@\n stations = load_stations()\n+stations = filter_quality(stations)\n print(len(stations))',
      });
    case 'clio.mermaid.v1':
      return root({
        id: 'demo',
        component: name,
        title: t`From observation to report`,
        source: 'flowchart LR\n  A[Collect] --> B[Review]\n  B --> C[Publish]',
      });
    case 'clio.artifact.v1':
      return root({
        id: 'demo',
        component: name,
        name: 'vertical-displacement.png',
        uri: 'artifact://artifact_plot',
        mediaType: 'image/png',
        size: 50870,
      });
    case 'clio.slider.v1':
      return root({
        id: 'demo',
        component: name,
        label: t`Depth interval`,
        min: 0,
        max: 30,
        step: 0.5,
        range: true,
        value: [2, 12],
        unit: 'km',
      });
    default:
      return root({
        id: 'demo',
        component: 'Text',
        text: t`This view needs a registered artifact in a connected ${agent} workspace.`,
      });
  }
}
