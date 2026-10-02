import { useEffect, useMemo, useState } from 'react';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { ArrowUpRight, Search } from 'lucide-react';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';
import { A2UI_BASIC_EXAMPLES, BASIC_CATALOG_ROW, CLIO_WORKSPACE_CATALOG_ROW } from '@/test-fixtures/a2ui/v0_9_1/fixtures';

type ComponentName = string;
type DemoComponent = Record<string, unknown> & { id: string; component: string };

const basicExamples: Record<string, string> = {
  Column: '00_complex-layout', Divider: '01_flight-status',
  List: '34_child-list-template', Modal: '36_modal', Row: '00_row-layout',
  Text: '00_formatted-text',
};

const groups: Array<{ title: string; names: string[] }> = [
  { title: 'Data and space', names: ['clio.chart.v1', 'clio.data-table.v1', 'clio.map.v1', 'clio.raster-viewport.v1', 'clio.mesh-viewport.v1'] },
  { title: 'Decisions and work', names: ['clio.weather.v1', 'clio.message-draft.v1', 'clio.steps.v1', 'clio.action-card.v1', 'clio.approval.v1', 'clio.workflow.v1'] },
  { title: 'Information', names: ['clio.metric.v1', 'clio.status.v1', 'clio.progress.v1', 'clio.callout.v1', 'clio.artifact.v1', 'clio.code.v1', 'clio.diff.v1', 'clio.mermaid.v1'] },
  { title: 'Controls', names: ['Button', 'CheckBox', 'ChoicePicker', 'DateTimeInput', 'Slider', 'TextField', 'clio.slider.v1'] },
  { title: 'Layout and media', names: ['Column', 'Divider', 'Frame', 'Grid', 'Icon', 'Image', 'List', 'Modal', 'Row', 'Tabs', 'Text'] },
];

const labels: Record<string, string> = {
  'clio.chart.v1': 'Chart', 'clio.data-table.v1': 'Data table', 'clio.map.v1': 'Map',
  'clio.raster-viewport.v1': 'Raster viewport', 'clio.mesh-viewport.v1': '3D viewport',
  'clio.message-draft.v1': 'Message draft', 'clio.action-card.v1': 'Action card',
  'clio.approval.v1': 'Approval', 'clio.workflow.v1': 'Workflow', 'clio.callout.v1': 'Callout',
  'clio.artifact.v1': 'Artifact', 'clio.mermaid.v1': 'Diagram', 'clio.slider.v1': 'Numeric slider',
  'clio.weather.v1': 'Weather', 'clio.steps.v1': 'Steps', 'clio.metric.v1': 'Metric',
  'clio.status.v1': 'Status', 'clio.progress.v1': 'Progress', 'clio.code.v1': 'Code',
  'clio.diff.v1': 'Diff',
};

const chartRows = Array.from({ length: 90 }, (_, index) => ({
  __row: index, id: `eq${String(index + 1).padStart(3, '0')}`, depth: 1 + (index * 17) % 32,
  magnitude: 1.1 + ((index * 13) % 52) / 10, region: ['Coast', 'Valley', 'Range'][index % 3],
}));
const heatmapRows = ['Coast', 'Valley', 'Range'].flatMap((region, regionIndex) =>
  ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, dayIndex) => ({
    __row: regionIndex * 6 + dayIndex,
    id: `${region}-${day}`,
    region,
    day,
    events: 4 + ((regionIndex * 7 + dayIndex * 11) % 21),
  })),
);
const trajectoryRows = ['Coast', 'Valley', 'Range'].flatMap((region, regionIndex) =>
  Array.from({ length: 18 }, (_, index) => ({
    __row: regionIndex * 18 + index,
    id: region,
    region,
    day: index + 1,
    displacement: Number((regionIndex * 1.5 + index * (0.13 + regionIndex * 0.03) + Math.sin(index / 2 + regionIndex) * 0.4).toFixed(2)),
  })),
);
const spectrumRows = ['Sample A', 'Sample B', 'Sample C'].flatMap((sample, sampleIndex) =>
  Array.from({ length: 55 }, (_, index) => {
    const wavelength = 400 + index * 6;
    const peak = 490 + sampleIndex * 72;
    return {
      __row: sampleIndex * 55 + index,
      id: sample,
      sample,
      wavelength,
      intensity: Number((0.12 + (1 + sampleIndex * 0.18) * Math.exp(-(((wavelength - peak) / 48) ** 2))).toFixed(3)),
    };
  }),
);
const linkedRows = Array.from({ length: 12 }, (_, index) => ({
  id: `site-${index + 1}`, site: `Site ${index + 1}`, depth: 2 + index * 1.7,
  magnitude: 1.2 + ((index * 7) % 25) / 10, latitude: 36 + index * 0.32,
  longitude: -123 + index * 0.4, region: index % 2 ? 'Range' : 'Coast',
}));

function clioDemo(name: ComponentName, variant: string): DemoComponent[] {
  const root = (component: DemoComponent): DemoComponent[] => [
    { id: 'root', component: 'Column', children: ['demo'] }, component,
  ];
  const action = (event: string) => ({ event: { name: event } });
  switch (name) {
    case 'Button': return [{ id: 'root', component: 'Column', children: ['button'] }, { id: 'button', component: name, child: 'label', variant: 'primary', action: action('gallery.button-clicked') }, { id: 'label', component: 'Text', text: 'Run analysis' }];
    case 'CheckBox': return root({ id: 'demo', component: name, label: 'Include quality-flagged stations', value: { path: '/demo/checked' } });
    case 'ChoicePicker': return root({ id: 'demo', component: name, label: 'Compare by', options: [{ label: 'Region', value: 'region' }, { label: 'Station type', value: 'type' }, { label: 'Quality', value: 'quality' }], value: { path: '/demo/choice' }, variant: 'mutuallyExclusive', displayStyle: 'chips' });
    case 'DateTimeInput': return root({ id: 'demo', component: name, label: 'Observation cutoff', value: { path: '/demo/cutoff' }, enableDate: true, enableTime: true });
    case 'Slider': return root({ id: 'demo', component: name, label: 'Minimum magnitude', min: 0, max: 10, value: { path: '/demo/magnitude' } });
    case 'TextField': return root({ id: 'demo', component: name, label: 'Station note', value: { path: '/demo/note' }, variant: 'longText' });
    case 'Icon': return root({ id: 'demo', component: name, name: 'calendarToday' });
    case 'Image': return root({ id: 'demo', component: name, url: 'artifact://artifact_plot', description: 'Vertical displacement chart', variant: 'mediumFeature' });
    case 'Tabs': return [
      { id: 'root', component: 'Tabs', tabs: [
        { title: 'Summary', child: 'summary' },
        { title: 'Observations', child: 'observations' },
        { title: 'Next steps', child: 'next-steps' },
      ] },
      { id: 'summary', component: 'Text', text: 'Three field sites were reviewed this morning.' },
      { id: 'observations', component: 'Text', text: 'Berkeley: clear signal. Fresno: incomplete record. Reno: follow-up needed.' },
      { id: 'next-steps', component: 'Text', text: 'Check the Fresno record and schedule a Reno visit.' },
    ];
    case 'linked': return [
      { id: 'root', component: 'Column', children: ['chart', 'map', 'table'] },
      { id: 'chart', component: 'clio.chart.v1', title: 'Depth and magnitude', preset: 'scatter', data: linkedRows, xField: 'depth', yField: 'magnitude', entityField: 'id', colorField: 'region', height: 300, selection: { path: '/selection/sites' }, selectionField: 'id' },
      { id: 'map', component: 'clio.map.v1', title: 'Field sites', points: linkedRows.map((row) => ({ id: row.id, label: row.site, latitude: row.latitude, longitude: row.longitude, category: row.region, detail: `${row.magnitude.toFixed(1)} magnitude` })), selection: { path: '/selection/sites' }, selectionField: 'id' },
      { id: 'table', component: 'clio.data-table.v1', columns: ['id', 'region', 'depth', 'magnitude'], rows: linkedRows, selection: { path: '/selection/sites' }, selectionField: 'id' },
    ];
    case 'Frame': return [{ id: 'root', component: name, title: 'Station summary', description: 'Three recent observations', child: 'demo' }, { id: 'demo', component: 'Text', text: 'Berkeley moved 2 mm this week.' }];
    case 'Grid': return [{ id: 'root', component: name, columns: 3, children: ['one', 'two', 'three'] }, ...['Berkeley', 'Fresno', 'Reno'].map((text, index) => ({ id: ['one', 'two', 'three'][index]!, component: 'Text', text }))];
    case 'clio.chart.v1': {
      const examples: Record<string, { title: string; data: Record<string, unknown>[]; xField: string; yField: string; colorField: string; entityField: string }> = {
        scatter: { title: 'Earthquake depth and magnitude', data: chartRows, xField: 'depth', yField: 'magnitude', colorField: 'region', entityField: 'id' },
        boxplot: { title: 'Magnitude by region', data: chartRows, xField: 'region', yField: 'magnitude', colorField: 'region', entityField: 'id' },
        heatmap: { title: 'Events by region and day', data: heatmapRows, xField: 'day', yField: 'region', colorField: 'events', entityField: 'id' },
        trajectories: { title: 'Displacement over time', data: trajectoryRows, xField: 'day', yField: 'displacement', colorField: 'region', entityField: 'id' },
        spectra: { title: 'Sample spectra', data: spectrumRows, xField: 'wavelength', yField: 'intensity', colorField: 'sample', entityField: 'id' },
      };
      return root({ id: 'demo', component: name, preset: variant, height: 380, ...examples[variant] });
    }
    case 'clio.data-table.v1': return root({ id: 'demo', component: name, columns: ['id', 'region', 'depth', 'magnitude'], rows: chartRows });
    case 'clio.map.v1': return root({ id: 'demo', component: name, title: 'Field sites', selection: { path: '/selection/sites' }, selectionField: 'id', points: [
      { id: 'berkeley', label: 'Berkeley', latitude: 37.8715, longitude: -122.273, category: 'Field site', detail: 'Northern California' },
      { id: 'fresno', label: 'Fresno', latitude: 36.7378, longitude: -119.7871, category: 'Lab', detail: 'Central Valley' },
      { id: 'reno', label: 'Reno', latitude: 39.5296, longitude: -119.8138, category: 'Field site', detail: 'Nevada' },
    ] });
    case 'clio.mesh-viewport.v1': return root({ id: 'demo', component: name, title: 'Surface mesh sample', meshUri: 'artifact://artifact_gallery_terrain_glb', format: 'glb' });
    case 'clio.raster-viewport.v1': return root({ id: 'demo', component: name, title: 'Temperature field', rasterUri: 'artifact://artifact_raster_demo', colormap: 'viridis', unit: '°C' });
    case 'clio.weather.v1': return root({ id: 'demo', component: name, location: 'Berkeley, California', timeZone: 'America/Los_Angeles', observedAt: '2026-10-01T13:35:00-07:00', condition: 'Partly cloudy', temperature: 67, temperatureUnit: 'F', source: 'Example forecast', windSpeed: 9, windUnit: 'mph',
      hourly: Array.from({ length: 24 }, (_, index) => ({ time: new Date(Date.parse('2026-10-01T14:00:00-07:00') + index * 3_600_000).toISOString(), condition: ['Sunny', 'Cloudy', 'Rain'][Math.floor(index / 4) % 3], temperature: 68 + Math.round(5 * Math.sin(index / 3)), precipitationChance: [5, 15, 60][Math.floor(index / 4) % 3] })),
      daily: Array.from({ length: 10 }, (_, index) => ({ date: new Date(Date.parse('2026-10-01T12:00:00Z') + index * 86_400_000).toISOString().slice(0, 10), condition: ['Sunny', 'Cloudy', 'Rain'][index % 3], high: 76 - index, low: 53 - index, precipitationChance: [10, 20, 75][index % 3] })) });
    case 'clio.message-draft.v1': return root({ id: 'demo', component: name, kind: 'email', title: 'Update a collaborator', versions: [
      { label: 'Direct', to: ['collaborator@example.org'], subject: 'Field data review', body: 'Hi Morgan,\n\nThe review needs two more days. I will send the checked results Friday.\n\nThanks,\nAlex' },
      { label: 'Warm', to: ['collaborator@example.org'], subject: 'An update on the field data', body: 'Hi Morgan,\n\nI am checking a few more records before sharing the results. Thank you for your patience.\n\nAlex' },
    ] });
    case 'clio.steps.v1': return root({ id: 'demo', component: name, title: 'Prepare field samples', baseAmount: 2, scaleLabel: 'Samples', steps: [
      { id: 'label', title: 'Label collection tubes', detail: 'Write the site, time, and sample ID.' },
      { id: 'mix', title: 'Mix buffer', quantity: 20, quantityUnit: 'mL' },
      { id: 'incubate', title: 'Incubate samples', durationSeconds: 180, warning: 'Keep the lid closed during incubation.' },
      { id: 'record', title: 'Record observations' },
    ] });
    case 'clio.metric.v1': return root({ id: 'demo', component: name, label: 'Events reviewed', value: 500, unit: 'events', trend: 'up' });
    case 'clio.status.v1': return root({ id: 'demo', component: name, label: 'Quality review', state: 'running', detail: 'Checking station coverage' });
    case 'clio.progress.v1': return root({ id: 'demo', component: name, label: 'Records processed', value: 68, max: 100, state: 'running', detail: '68 of 100 complete' });
    case 'clio.callout.v1': return root({ id: 'demo', component: name, title: 'Review before publishing', severity: 'warning', body: 'Three stations have incomplete observations.' });
    case 'clio.action-card.v1': return root({ id: 'demo', component: name, title: 'Review the data', body: 'Choose the next step for this station report.', severity: 'info', actions: [
      { label: 'Open report', action: action('gallery.open-report') }, { label: 'Compare stations', action: action('gallery.compare-stations') },
    ] });
    case 'clio.approval.v1': return root({ id: 'demo', component: name, title: 'Publish the report?', reason: 'This will make the checked results available to the team.', risk: 'low', actions: [
      { label: 'Approve', action: action('gallery.approve') }, { label: 'Keep reviewing', action: action('gallery.keep-reviewing') },
    ] });
    case 'clio.workflow.v1': return root({ id: 'demo', component: name, nodes: [
      { id: 'collect', label: 'Collect', state: 'completed' }, { id: 'check', label: 'Check quality', state: 'running' }, { id: 'publish', label: 'Publish', state: 'pending' },
    ], edges: [{ source: 'collect', target: 'check' }, { source: 'check', target: 'publish' }] });
    case 'clio.code.v1': return root({ id: 'demo', component: name, title: 'Station summary', language: 'python', code: 'stations = ["Berkeley", "Fresno", "Reno"]\nfor station in stations:\n    print(station)' });
    case 'clio.diff.v1': return root({ id: 'demo', component: name, path: 'analysis.py', diff: '@@ -1,2 +1,3 @@\n stations = load_stations()\n+stations = filter_quality(stations)\n print(len(stations))' });
    case 'clio.mermaid.v1': return root({ id: 'demo', component: name, title: 'From observation to report', source: 'flowchart LR\n  A[Collect] --> B[Review]\n  B --> C[Publish]' });
    case 'clio.artifact.v1': return root({ id: 'demo', component: name, name: 'vertical-displacement.png', uri: 'artifact://artifact_plot', mediaType: 'image/png', size: 53953 });
    case 'clio.slider.v1': return root({ id: 'demo', component: name, label: 'Depth interval', min: 0, max: 30, step: 0.5, range: true, value: [2, 12], unit: 'km' });
    default: return root({ id: 'demo', component: 'Text', text: 'This view needs a registered artifact in a connected CLIO workspace.' });
  }
}

export function A2uiDemo({ name, variant }: { name: ComponentName; variant: string }) {
  const [lastAction, setLastAction] = useState('');
  const surface = useMemo(() => {
    const workspaceOnly = name.startsWith('clio.') || name === 'Frame' || name === 'Grid' || name === 'linked';
    const catalogId = workspaceOnly ? CLIO_WORKSPACE_CATALOG_ROW.catalogId : BASIC_CATALOG_ROW.catalogId;
    const catalog = new Catalog(catalogId, [...KERNEL_COMPONENTS.values()], [...KERNEL_FUNCTIONS.values()]);
    const processor = new MessageProcessor([catalog], async () => undefined, { version: workspaceOnly ? 'v0.9.1' : 'v0.9' });
    const example = basicExamples[name] ? A2UI_BASIC_EXAMPLES.find((item) => item.file.includes(basicExamples[name]!)) : undefined;
    if (!name.startsWith('clio.') && example) {
      processor.processMessages(example.messages as A2uiMessage[]);
      const first = example.messages[0] as { createSurface: { surfaceId: string } };
      return processor.model.getSurface(first.createSurface.surfaceId);
    }
    const surfaceId = `gallery-${name.replaceAll('.', '-')}`;
    const version = workspaceOnly ? 'v0.9.1' : 'v0.9';
    const initialValues: Record<string, unknown> = { CheckBox: false, ChoicePicker: 'region', DateTimeInput: '2026-10-01T12:00', Slider: 3, TextField: '' };
    const initialPath: Record<string, string> = { CheckBox: '/demo/checked', ChoicePicker: '/demo/choice', DateTimeInput: '/demo/cutoff', Slider: '/demo/magnitude', TextField: '/demo/note' };
    processor.processMessages([
      { version, createSurface: { surfaceId, catalogId } },
      ...(initialPath[name] ? [{ version, updateDataModel: { surfaceId, path: initialPath[name], value: initialValues[name] } }] : []),
      { version, updateComponents: { surfaceId, components: clioDemo(name, variant) } },
    ] as A2uiMessage[]);
    return processor.model.getSurface(surfaceId);
  }, [name, variant]);
  useEffect(() => {
    surface?.onAction.subscribe((event) => {
      const label = event.name.replace(/^gallery\./u, '').replaceAll('-', ' ');
      setLastAction(label.charAt(0).toUpperCase() + label.slice(1));
    });
  }, [surface]);
  if (!surface) return <p className="text-sm text-muted-foreground">This example could not be created.</p>;
  return <div className="space-y-4"><div data-slot="a2ui-surface-root"><MarkdownContext.Provider value={renderMarkdown}><A2uiReferenceSessionProvider value="sess_flat_ndp"><A2uiSurface surface={surface} /></A2uiReferenceSessionProvider></MarkdownContext.Provider></div>{lastAction ? <p className="rounded-md bg-muted px-3 py-2 text-xs">Demo action: {lastAction}</p> : null}</div>;
}

/** A small three-view example showing one selection shared by chart, map, and table. */
export function LinkedViewsDemo() {
  return <A2uiDemo name="linked" variant="scatter" />;
}

function catalogDescription(name: string): string {
  const file = CLIO_WORKSPACE_CATALOG_ROW.file as { components?: Record<string, { description?: string }> };
  return file.components?.[name]?.description ?? '';
}

function examplePayload(name: string, variant: string): unknown {
  const fixtureName = basicExamples[name];
  if (!fixtureName) return clioDemo(name, variant);
  const example = A2UI_BASIC_EXAMPLES.find((item) => item.file.includes(fixtureName));
  const messages = example?.messages as Array<{ updateComponents?: { components?: unknown } }> | undefined;
  return messages?.find((message) => message.updateComponents)?.updateComponents?.components ?? clioDemo(name, variant);
}

/** A visually led explorer of every component in the CLIO workspace catalog. */
export function WidgetGallery() {
  const [active, setActive] = useState('clio.chart.v1');
  const [query, setQuery] = useState('');
  const [variant, setVariant] = useState('scatter');
  const [showContract, setShowContract] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [composer, setComposer] = useState('');
  useEffect(() => {
    const useDraft = (event: Event) => setComposer((event as CustomEvent<{ text: string }>).detail.text);
    window.addEventListener('clio:use-message-draft', useDraft);
    return () => window.removeEventListener('clio:use-message-draft', useDraft);
  }, []);
  const activeGroup = groups.find((group) => group.names.includes(active));
  return <section className="grid gap-7 lg:grid-cols-[14rem_minmax(0,1fr)]">
    <label className="block space-y-1.5 text-xs text-muted-foreground lg:hidden"><span>Component</span><select aria-label="Choose a component" className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground" onChange={(event) => { setActive(event.target.value); setShowContract(false); }} value={active}>{groups.map((group) => <optgroup key={group.title} label={group.title}>{group.names.map((name) => <option key={name} value={name}>{labels[name] ?? name}</option>)}</optgroup>)}</select></label>
    <nav aria-label="Components" className="gallery-nav-scroll hidden space-y-5 lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
      <label className="flex items-center gap-2 rounded-md border px-3"><Search aria-hidden className="size-4 text-muted-foreground" /><input aria-label="Find a component" className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none" onChange={(event) => setQuery(event.target.value)} placeholder="Find a component" value={query} /></label>
      {groups.map((group) => {
        const names = group.names.filter((name) => `${labels[name] ?? name} ${name}`.toLowerCase().includes(query.toLowerCase()));
        return names.length ? <div className="space-y-1" key={group.title}><p className="px-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{group.title}</p>{names.map((name) => <button aria-current={active === name ? 'page' : undefined} className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${active === name ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`} key={name} onClick={() => { setActive(name); setShowContract(false); }} type="button">{labels[name] ?? name}</button>)}</div> : null;
      })}
    </nav>
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4"><div><p className="text-xs text-muted-foreground">{activeGroup?.title}</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{labels[active] ?? active}</h2></div><div className="flex gap-2"><button className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setShowExample((value) => !value)} type="button">{showExample ? 'Hide example' : 'Example data'}</button><button className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground" onClick={() => setShowContract((value) => !value)} type="button">{showContract ? 'Hide details' : 'Details'} <ArrowUpRight aria-hidden className="size-3" /></button></div></header>
      {active === 'clio.chart.v1' ? <div className="gallery-tab-scroll flex gap-1 overflow-x-auto" role="group" aria-label="Chart example">{['scatter', 'boxplot', 'heatmap', 'trajectories', 'spectra'].map((item) => <button aria-pressed={variant === item} className={`shrink-0 rounded-md px-3 py-1.5 text-xs capitalize ${variant === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`} key={item} onClick={() => setVariant(item)} type="button">{item}</button>)}</div> : null}
      {active === 'clio.callout.v1' ? <p className="text-sm text-muted-foreground">A short notice for a result, warning, or next step that deserves attention.</p> : null}
      <div className="min-h-56 overflow-x-auto"><div className={active === 'clio.chart.v1' ? 'min-w-[540px] sm:min-w-0' : active === 'clio.artifact.v1' ? 'max-w-2xl' : undefined}><A2uiDemo key={`${active}:${variant}`} name={active} variant={variant} /></div></div>
      {active === 'clio.message-draft.v1' && composer ? <label className="block space-y-2 text-sm"><span className="text-muted-foreground">Composer</span><textarea className="min-h-32 w-full rounded-md border bg-background p-3" onChange={(event) => setComposer(event.target.value)} value={composer} /></label> : null}
      {showContract ? <aside className="space-y-2 rounded-md bg-muted/50 p-4 text-sm"><p>{catalogDescription(active) || 'A layout or control building block in the A2UI Basic catalog.'}</p><p className="font-mono text-xs text-muted-foreground">{active}</p></aside> : null}
      {showExample ? <pre className="max-h-96 overflow-auto rounded-md border bg-muted/20 p-4 text-xs">{JSON.stringify(examplePayload(active, variant), null, 2)}</pre> : null}
    </div>
  </section>;
}
