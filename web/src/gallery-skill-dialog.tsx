import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BASIC_CATALOG_ROW,
  CLIO_WORKSPACE_CATALOG_ROW,
} from '@/test-fixtures/a2ui/v0_9_1/fixtures';

const MarkdownText = lazy(async () => ({
  default: (await import('@/components/ai-elements/markdown')).MarkdownText,
}));

type CatalogComponent = {
  description?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  allOf?: CatalogComponent[];
};
type CatalogFile = { components?: Record<string, CatalogComponent> };

const catalogs = [
  { name: 'CLIO workspace', skill: 'a2ui-catalog-clio-workspace', row: CLIO_WORKSPACE_CATALOG_ROW },
  { name: 'A2UI Basic', skill: 'a2ui-catalog-basic', row: BASIC_CATALOG_ROW },
];

function componentGuide(name: string): string {
  const catalog = catalogs.find(({ row }) => (row.file as CatalogFile).components?.[name]);
  const schema = catalog && (catalog.row.file as CatalogFile).components?.[name];
  if (!catalog || !schema) return `No catalog entry is available for \`${name}\`.`;
  const clauses = [schema, ...(schema.allOf ?? [])];
  const fields = Object.assign({}, ...clauses.map((clause) => clause.properties ?? {})) as Record<
    string,
    unknown
  >;
  const requiredFields = new Set(clauses.flatMap((clause) => clause.required ?? []));
  const properties = Object.entries(fields).map(([property, definition]) => {
    const field = definition as { description?: string; type?: string; enum?: unknown[] };
    const required = requiredFields.has(property) ? 'Required' : 'Optional';
    const detail = field.enum
      ? `Values: ${field.enum.join(', ')}`
      : (field.type ??
        (field.description && field.description.length <= 100 ? field.description : ''));
    return `- \`${property}\` (${required})${detail ? `: ${detail}` : ''}`;
  });
  return [
    `# ${name}`,
    '',
    schema.description ?? '',
    '',
    `From the **${catalog.name}** catalog. The agent loads its exact contract with:`,
    '',
    `\`load_skill("${catalog.skill}", file="catalog.json#/components/${name}")\``,
    '',
    'The renderer supplies applicable selection, filter, zoom, reference, export, and full-screen actions. The agent provides the data and configuration.',
    '',
    '## Fields',
    '',
    ...properties,
    '',
    '## Validation rules',
    '',
    ...clauses
      .slice(1)
      .filter((clause) => clause.description && clause.description.length <= 160)
      .map((clause) => `- ${clause.description}`),
    '',
    'Open **Full schema** for all field descriptions and constraints.',
  ].join('\n');
}

function componentSchema(name: string): string {
  const catalog = catalogs.find(({ row }) => (row.file as CatalogFile).components?.[name]);
  const schema = catalog && (catalog.row.file as CatalogFile).components?.[name];
  return schema
    ? `# ${name} schema\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``
    : `No catalog entry is available for \`${name}\`.`;
}

function catalogGuide(): string {
  return [
    '# A2UI catalog skills',
    '',
    'The agent loads one catalog index, then the exact schema for the component it chooses. These entries are generated from the same catalog files used by this gallery.',
    ...catalogs.flatMap(({ name, skill, row }) => [
      '',
      `## ${name}`,
      '',
      `\`load_skill("${skill}")\``,
      '',
      ...Object.entries((row.file as CatalogFile).components ?? {}).map(
        ([id, schema]) => `- **${id}**${schema.description ? `: ${schema.description}` : ''}`,
      ),
    ]),
  ].join('\n');
}

const overview = [
  '# How CLIO builds interactive views',
  '',
  'Ask CLIO for an answer you can explore, such as a comparison, forecast, map, or draft. The agent chooses a suitable component from its available catalogs and supplies the content. The workspace renders the view inline.',
  '',
  '1. **Choose a component.** The presentation skill explains when charts, maps, tables, drafts, guides, and other views help.',
  '2. **Read its contract.** The catalog skill lists available components. Each widget has a validated schema for its data and options.',
  '3. **Explore the result.** Try the controls in this gallery. Selection, filters, zoom, export, and reference actions are supplied by the renderer where they apply.',
  '',
  'The **Standard agent** tab shows the marketplace agent definition and its base instructions. The **Presentation skill** tab shows its A2UI guidance. The **Catalog skills** tab shows component descriptions. Open **Skill** beside a widget for its specific fields and full schema.',
].join('\n');

function withoutFrontmatter(body: string, heading: string): string {
  const content = body.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').trimStart();
  return `# ${heading}\n\n${content.replace(/^# [^\n]+\r?\n+/, '')}`;
}

/** Shows the shipped presentation skill and catalog contracts beside live examples. */
export function GallerySkillDialog({
  name,
  onClose,
}: {
  name: string | null;
  onClose: () => void;
}) {
  const [section, setSection] = useState<
    'overview' | 'component' | 'schema' | 'agent' | 'presentation' | 'catalogs'
  >('component');
  const [presentation, setPresentation] = useState('');
  const [agent, setAgent] = useState('');
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (!name || presentation) return;
    const controller = new AbortController();
    fetch(new URL('gallery-skills/present-interactive-analysis.md', window.location.href), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
          throw new Error(`Skill unavailable (${response.status})`);
        return response.text();
      })
      .then((body) => setPresentation(withoutFrontmatter(body, 'Present interactive analysis')))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'Skill unavailable');
      });
    return () => controller.abort();
  }, [name, presentation]);
  useEffect(() => {
    if (!name || agent) return;
    const controller = new AbortController();
    const paths = ['base-agent/AGENT.md', 'base-agent/experts/base.md'];
    Promise.all(
      paths.map(async (path) => {
        const response = await fetch(new URL(`gallery-skills/${path}`, window.location.href), {
          signal: controller.signal,
        });
        if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
          throw new Error(`Standard agent unavailable (${response.status})`);
        return response.text();
      }),
    )
      .then(([definition, instructions]) =>
        setAgent(
          [
            withoutFrontmatter(definition, 'Standard agent'),
            withoutFrontmatter(instructions, 'Base expert instructions'),
          ].join('\n\n'),
        ),
      )
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : 'Standard agent unavailable');
      });
    return () => controller.abort();
  }, [name, agent]);
  useEffect(() => {
    setSection(name === 'general' ? 'overview' : 'component');
  }, [name]);
  const content =
    section === 'overview'
      ? overview
      : section === 'component'
        ? componentGuide(name ?? '')
        : section === 'schema'
          ? componentSchema(name ?? '')
          : section === 'agent'
            ? agent || loadError || 'Loading standard agent…'
            : section === 'catalogs'
              ? catalogGuide()
              : presentation || loadError || 'Loading skill…';
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={name !== null}
    >
      <DialogContent className="grid max-h-[min(820px,calc(100dvh-2rem))] grid-rows-[auto_auto_minmax(0,1fr)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{name === 'general' ? 'A2UI skills' : `${name} skill`}</DialogTitle>
          <DialogDescription>
            Explore the agent guidance and exact contracts behind these interactive views.
          </DialogDescription>
        </DialogHeader>
        <div
          aria-label="Skill sections"
          className="gallery-tab-scroll flex gap-1 overflow-x-auto border-b pb-2"
          role="tablist"
        >
          <button
            aria-selected={section === 'overview'}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'overview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={() => setSection('overview')}
            role="tab"
            type="button"
          >
            How it works
          </button>
          {name !== 'general' ? (
            <button
              aria-selected={section === 'component'}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'component' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              onClick={() => setSection('component')}
              role="tab"
              type="button"
            >
              This widget
            </button>
          ) : null}
          {name !== 'general' ? (
            <button
              aria-selected={section === 'schema'}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'schema' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              onClick={() => setSection('schema')}
              role="tab"
              type="button"
            >
              Full schema
            </button>
          ) : null}
          <button
            aria-selected={section === 'agent'}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'agent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={() => setSection('agent')}
            role="tab"
            type="button"
          >
            Standard agent
          </button>
          <button
            aria-selected={section === 'presentation'}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'presentation' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={() => setSection('presentation')}
            role="tab"
            type="button"
          >
            Presentation skill
          </button>
          <button
            aria-selected={section === 'catalogs'}
            className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'catalogs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
            onClick={() => setSection('catalogs')}
            role="tab"
            type="button"
          >
            Catalog skills
          </button>
        </div>
        <ScrollArea className="min-h-0 pr-3">
          <Suspense fallback={<p className="text-sm text-muted-foreground">Loading guide…</p>}>
            <MarkdownText mode="static">{content}</MarkdownText>
          </Suspense>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
