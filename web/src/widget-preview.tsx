// oxlint-disable react/only-export-components -- This is a standalone gallery entrypoint.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { Toaster } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AppProviders } from '@/providers/app-providers';
import { A2uiDemo, LinkedChartDemo, LinkedViewsDemo, WidgetGallery } from '@/widget-gallery';
import { GallerySkillDialog } from '@/gallery-skill-dialog';
import './index.css';
import './widget-gallery.css';

const embedded = new URLSearchParams(window.location.search).has('embedded');
const skillPreview = new URLSearchParams(window.location.search).get('skill');
if (skillPreview) document.documentElement.classList.add('gallery-skill-preview');

function Preview() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme !== 'light';
  const [section, setSection] = useState('intro');
  const [linkedExample, setLinkedExample] = useState('sites');
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
          <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Explore CLIO</p><h1 className="text-2xl font-semibold tracking-tight">Widget gallery</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Explore CLIO’s interactive components and connected views.</p></div>
          <div className="flex shrink-0 gap-2"><button className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={openGeneralSkill} type="button">Agent guidance</button><button className="shrink-0 rounded-md border px-3 py-1.5 text-sm hover:bg-muted" onClick={() => setTheme(dark ? 'light' : 'dark')} type="button">{dark ? 'Light theme' : 'Dark theme'}</button></div>
        </header>}
        <Tabs onValueChange={setSection} value={section}>
          <TabsList aria-label="Widget gallery" className="gallery-tab-scroll h-auto w-full flex-nowrap justify-start gap-1 overflow-x-auto bg-transparent p-0" variant="line"><TabsTrigger value="intro">Intro</TabsTrigger><TabsTrigger value="components">Components</TabsTrigger><TabsTrigger value="linked">Linked data</TabsTrigger></TabsList>
          <TabsContent className="space-y-8 pt-6" value="intro">
            <div className="max-w-3xl space-y-3"><h2 className="text-xl font-semibold">Answers you can explore</h2><p className="text-sm leading-6 text-muted-foreground">CLIO can show an answer as a chart, map, table, forecast, draft, protocol, or composed view. The agent supplies data and configuration. The workspace supplies selection, filters, reference, and export where they apply.</p><div className="flex flex-wrap gap-2"><button className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => setSection('components')} type="button">Explore components</button><button className="rounded-md border px-3 py-2 text-sm hover:bg-muted" onClick={() => setSection('linked')} type="button">See linked views</button></div></div>
            <div className="grid items-start gap-6 lg:grid-cols-2"><section className="min-w-0 space-y-3"><div><h3 className="font-medium">Compare data</h3><p className="text-sm text-muted-foreground">Select points, filter rows, and reference what is visible.</p></div><A2uiDemo name="clio.chart.v1" variant="scatter" /></section><section className="min-w-0 space-y-3"><div><h3 className="font-medium">Present a decision</h3><p className="text-sm text-muted-foreground">A status and next action can sit beside the analysis.</p></div><A2uiDemo name="report-review" variant="scatter" /></section></div>
            <p className="text-sm text-muted-foreground">The <strong className="text-foreground">Components</strong> tab includes all 37 catalog entries, including controls, layout, and media. Each example links to its exact contract. <strong className="text-foreground">Agent guidance</strong> shows the standard marketplace agent and presentation skill.</p>
          </TabsContent>
          <TabsContent className="pt-6" value="components"><WidgetGallery /></TabsContent>
          <TabsContent className="space-y-5 pt-6" value="linked"><div className="max-w-3xl space-y-2"><h2 className="text-lg font-semibold">One dataset across several views</h2><p className="text-sm leading-6 text-muted-foreground">CLIO links views of the same rows so a selection in one can be found in the others. Click a point or row, then inspect the other views and the data sent by Reference this.</p></div><div aria-label="Linked data examples" className="gallery-tab-scroll flex gap-1 overflow-x-auto" role="group"><button aria-pressed={linkedExample === 'sites'} className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${linkedExample === 'sites' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`} onClick={() => setLinkedExample('sites')} type="button">Field sites</button><button aria-pressed={linkedExample === 'events'} className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${linkedExample === 'events' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`} onClick={() => setLinkedExample('events')} type="button">Earthquake readings</button></div>{linkedExample === 'sites' ? <LinkedViewsDemo /> : <LinkedChartDemo />}</TabsContent>
        </Tabs>
        <GallerySkillDialog name={showGeneralSkill ? 'general' : null} onClose={() => setShowGeneralSkill(false)} />
      </div><Toaster />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><AppProviders><Preview /></AppProviders></BrowserRouter>);
