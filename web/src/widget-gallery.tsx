import type { CommentAttachment } from '@clio/core/v3';
import { ADD_COMMENT_SESSION_EVENT } from '@/components/clio/comments/comment-model';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { galleryComponentFromHash, galleryComponentSlug } from '@/lib/gallery-component-links';
import { renderMarkdown } from '@a2ui/markdown-it';
import { MarkdownContext } from '@a2ui/react/v0_9';
import { Catalog, MessageProcessor, type A2uiMessage } from '@a2ui/web_core/v0_9';
import { ArrowUpRight, Search } from 'lucide-react';
import { A2uiSurface, KERNEL_COMPONENTS, KERNEL_FUNCTIONS } from '@/lib/a2ui/kernel-catalog';
import { A2uiReferenceSessionProvider } from '@/lib/a2ui/reference-session';
import { AutoDatasetSelectionProvider } from '@/lib/a2ui/auto-dataset-selection';
import {
  A2uiRegionCaptureProvider,
  type CaptureSurface,
} from '@/components/clio/a2ui-region-capture';
import { SelectionActionsContext } from '@/lib/selection-actions-context';
import { createSelectionActionRegistry } from '@/lib/selection-actions';
import { GallerySkillDialog } from '@/gallery-skill-dialog';
import type { DataSurfaceZoneSelection } from '@/lib/selection-actions';
import {
  A2UI_BASIC_EXAMPLES,
  BASIC_CATALOG_ROW,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';
import { t, ph } from '@lingui/core/macro';
import {
  basicExamples,
  clioDemo,
  groups,
  labels,
  type ComponentName,
} from './widget-gallery-demos';

export function A2uiDemo({
  name,
  variant,
  demoSelection,
  onInteract,
}: {
  name: ComponentName;
  variant: string;
  demoSelection?: string | null;
  onInteract?: () => void;
}) {
  const [lastAction, setLastAction] = useState('');
  const [capturePreview, setCapturePreview] = useState<{ imageUrl: string; text: string }>();
  const surface = useMemo(() => {
    const workspaceOnly =
      name.startsWith('clio.') || name === 'Frame' || name === 'Grid' || name.startsWith('linked');
    const catalogId = workspaceOnly
      ? CLIO_WORKSPACE_CATALOG_ROW.catalogId
      : BASIC_CATALOG_ROW.catalogId;
    const catalog = new Catalog(
      catalogId,
      [...KERNEL_COMPONENTS.values()],
      [...KERNEL_FUNCTIONS.values()],
    );
    const processor = new MessageProcessor([catalog], async () => undefined, {
      version: workspaceOnly ? 'v0.9.1' : 'v0.9',
    });
    const example = basicExamples[name]
      ? A2UI_BASIC_EXAMPLES.find((item) => item.file.includes(basicExamples[name]!))
      : undefined;
    if (!name.startsWith('clio.') && example) {
      processor.processMessages(example.messages as A2uiMessage[]);
      const first = example.messages[0] as { createSurface: { surfaceId: string } };
      return processor.model.getSurface(first.createSurface.surfaceId);
    }
    const surfaceId = `gallery-${name.replaceAll('.', '-')}`;
    const version = workspaceOnly ? 'v0.9.1' : 'v0.9';
    const initialValues: Record<string, unknown> = {
      CheckBox: false,
      ChoicePicker:
        variant === 'multi-search' ? [] : variant === 'single-search' ? ['1'] : ['region'],
      DateTimeInput: '2026-10-01T12:00',
      Slider: 3,
      TextField: '',
    };
    const initialPath: Record<string, string> = {
      CheckBox: '/demo/checked',
      ChoicePicker: '/demo/choice',
      DateTimeInput: '/demo/cutoff',
      Slider: '/demo/magnitude',
      TextField: '/demo/note',
    };
    processor.processMessages([
      { version, createSurface: { surfaceId, catalogId } },
      ...(initialPath[name]
        ? [
            {
              version,
              updateDataModel: { surfaceId, path: initialPath[name], value: initialValues[name] },
            },
          ]
        : []),
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
  useEffect(() => {
    if (name !== 'linked-hurricanes' || demoSelection === undefined) return;
    surface?.dataModel.set('/selection/hurricanes', {
      field: 'observation_id',
      values: demoSelection ? [demoSelection] : [],
      source: 'gallery-demo',
    });
  }, [name, demoSelection, surface]);
  useEffect(() => {
    const showCapture = (event: Event) => {
      const detail = (event as CustomEvent<CommentAttachment>).detail;
      const overview = detail?.images?.find((image) => !image.label);
      if (!surface || detail?.kind !== 'a2ui-surface' || !overview) return;
      const text = detail.marks
        .map((mark) =>
          [
            `${mark.label}: ${mark.comment || '(no comment)'}`,
            ...((mark.anchor.source?.under as string[] | undefined) ?? []),
          ].join('\n'),
        )
        .join('\n\n');
      setCapturePreview({ imageUrl: overview.data, text });
    };
    window.addEventListener(ADD_COMMENT_SESSION_EVENT, showCapture);
    return () => window.removeEventListener(ADD_COMMENT_SESSION_EVENT, showCapture);
  }, [surface]);
  if (!surface)
    return <p className="text-sm text-muted-foreground">{t`This example could not be created.`}</p>;
  const captureSurface: CaptureSurface = {
    id: surface.id,
    revision: 1,
    messages: [{ updateComponents: { components: examplePayload(name, variant) } }],
  };
  return (
    <div className="space-y-4" onPointerDownCapture={onInteract}>
      <div data-slot="a2ui-surface-root">
        <MarkdownContext.Provider value={renderMarkdown}>
          <A2uiReferenceSessionProvider value="sess_flat_ndp">
            <AutoDatasetSelectionProvider>
              <A2uiRegionCaptureProvider allowDemoCapture surface={captureSurface}>
                <A2uiSurface surface={surface} />
              </A2uiRegionCaptureProvider>
            </AutoDatasetSelectionProvider>
          </A2uiReferenceSessionProvider>
        </MarkdownContext.Provider>
      </div>
      {lastAction ? (
        <p className="rounded-md bg-muted px-3 py-2 text-xs">{t`Demo action: ${lastAction}`}</p>
      ) : null}
      {capturePreview ? (
        <aside aria-label={t`Capture preview`} className="space-y-3 rounded-md border p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <p className="font-medium">{t`Capture preview`}</p>
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setCapturePreview(undefined)}
              type="button"
            >{t`Close`}</button>
          </div>
          <img
            alt={t`Captured surface with labelled selection boxes`}
            className="max-h-80 max-w-full rounded border object-contain"
            src={capturePreview.imageUrl}
          />
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">{t`View agent payload`}</summary>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-sm bg-muted/30 p-2 text-xs">
              {capturePreview.text}
            </pre>
          </details>
        </aside>
      ) : null}
    </div>
  );
}

/** Two charts and a table using the same earthquake rows. */
export function LinkedChartDemo() {
  return <A2uiDemo name="linked-regions" variant="scatter" />;
}

function catalogDescription(name: string): string {
  const file = CLIO_WORKSPACE_CATALOG_ROW.file as {
    components?: Record<string, { description?: string }>;
  };
  return file.components?.[name]?.description ?? '';
}

function examplePayload(name: string, variant: string): unknown {
  const fixtureName = basicExamples[name];
  if (!fixtureName) return clioDemo(name, variant);
  const example = A2UI_BASIC_EXAMPLES.find((item) => item.file.includes(fixtureName));
  const messages = example?.messages as
    | Array<{ updateComponents?: { components?: unknown } }>
    | undefined;
  return (
    messages?.find((message) => message.updateComponents)?.updateComponents?.components ??
    clioDemo(name, variant)
  );
}

/** A visually led explorer of every component in the CLIO workspace catalog. */
export function WidgetGallery() {
  const [active, setActive] = useState(
    () =>
      galleryComponentFromHash(
        window.location.hash,
        groups.flatMap((group) => group.names),
      ) ?? 'clio.chart.v1',
  );
  const [query, setQuery] = useState('');
  const [variant, setVariant] = useState(() =>
    active === 'clio.map.v1' ? 'sites' : active === 'ChoicePicker' ? 'inline' : 'scatter',
  );
  const [showContract, setShowContract] = useState(false);
  const [showExample, setShowExample] = useState(false);
  const [composer, setComposer] = useState('');
  const [reference, setReference] = useState<DataSurfaceZoneSelection>();
  const [skill, setSkill] = useState<string | null>(null);
  const selectComponent = useCallback((name: string, updateUrl = true) => {
    setActive(name);
    if (name === 'clio.map.v1') setVariant('sites');
    if (name === 'clio.chart.v1') setVariant('scatter');
    if (name === 'ChoicePicker') setVariant('inline');
    setShowContract(false);
    setReference(undefined);
    const hash = `#${galleryComponentSlug(name)}`;
    if (updateUrl && window.location.hash !== hash) window.history.pushState(null, '', hash);
  }, []);
  useEffect(() => {
    const sync = () => {
      const name = galleryComponentFromHash(
        window.location.hash,
        groups.flatMap((group) => group.names),
      );
      if (name) selectComponent(name, false);
      else if (!window.location.hash) selectComponent('clio.chart.v1', false);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, [selectComponent]);
  const openSkill = (name: string) => {
    if (new URLSearchParams(window.location.search).has('embedded') && window.parent !== window) {
      window.parent.postMessage({ type: 'clio:gallery-skill', name }, window.location.origin);
    } else {
      setSkill(name);
    }
  };
  const selectionActions = useMemo(() => createSelectionActionRegistry(), []);
  useEffect(
    () =>
      selectionActions.register({
        id: 'gallery-reference-preview',
        label: t`Reference this`,
        icon: ArrowUpRight,
        order: 10,
        kinds: ['data-surface-zone'],
        run: (target) => {
          if (target.kind === 'data-surface-zone') setReference(target);
        },
      }),
    [selectionActions],
  );
  useEffect(() => {
    const useDraft = (event: Event) =>
      setComposer((event as CustomEvent<{ text: string }>).detail.text);
    window.addEventListener('clio:use-message-draft', useDraft);
    return () => window.removeEventListener('clio:use-message-draft', useDraft);
  }, []);
  const activeGroup = groups.find((group) => group.names.includes(active));
  return (
    <SelectionActionsContext.Provider value={selectionActions}>
      <section className="grid gap-7 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <label className="block space-y-1.5 text-xs text-muted-foreground lg:hidden">
          <span>{t`Component`}</span>
          <select
            aria-label={t`Choose a component`}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
            onChange={(event) => {
              selectComponent(event.target.value);
            }}
            value={active}
          >
            {groups.map((group) => (
              <optgroup key={group.title} label={group.title}>
                {group.names.map((name) => (
                  <option key={name} value={name}>
                    {labels[name] ?? name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>
        <nav
          aria-label={t`Components`}
          className="gallery-nav-scroll hidden space-y-5 lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto"
        >
          <label className="flex items-center gap-2 rounded-md border px-3">
            <Search aria-hidden className="size-4 text-muted-foreground" />
            <input
              aria-label={t`Find a component`}
              className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t`Find a component`}
              value={query}
            />
          </label>
          {groups.map((group) => {
            const names = group.names.filter((name) =>
              `${labels[name] ?? name} ${name}`.toLowerCase().includes(query.toLowerCase()),
            );
            return names.length ? (
              <div className="space-y-1" key={group.title}>
                <p className="px-2 pb-1 text-caption font-medium uppercase tracking-wider text-muted-foreground">
                  {group.title}
                </p>
                {names.map((name) => (
                  <button
                    aria-current={active === name ? 'page' : undefined}
                    className={`block w-full rounded-md px-2 py-1.5 text-left text-sm transition-colors ${active === name ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'}`}
                    key={name}
                    onClick={() => {
                      selectComponent(name);
                    }}
                    type="button"
                  >
                    {labels[name] ?? name}
                  </button>
                ))}
              </div>
            ) : null;
          })}
        </nav>
        <div className="min-w-0 space-y-5">
          <header className="flex flex-wrap items-start justify-between gap-3 border-b pb-4">
            <div>
              <p className="text-xs text-muted-foreground">{activeGroup?.title}</p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight">
                <a
                  href={`#${galleryComponentSlug(active)}`}
                  aria-label={t`Link to ${ph({ component: labels[active] ?? active })}`}
                  className="hover:underline"
                >
                  {labels[active] ?? active}
                </a>
              </h2>
            </div>
            <div className="flex gap-2">
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setShowExample((value) => !value)}
                type="button"
              >
                {showExample ? t`Hide example` : t`Example data`}
              </button>
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => setShowContract((value) => !value)}
                type="button"
              >
                {showContract ? t`Hide details` : t`Details`}{' '}
                <ArrowUpRight aria-hidden className="size-3" />
              </button>
              <button
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => openSkill(active)}
                type="button"
              >{t`Contract`}</button>
            </div>
          </header>
          {active === 'clio.chart.v1' ? (
            <div
              className="gallery-tab-scroll flex gap-1 overflow-x-auto"
              role="group"
              aria-label={t`Chart example`}
            >
              {['scatter', 'boxplot', 'heatmap', 'trajectories', 'storm-series', 'spectra'].map(
                (item) => (
                  <button
                    aria-pressed={variant === item}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs capitalize ${variant === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                    key={item}
                    onClick={() => {
                      setVariant(item);
                      setReference(undefined);
                    }}
                    type="button"
                  >
                    {item === 'storm-series' ? t`Storm series` : item}
                  </button>
                ),
              )}
            </div>
          ) : null}
          {active === 'clio.map.v1' ? (
            <div
              className="gallery-tab-scroll flex gap-1 overflow-x-auto"
              role="group"
              aria-label={t`Map example`}
            >
              {[
                { id: 'sites', label: t`Sites` },
                { id: 'storm-tracks', label: t`Storm tracks` },
              ].map((item) => (
                <button
                  aria-pressed={variant === item.id}
                  className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${variant === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                  key={item.id}
                  onClick={() => {
                    setVariant(item.id);
                    setReference(undefined);
                  }}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          {active === 'ChoicePicker' ? (
            <>
              <p className="text-sm text-muted-foreground">{t`Small groups stay visible. Larger lists open in a searchable dropdown. Try choosing one plant or several from 150 example options.`}</p>
              <div
                className="gallery-tab-scroll flex gap-1 overflow-x-auto"
                role="group"
                aria-label={t`Choice example`}
              >
                {[
                  { id: 'inline', label: t`Small group` },
                  { id: 'single-search', label: t`One plant` },
                  { id: 'multi-search', label: t`Several plants` },
                ].map((item) => (
                  <button
                    aria-pressed={variant === item.id}
                    className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${variant === item.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
                    key={item.id}
                    onClick={() => {
                      setVariant(item.id);
                      setReference(undefined);
                    }}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {active === 'clio.callout.v1' ? (
            <p className="text-sm text-muted-foreground">{t`A short notice for a result, warning, or next step that deserves attention.`}</p>
          ) : null}
          <div className="min-h-56 overflow-x-auto">
            <div
              className={
                active === 'clio.chart.v1'
                  ? 'min-w-[540px] sm:min-w-0'
                  : active === 'clio.artifact.v1'
                    ? 'max-w-2xl'
                    : undefined
              }
            >
              <A2uiDemo key={`${active}:${variant}`} name={active} variant={variant} />
            </div>
          </div>
          {reference ? (
            <aside
              aria-label={t`Reference preview`}
              className="space-y-2 rounded-md border p-3 text-sm"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{t`Reference preview`}</p>
                  <p className="text-xs text-muted-foreground">{reference.summary}</p>
                </div>
                <button
                  aria-label={t`Close reference preview`}
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setReference(undefined)}
                  type="button"
                >{t`Close`}</button>
              </div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-sm bg-muted/30 p-2 text-xs">
                {reference.markdown}
              </pre>
            </aside>
          ) : null}
          {active === 'clio.message-draft.v1' && composer ? (
            <label className="block space-y-2 text-sm">
              <span className="text-muted-foreground">{t`Composer`}</span>
              <textarea
                className="min-h-32 w-full rounded-md border bg-background p-3"
                onChange={(event) => setComposer(event.target.value)}
                value={composer}
              />
            </label>
          ) : null}
          {showContract ? (
            <aside className="space-y-2 rounded-md bg-muted/50 p-4 text-sm">
              <p>
                {catalogDescription(active) ||
                  t`A layout or control building block in the A2UI Basic catalog.`}
              </p>
              <p className="font-mono text-xs text-muted-foreground">{active}</p>
            </aside>
          ) : null}
          {showExample ? (
            <pre className="max-h-96 overflow-auto rounded-md border bg-muted/20 p-4 text-xs">
              {JSON.stringify(examplePayload(active, variant), null, 2)}
            </pre>
          ) : null}
        </div>
      </section>
      <GallerySkillDialog name={skill} onClose={() => setSkill(null)} />
    </SelectionActionsContext.Provider>
  );
}
