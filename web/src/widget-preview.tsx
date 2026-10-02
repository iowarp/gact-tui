// oxlint-disable react/only-export-components -- This is a standalone gallery entrypoint.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ClioMessageDraft } from '@/components/clio/a2ui-message-draft';
import { ClioSteps } from '@/components/clio/a2ui-steps';
import { ClioWeather } from '@/components/clio/a2ui-weather';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppProviders } from '@/providers/app-providers';
import { A2uiDemo, LinkedViewsDemo, WidgetGallery } from '@/widget-gallery';
import './index.css';
import './widget-gallery.css';

const controls = [
  ['Button', 'Run an action'], ['CheckBox', 'Include a group'],
  ['ChoicePicker', 'Choose a category'], ['DateTimeInput', 'Set a time'],
  ['Slider', 'Set a threshold'], ['TextField', 'Add a note'],
  ['clio.slider.v1', 'Choose an interval'],
] as const;

function WeatherExample() {
  return <ClioWeather
    condition="Partly cloudy"
    daily={Array.from({ length: 10 }, (_, index) => ({ date: new Date(Date.parse('2026-10-01T12:00:00Z') + index * 86_400_000).toISOString().slice(0, 10), condition: ['Sunny', 'Cloudy', 'Rain'][index % 3]!, high: 76 - index, low: 53 - index, precipitationChance: [10, 20, 75][index % 3]! }))}
    hourly={Array.from({ length: 24 }, (_, index) => ({ time: new Date(Date.parse('2026-10-01T14:00:00-07:00') + index * 3_600_000).toISOString(), condition: ['Sunny', 'Cloudy', 'Rain'][Math.floor(index / 4) % 3]!, temperature: 68 + Math.round(5 * Math.sin(index / 3)), precipitationChance: [5, 15, 60][Math.floor(index / 4) % 3]! }))}
    location="Berkeley, California" observedAt="2026-10-01T13:35:00-07:00" source="Example forecast" temperature={67} temperatureUnit="F" timeZone="America/Los_Angeles" windSpeed={9} windUnit="mph"
  />;
}

function Preview() {
  const [dark, setDark] = useState(true);
  const [composer, setComposer] = useState('');
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); }, [dark]);
  useEffect(() => {
    const useDraft = (event: Event) => setComposer((event as CustomEvent<{ text: string }>).detail.text);
    window.addEventListener('clio:use-message-draft', useDraft);
    return () => window.removeEventListener('clio:use-message-draft', useDraft);
  }, []);
  return <main className="gallery-page min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Interactive component gallery</p><h1 className="text-2xl font-semibold tracking-tight">CLIO A2UI gallery</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Explore all 37 components, their example data, and connected workflows.</p></div>
        <button className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setDark((value) => !value)} type="button">{dark ? 'Light theme' : 'Dark theme'}</button>
      </header>
      <Tabs defaultValue="components">
        <TabsList aria-label="Widget gallery" className="gallery-tab-scroll h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0" variant="line">
          <TabsTrigger value="components">Components</TabsTrigger><TabsTrigger value="linked">Linked data</TabsTrigger><TabsTrigger value="controls">Controls</TabsTrigger><TabsTrigger value="workflows">Workflows</TabsTrigger>
        </TabsList>
        <TabsContent className="pt-6" value="components"><WidgetGallery /></TabsContent>
        <TabsContent className="space-y-5 pt-6" value="linked">
          <div><h2 className="text-lg font-semibold">One dataset, three views</h2><p className="text-sm text-muted-foreground">Click a site in the chart, map, or table. The other views follow the same selection. Use each view’s filter, box selection, zoom, export, and full screen controls.</p></div>
          <LinkedViewsDemo />
        </TabsContent>
        <TabsContent className="space-y-6 pt-6" value="controls">
          <div><h2 className="text-lg font-semibold">Controls you can use</h2><p className="text-sm text-muted-foreground">Try each control. These are the same renderers available in a generated surface.</p></div>
          <div className="grid items-start gap-5 md:grid-cols-2">{controls.map(([name, title]) => <section className="space-y-2 rounded-lg border border-border/70 p-4" key={name}><h3 className="text-sm font-medium">{title}</h3><A2uiDemo name={name} variant="scatter" /></section>)}</div>
        </TabsContent>
        <TabsContent className="space-y-10 pt-6" value="workflows">
          <section className="space-y-4"><div><h2 className="text-lg font-semibold">Plan around the weather</h2><p className="text-sm text-muted-foreground">Browse the forecast, then edit a message draft and place the chosen version in the composer.</p></div><div className="grid items-start gap-6 lg:grid-cols-2"><WeatherExample /><ClioMessageDraft kind="email" title="Adjust the field visit" versions={[{ label: 'Early start', to: ['team@example.org'], subject: 'Field visit timing', body: 'Hi team,\n\nThe afternoon forecast looks wet. Can we start the field visit in the morning instead?\n\nThanks' }, { label: 'Postpone', to: ['team@example.org'], subject: 'Field visit timing', body: 'Hi team,\n\nGiven the forecast, I suggest moving the field visit to the next clear day. Please let me know what works.\n\nThanks' }]} /></div><label className="block space-y-2 text-sm"><span className="text-muted-foreground">Composer</span><textarea className="min-h-28 w-full rounded-md border bg-background p-3" onChange={(event) => setComposer(event.target.value)} placeholder="Use a draft version to place editable text here" value={composer} /></label></section>
          <section className="space-y-4"><div><h2 className="text-lg font-semibold">Follow a field protocol</h2><p className="text-sm text-muted-foreground">Change the sample count, check a step, start a timer, and open full screen.</p></div><div className="max-w-3xl"><ClioSteps baseAmount={2} scaleLabel="Samples" storageId="gallery:protocol" steps={[{ id: 'label', title: 'Label collection tubes', detail: 'Write the site, time, and sample ID on each tube.' }, { id: 'mix', title: 'Mix buffer', quantity: 20, quantityUnit: 'mL', detail: 'Use a clean graduated cylinder.' }, { id: 'incubate', title: 'Incubate samples', durationSeconds: 180, warning: 'Keep the lid closed during incubation.' }, { id: 'record', title: 'Record observations' }]} title="Prepare field samples" /></div></section>
          <section className="space-y-4"><div><h2 className="text-lg font-semibold">Explore linked field sites</h2><p className="text-sm text-muted-foreground">The chart, map, and table share one selected site.</p></div><LinkedViewsDemo /></section>
        </TabsContent>
      </Tabs>
    </div><Toaster />
  </main>;
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><AppProviders><Preview /></AppProviders></BrowserRouter>);
