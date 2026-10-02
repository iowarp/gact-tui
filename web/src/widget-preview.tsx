import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'sonner';
import { ClioMessageDraft } from '@/components/clio/a2ui-message-draft';
import { ClioSteps } from '@/components/clio/a2ui-steps';
import { ClioWeather } from '@/components/clio/a2ui-weather';
import { ClioNumberSlider } from '@/components/clio/number-slider';
import { LinkedViewsDemo, WidgetGallery } from '@/widget-gallery';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppProviders } from '@/providers/app-providers';
import './index.css';
import './widget-gallery.css';

function WeatherPreview() {
  return <ClioWeather
    condition="Partly cloudy"
    daily={Array.from({ length: 10 }, (_, index) => ({ date: new Date(Date.parse('2026-10-01T12:00:00Z') + index * 86_400_000).toISOString().slice(0, 10), condition: ['Sunny', 'Cloudy', 'Rain'][index % 3]!, high: 76 - index, low: 53 - index, precipitationChance: [10, 20, 75][index % 3]! }))}
    hourly={Array.from({ length: 24 }, (_, index) => ({ time: new Date(Date.parse('2026-10-01T14:00:00-07:00') + index * 3_600_000).toISOString(), condition: ['Sunny', 'Cloudy', 'Rain'][Math.floor(index / 4) % 3]!, temperature: 68 + Math.round(5 * Math.sin(index / 3)), precipitationChance: [5, 15, 60][Math.floor(index / 4) % 3]! }))}
    location="Berkeley, California" observedAt="2026-10-01T13:35:00-07:00" source="Field station forecast" temperature={67} temperatureUnit="F" timeZone="America/Los_Angeles" windSpeed={9} windUnit="mph"
  />;
}

function EmailPreview() {
  return <ClioMessageDraft kind="email" title="Update a collaborator" versions={[
    { label: 'Direct', to: ['collaborator@example.org'], subject: 'Field data review update', body: 'Hi Morgan,\n\nThe field data review needs two more days. I will send the checked results on Friday.\n\nThanks,\nAlex' },
    { label: 'Warm', to: ['collaborator@example.org'], subject: 'A quick update on the field data', body: 'Hi Morgan,\n\nI wanted to share a quick update: I am checking a few more records before sending the field data review. You will have the checked results on Friday. Thanks for your patience.\n\nAlex' },
  ]} />;
}

function StepsPreview() {
  return <ClioSteps baseAmount={2} scaleLabel="Samples" storageId="preview:field-sample-prep" steps={[
    { id: 'label', title: 'Label collection tubes', detail: 'Write the site, time, and sample ID on each tube.' },
    { id: 'mix', title: 'Mix buffer', quantity: 20, quantityUnit: 'mL', detail: 'Use a clean graduated cylinder.' },
    { id: 'incubate', title: 'Incubate samples', durationSeconds: 180, warning: 'Keep the lid closed during the incubation.' },
    { id: 'record', title: 'Record observations', detail: 'Include any visible precipitate or color change.' },
  ]} title="Prepare field samples" />;
}

function ComposerPreview({ composer, setComposer }: { composer: string; setComposer: (text: string) => void }) {
  return <label className="block space-y-2 text-sm"><span>Composer after “Use this version”</span><textarea className="min-h-28 w-full rounded-md border bg-background p-3" onChange={(event) => setComposer(event.target.value)} placeholder="Choose a draft version to bring it here…" value={composer} /></label>;
}

function Preview() {
  const [dark, setDark] = useState(true);
  const [composer, setComposer] = useState('');
  const [depthRange, setDepthRange] = useState<[number, number]>([2, 12]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
  }, [dark]);
  useEffect(() => {
    const useDraft = (event: Event) => {
      setComposer((event as CustomEvent<{ text: string }>).detail.text);
    };
    window.addEventListener('clio:use-message-draft', useDraft);
    return () => window.removeEventListener('clio:use-message-draft', useDraft);
  }, []);
  return (
    <main className="gallery-page min-h-screen bg-background px-4 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">Interactive component gallery</p>
            <h1 className="text-2xl font-semibold tracking-tight">CLIO A2UI gallery</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">37 components, live examples, and combinations.</p>
          </div>
          <button
            className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            onClick={() => setDark((value) => !value)}
            type="button"
          >
            {dark ? 'Light theme' : 'Dark theme'}
          </button>
        </header>
        <Tabs defaultValue="catalog">
          <TabsList aria-label="Widget gallery" className="gallery-tab-scroll h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0" variant="line">
            <TabsTrigger value="catalog">All components</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="weather">Weather</TabsTrigger>
            <TabsTrigger value="messages">Messages</TabsTrigger>
            <TabsTrigger value="steps">Steps</TabsTrigger>
            <TabsTrigger value="controls">Controls</TabsTrigger>
            <TabsTrigger value="combinations">Combinations</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-6" value="catalog"><WidgetGallery /></TabsContent>
          <TabsContent className="space-y-6 pt-5 data-[state=inactive]:hidden" forceMount value="overview">
        <div className="grid gap-6 lg:grid-cols-2">
          <ClioWeather
            condition="Partly cloudy"
            daily={Array.from({ length: 10 }, (_, index) => ({
              date: new Date(Date.parse('2026-10-01T12:00:00Z') + index * 86_400_000).toISOString().slice(0, 10),
              condition: ['Sunny', 'Cloudy', 'Rain'][index % 3]!,
              high: 76 - index,
              low: 53 - index,
              precipitationChance: [10, 20, 75][index % 3]!,
            }))}
            hourly={Array.from({ length: 24 }, (_, index) => ({
              time: new Date(Date.parse('2026-10-01T14:00:00-07:00') + index * 3_600_000).toISOString(),
              condition: ['Sunny', 'Cloudy', 'Rain'][Math.floor(index / 4) % 3]!,
              temperature: 68 + Math.round(5 * Math.sin(index / 3)),
              precipitationChance: [5, 15, 60][Math.floor(index / 4) % 3]!,
            }))}
            location="Berkeley, California"
            observedAt="2026-10-01T13:35:00-07:00"
            source="Field station forecast"
            temperature={67}
            temperatureUnit="F"
            timeZone="America/Los_Angeles"
            windSpeed={9}
            windUnit="mph"
          />
          <ClioMessageDraft
            kind="email"
            title="Update a collaborator"
            versions={[
              {
                label: 'Direct',
                to: ['collaborator@example.org'],
                subject: 'Field data review update',
                body: 'Hi Morgan,\n\nThe field data review needs two more days. I will send the checked results on Friday.\n\nThanks,\nAlex',
              },
              {
                label: 'Warm',
                to: ['collaborator@example.org'],
                subject: 'A quick update on the field data',
                body: 'Hi Morgan,\n\nI wanted to share a quick update: I am checking a few more records before sending the field data review. You will have the checked results on Friday. Thanks for your patience.\n\nAlex',
              },
            ]}
          />
        </div>
        <label className="block space-y-2 text-sm">
          <span>Composer after “Use this version”</span>
          <textarea
            className="min-h-28 w-full rounded-md border bg-background p-3"
            onChange={(event) => setComposer(event.target.value)}
            value={composer}
          />
        </label>
        <ClioSteps
          baseAmount={2}
          scaleLabel="Samples"
          storageId="preview:field-sample-prep"
          steps={[
            { id: 'label', title: 'Label collection tubes', detail: 'Write the site, time, and sample ID on each tube.' },
            { id: 'mix', title: 'Mix buffer', quantity: 20, quantityUnit: 'mL', detail: 'Use a clean graduated cylinder.' },
            { id: 'incubate', title: 'Incubate samples', durationSeconds: 180, warning: 'Keep the lid closed during the incubation.' },
            { id: 'record', title: 'Record observations', detail: 'Include any visible precipitate or color change.' },
          ]}
          title="Prepare field samples"
        />
        <ClioNumberSlider
          label="Depth interval"
          min={0}
          max={30}
          rangeMode
          setValue={(value) => { if (Array.isArray(value)) setDepthRange(value as [number, number]); }}
          step={0.5}
          unit="km"
          value={depthRange}
        />
          </TabsContent>
          <TabsContent className="space-y-6 pt-5 data-[state=inactive]:hidden" forceMount value="weather">
            <h2 className="text-lg font-semibold">Forecast over time</h2>
            <WeatherPreview />
          </TabsContent>
          <TabsContent className="space-y-6 pt-5 data-[state=inactive]:hidden" forceMount value="messages">
            <h2 className="text-lg font-semibold">Drafts you can make your own</h2>
            <div className="grid items-start gap-6 lg:grid-cols-2"><EmailPreview /><div className="space-y-6"><ClioMessageDraft kind="slack" title="Team update" versions={[{ label: 'Concise', body: 'The field data review is on track. I will share the checked results Friday.' }, { label: 'With context', body: 'Quick update: I am checking a few station records before sharing the field data review. Expect the checked results Friday.' }]} /><ClioMessageDraft kind="text" title="Short note" versions={[{ label: 'Friendly', body: 'Hi! I need two more days to check the field data. I will send it Friday.' }, { label: 'Brief', body: 'Field data review will be ready Friday after final checks.' }]} /></div></div>
            <ComposerPreview composer={composer} setComposer={setComposer} />
          </TabsContent>
          <TabsContent className="space-y-6 pt-5 data-[state=inactive]:hidden" forceMount value="steps">
            <h2 className="text-lg font-semibold">Guides and recipes</h2>
            <div className="grid items-start gap-6 lg:grid-cols-2"><StepsPreview /><ClioSteps baseAmount={4} scaleLabel="Servings" storageId="preview:weeknight-pasta" steps={[{ id: 'boil', title: 'Bring water to a boil', quantity: 2, quantityUnit: 'L' }, { id: 'cook', title: 'Cook the pasta', quantity: 400, quantityUnit: 'g', durationSeconds: 600, warning: 'Reserve cooking water before draining.' }, { id: 'finish', title: 'Finish with sauce', quantity: 300, quantityUnit: 'mL' }]} title="Weeknight pasta" /></div>
          </TabsContent>
          <TabsContent className="space-y-6 pt-5 data-[state=inactive]:hidden" forceMount value="controls">
            <h2 className="text-lg font-semibold">Bound controls</h2>
            <div className="max-w-xl"><ClioNumberSlider label="Depth interval" min={0} max={30} rangeMode setValue={(value) => { if (Array.isArray(value)) setDepthRange(value as [number, number]); }} step={0.5} unit="km" value={depthRange} /></div>
          </TabsContent>
          <TabsContent className="space-y-8 pt-5 data-[state=inactive]:hidden" forceMount value="combinations">
            <section className="space-y-4"><h2 className="text-lg font-semibold">Linked field views</h2><LinkedViewsDemo /></section>
            <section className="space-y-4"><h2 className="text-lg font-semibold">Plan around the weather</h2><div className="grid items-start gap-6 lg:grid-cols-2"><WeatherPreview /><ClioMessageDraft kind="email" title="Adjust the field visit" versions={[{ label: 'Early start', to: ['team@example.org'], subject: 'Field visit timing', body: 'Hi team,\n\nThe afternoon forecast looks wet. Can we start the field visit in the morning instead?\n\nThanks' }, { label: 'Postpone', to: ['team@example.org'], subject: 'Field visit timing', body: 'Hi team,\n\nGiven the forecast, I suggest moving the field visit to the next clear day. Please let me know what works.\n\nThanks' }]} /></div><ComposerPreview composer={composer} setComposer={setComposer} /></section>
            <section className="space-y-4"><h2 className="text-lg font-semibold">Field workbench</h2><div className="grid items-start gap-6 lg:grid-cols-2"><StepsPreview /><ClioNumberSlider label="Depth interval" min={0} max={30} rangeMode setValue={(value) => { if (Array.isArray(value)) setDepthRange(value as [number, number]); }} step={0.5} unit="km" value={depthRange} /></div></section>
          </TabsContent>
        </Tabs>
      </div>
      <Toaster />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><AppProviders><Preview /></AppProviders></BrowserRouter>);
