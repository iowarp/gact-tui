import { vocab } from '@/lib/brand-vocabulary';
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
import { t, ph } from '@lingui/core/macro';

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

const { agent } = vocab;

const catalogs = [
  {
    name: t`${agent} workspace`,
    skill: 'a2ui-catalog-clio-workspace',
    row: CLIO_WORKSPACE_CATALOG_ROW,
  },
  { name: t`A2UI Basic`, skill: 'a2ui-catalog-basic', row: BASIC_CATALOG_ROW },
];

function componentGuide(name: string): string {
  const catalog = catalogs.find(({ row }) => (row.file as CatalogFile).components?.[name]);
  const schema = catalog && (catalog.row.file as CatalogFile).components?.[name];
  if (!catalog || !schema) return t`No catalog entry is available for \`${name}\`.`;
  const clauses = [schema, ...(schema.allOf ?? [])];
  const fields = Object.assign({}, ...clauses.map((clause) => clause.properties ?? {})) as Record<
    string,
    unknown
  >;
  const requiredFields = new Set(clauses.flatMap((clause) => clause.required ?? []));
  const properties = Object.entries(fields).map(([property, definition]) => {
    const field = definition as { description?: string; type?: string; enum?: unknown[] };
    const required = requiredFields.has(property) ? t`Required` : t`Optional`;
    const detail = field.enum
      ? t`Values: ${ph({ values: field.enum.join(', ') })}`
      : (field.type ??
        (field.description && field.description.length <= 100 ? field.description : ''));
    return `- \`${property}\` (${required})${detail ? `: ${detail}` : ''}`;
  });
  return [
    `# ${name}`,
    '',
    schema.description ?? '',
    '',
    t`From the **${ph({ name: catalog.name })}** catalog. The agent loads its exact contract with:`,
    '',
    `\`load_skill("${catalog.skill}", file="catalog.json#/components/${name}")\``,
    '',
    `## ${t`Fields`}`,
    '',
    ...properties,
    '',
    `## ${t`Validation rules`}`,
    '',
    ...clauses
      .slice(1)
      .filter((clause) => clause.description && clause.description.length <= 160)
      .map((clause) => `- ${clause.description}`),
    '',
    t`Open **Full schema** for all field descriptions and constraints.`,
  ].join('\n');
}

function componentSchema(name: string): string {
  const catalog = catalogs.find(({ row }) => (row.file as CatalogFile).components?.[name]);
  const schema = catalog && (catalog.row.file as CatalogFile).components?.[name];
  return schema
    ? `# ${t`${name} schema`}\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\``
    : t`No catalog entry is available for \`${name}\`.`;
}

function catalogGuide(): string {
  return [
    `# ${t`A2UI catalog skills`}`,
    '',
    t`The agent loads one catalog index, then the exact schema for the component it chooses. These entries are generated from the same catalog files used by this gallery.`,
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
  const [requestedSection, setSection] = useState<
    'component' | 'schema' | 'agent' | 'presentation' | 'catalogs'
  >('component');
  const section =
    name === 'general'
      ? requestedSection === 'agent' ||
        requestedSection === 'presentation' ||
        requestedSection === 'catalogs'
        ? requestedSection
        : 'agent'
      : requestedSection === 'component' || requestedSection === 'schema'
        ? requestedSection
        : 'component';
  const [presentation, setPresentation] = useState('');
  const [agent, setAgent] = useState('');
  const [loadError, setLoadError] = useState('');
  useEffect(() => {
    if (name !== 'general' || presentation) return;
    const controller = new AbortController();
    fetch(new URL('gallery-skills/present-interactive-analysis.md', window.location.href), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
          throw new Error(`Skill unavailable (${response.status})`);
        return response.text();
      })
      .then((body) => setPresentation(withoutFrontmatter(body, t`Present interactive analysis`)))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : t`Skill unavailable`);
      });
    return () => controller.abort();
  }, [name, presentation]);
  useEffect(() => {
    if (name !== 'general' || agent) return;
    const controller = new AbortController();
    fetch(new URL('gallery-skills/standard-agent.md', window.location.href), {
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok || response.headers.get('content-type')?.includes('text/html'))
          throw new Error(`Standard agent unavailable (${response.status})`);
        return response.text();
      })
      .then((body) => setAgent(withoutFrontmatter(body, t`Standard agent`)))
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : t`Standard agent unavailable`);
      });
    return () => controller.abort();
  }, [name, agent]);
  const content =
    section === 'component'
      ? componentGuide(name ?? '')
      : section === 'schema'
        ? componentSchema(name ?? '')
        : section === 'agent'
          ? agent || loadError || t`Loading standard agent…`
          : section === 'catalogs'
            ? catalogGuide()
            : presentation || loadError || t`Loading skill…`;
  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      open={name !== null}
    >
      <DialogContent className="gallery-skill-dialog grid min-w-0 max-h-[min(820px,calc(100dvh-2rem))] w-[calc(100vw-2rem)] grid-rows-[auto_auto_minmax(0,1fr)] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {name === 'general' ? t`Agent guidance` : t`${ph({ name: name ?? '' })} contract`}
          </DialogTitle>
          <DialogDescription>
            {name === 'general'
              ? t`The standard agent's composed prompt, the ${agent} presentation skill, and component catalogs.`
              : t`Fields and validation for this component.`}
          </DialogDescription>
        </DialogHeader>
        <div
          aria-label={t`Skill sections`}
          className="gallery-tab-scroll flex gap-1 overflow-x-auto border-b pb-2"
          role="tablist"
        >
          {name !== 'general' ? (
            <button
              aria-selected={section === 'component'}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'component' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              onClick={() => setSection('component')}
              role="tab"
              type="button"
            >
              {t`This widget`}
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
              {t`Full schema`}
            </button>
          ) : null}
          {name === 'general' ? (
            <button
              aria-selected={section === 'agent'}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'agent' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              onClick={() => setSection('agent')}
              role="tab"
              type="button"
            >
              {t`Standard agent`}
            </button>
          ) : null}
          {name === 'general' ? (
            <button
              aria-selected={section === 'presentation'}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'presentation' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              onClick={() => setSection('presentation')}
              role="tab"
              type="button"
            >
              {t`Presentation skill`}
            </button>
          ) : null}
          {name === 'general' ? (
            <button
              aria-selected={section === 'catalogs'}
              className={`shrink-0 rounded-md px-3 py-1.5 text-xs ${section === 'catalogs' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              onClick={() => setSection('catalogs')}
              role="tab"
              type="button"
            >
              {t`Catalog skills`}
            </button>
          ) : null}
        </div>
        <ScrollArea className="gallery-skill-content min-h-0 min-w-0 pr-3">
          <Suspense fallback={<p className="text-sm text-muted-foreground">{t`Loading guide…`}</p>}>
            <MarkdownText mode="static">{content}</MarkdownText>
          </Suspense>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
