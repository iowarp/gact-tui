import { vocab } from '@/lib/brand-vocabulary';
// oxlint-disable react/only-export-components -- This is a standalone gallery entrypoint.
import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { ArrowUpRight, BoxSelect, Image as ImageIcon } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppProviders } from '@/providers/app-providers';
import { A2uiDemo, LinkedChartDemo, WidgetGallery } from '@/widget-gallery';
import { GallerySkillDialog } from '@/gallery-skill-dialog';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { createSelectionActionRegistry, type DataSurfaceZoneSelection } from '@/lib/selection-actions';
import './index.css';
import './widget-gallery.css';

const embedded = new URLSearchParams(window.location.search).has('embedded');
const skillPreview = new URLSearchParams(window.location.search).get('skill');
if (skillPreview) document.documentElement.classList.add('gallery-skill-preview');

const hurricaneMoments = [
  { id: 'harvey-042', storm: 'Harvey', detail: '115 kt near the Texas coast', year: '2017' },
  { id: 'maria-017', storm: 'Maria', detail: '150 kt east of Puerto Rico', year: '2017' },
  { id: 'dorian-038', storm: 'Dorian', detail: '160 kt near the Bahamas', year: '2019' },
];

function HurricaneShowcase() {
  const [active, setActive] = useState(-1);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      if (active < hurricaneMoments.length - 1) setActive(active + 1);
      else setPlaying(false);
    }, 2600);
    return () => window.clearTimeout(timer);
  }, [active, playing]);
  const moment = hurricaneMoments[active];
  return <section className="gallery-hurricane-showcase space-y-4" aria-label="Interactive hurricane walkthrough">
    <div className="gallery-hurricane-intro">
      <div className="space-y-3">
        <p className="gallery-hurricane-kicker">A question becomes an explorable answer</p>
        <blockquote>“How did Harvey, Maria, and Dorian move, and when did each reach its strongest winds?”</blockquote>
        <p>One set of observations powers the tracks, wind curves, and table. Pick a point in any view to find it in the others.</p>
      </div>
      <div className="gallery-hurricane-play">
        <button className="gallery-hurricane-play-button" onClick={() => { if (playing) setPlaying(false); else { setActive(0); setPlaying(true); } }} type="button">{playing ? 'Pause walkthrough' : 'Play walkthrough'}</button>
        <span aria-live="polite">{moment ? `${moment.storm} ${moment.year}: ${moment.detail}` : 'Three storms, one linked selection'}</span>
      </div>
    </div>
    <div className="gallery-hurricane-surface"><A2uiDemo name="linked-hurricanes" variant="trajectories" demoSelection={moment?.id ?? null} onInteract={() => setPlaying(false)} /></div>
    <p className="text-xs text-muted-foreground">Historical observations adapted from NOAA HURDAT2 for this gallery. The bundled data works without a running agent. <a className="underline underline-offset-2 hover:text-foreground" href="https://www.nhc.noaa.gov/data/" rel="noreferrer" target="_blank">Source</a></p>
  </section>;
}

function IntroShowcase() {
  const selectionActions = useMemo(() => createSelectionActionRegistry(), []);
  const [reference, setReference] = useState<DataSurfaceZoneSelection>();
  useEffect(() => selectionActions.register({
    id: 'gallery-intro-reference',
    label: 'Reference this',
    icon: ArrowUpRight,
    order: 10,
    kinds: ['data-surface-zone'],
    run: (target) => { if (target.kind === 'data-surface-zone') setReference(target); },
  }), [selectionActions]);
  return <SelectionActionsContext.Provider value={selectionActions}>
    <div className="gallery-intro-showcase">
      <div className="gallery-intro-heading">
        <div>
          <p className="gallery-hurricane-kicker">From evidence to a new question</p>
          <h2>Explore the result. Point to what matters.</h2>
          <p>Move through a scientific surface, select the data behind a finding, or capture a visual region to discuss with the agent.</p>
        </div>
        <span className="gallery-intro-live">Interactive examples</span>
      </div>
      <div className="gallery-intro-grid">
        <section className="gallery-intro-panel" aria-label="Explore a 3D surface">
          <div className="gallery-intro-panel-heading"><span className="gallery-intro-number">01</span><div><h3>Explore a 3D surface</h3><p>Orbit, probe the field, and box select part of the specimen.</p></div></div>
          <A2uiDemo name="clio.mesh-viewport.v1" variant="intro-load" />
          <p className="gallery-intro-note">Illustrative, dimensionless field on a specimen shaped for this gallery. <a href="https://github.com/JaimeCernuda/abaqus-scripting" rel="noreferrer" target="_blank">Explore the Abaqus example</a> for real simulation outputs.</p>
        </section>
        <section className="gallery-intro-panel" aria-label="Select observations">
          <div className="gallery-intro-panel-heading"><span className="gallery-intro-number">02</span><div><h3>Select a profile point</h3><p>Pick a height in the same illustrative field, then use Reference this.</p></div></div>
          <A2uiDemo name="clio.chart.v1" variant="intro-load" />
          {reference ? <aside aria-label="Selected data reference" className="gallery-intro-reference"><div><ArrowUpRight aria-hidden="true" className="size-4" /><strong>What the agent receives</strong><button onClick={() => setReference(undefined)} type="button">Close</button></div><p>{reference.summary}</p><pre>{reference.markdown}</pre></aside> : null}
        </section>
      </div>
      <div className="gallery-intro-flow">
        <div><ArrowUpRight aria-hidden="true" /><span><strong>Data selection</strong><small>Selected rows become a precise, reusable reference in the conversation.</small></span></div>
        <div><BoxSelect aria-hidden="true" /><span><strong>Visual selection</strong><small>Capture labelled regions from the viewport and attach the image to a request.</small></span></div>
        <div><ImageIcon aria-hidden="true" /><span><strong>Ask for a visual response</strong><small>In a connected session, the captured image can guide a new annotated image.</small></span></div>
      </div>
    </div>
  </SelectionActionsContext.Provider>;
}

function Preview() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== 'light';
  const [section, setSection] = useState(new URLSearchParams(window.location.search).get('section') === 'linked' ? 'linked' : 'intro');
  const [linkedExample, setLinkedExample] = useState('hurricanes');
  const [showGeneralSkill, setShowGeneralSkill] = useState(false);
  const openGeneralSkill = () => {
    if (embedded && window.parent !== window) {
      window.parent.postMessage({ type: 'clio:gallery-skill', name: 'general' }, window.location.origin);
    } else {
      setShowGeneralSkill(true);
    }
  };
  useEffect(() => {
    if (!embedded) return;
    const syncTheme = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const message = event.data as { type?: string; theme?: string };
      if (message?.type === 'clio:gallery-theme' && (message.theme === 'dark' || message.theme === 'light')) setTheme(message.theme);
    };
    window.addEventListener('message', syncTheme);
    return () => window.removeEventListener('message', syncTheme);
  }, [setTheme]);
  if (skillPreview) return <GallerySkillDialog name={skillPreview} onClose={() => window.parent.postMessage({ type: 'clio:gallery-skill-close' }, window.location.origin)} />;
  return (
    <main className={`gallery-page min-h-screen bg-background px-4 text-foreground sm:px-8 ${embedded ? 'py-4' : 'py-8'}`}>
      <div className="mx-auto max-w-7xl space-y-6">
        {embedded ? <div className="flex justify-end"><button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={openGeneralSkill} type="button">Agent guidance</button></div> : <header className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Explore {vocab.agent}</p><h1 className="text-2xl font-semibold tracking-tight">Widget gallery</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Explore {vocab.agent}’s interactive components and connected views.</p></div>
          <div className="flex shrink-0 gap-2"><button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={openGeneralSkill} type="button">Agent guidance</button><button className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setTheme(dark ? 'light' : 'dark')} type="button">{dark ? 'Light theme' : 'Dark theme'}</button></div>
        </header>}
        <Tabs onValueChange={setSection} value={section}>
          <TabsList aria-label="Widget gallery" className="gallery-tab-scroll h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0" variant="line"><TabsTrigger value="intro">Intro</TabsTrigger><TabsTrigger value="components">Components</TabsTrigger><TabsTrigger value="linked">Linked data</TabsTrigger></TabsList>
          <TabsContent className="space-y-8 pt-6" value="intro">
            <IntroShowcase />
            <div className="flex flex-wrap items-center justify-between gap-4"><p className="max-w-2xl text-sm text-muted-foreground">These are live gallery examples. Explore the full component catalog or follow one dataset through linked views.</p><div className="flex gap-2"><button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => setSection('components')} type="button">Explore components</button><button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => setSection('linked')} type="button">See linked views</button></div></div>
          </TabsContent>
          <TabsContent className="pt-6" value="components"><WidgetGallery /></TabsContent>
          <TabsContent className="space-y-5 pt-6" value="linked"><div className="max-w-3xl space-y-2"><h2 className="text-xl font-semibold">Interact with your data visually</h2><p className="text-sm leading-6 text-muted-foreground">Selections travel between views of the same observations. Play the walkthrough, then try the map, curves, and table yourself.</p></div><div aria-label="Linked data examples" className="gallery-tab-scroll flex gap-1 overflow-x-auto" role="group"><button aria-pressed={linkedExample === 'hurricanes'} className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${linkedExample === 'hurricanes' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`} onClick={() => setLinkedExample('hurricanes')} type="button">Hurricane tracks</button><button aria-pressed={linkedExample === 'events'} className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${linkedExample === 'events' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`} onClick={() => setLinkedExample('events')} type="button">Earthquake readings</button></div>{linkedExample === 'hurricanes' ? <HurricaneShowcase /> : <LinkedChartDemo />}</TabsContent>
        </Tabs>
        <GallerySkillDialog name={showGeneralSkill ? 'general' : null} onClose={() => setShowGeneralSkill(false)} />
      </div><Toaster />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><AppProviders><Preview /></AppProviders></BrowserRouter>);
