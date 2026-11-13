import type { AgentResolution } from '@clio/core/v3';
import { useQuery } from '@tanstack/react-query';
import { FileIcon } from 'lucide-react';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { DOCUMENT_MARKDOWN_CLASS_NAME, READ_TYPE_SCALE } from '@/lib/document-markdown';
import { splitFrontmatter } from '@/lib/frontmatter';
import { vocab } from '@/lib/brand-vocabulary';
import { formatBytes } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import type { PackageItem } from './agent-package-items';
import { ContentMarkdown } from './content-markdown';
import { ItemList, ItemRow } from './primitives/item-row';
import { KeyValueGrid } from './primitives/key-value-grid';
import { StateView } from './primitives/state-view';
import { serviceErrorDetail } from './service-error';
import { SettingsGroupLabel } from './settings-row';
import { CopyAction } from './tool-compact-row';
import { t, ph } from '@lingui/core/macro';

const { agent } = vocab;

type Subagent = AgentResolution['subagents'][number];

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/**
 * The viewers' type scale with one step between heading levels, so a narrow
 * pane still reads "Planning" above its sections (18 / 15 / 13 px).
 */
const PANE_HEADINGS = '[&_h2]:!text-h3 [&_h3]:!text-ui [&_h4]:!text-meta';

/** A readable document: Markdown at the viewers' type scale. */
function Reading({ children }: { children: string }) {
  return (
    <div className="min-w-0 rounded-md border bg-card px-3.5 py-3">
      <ContentMarkdown className={cn(DOCUMENT_MARKDOWN_CLASS_NAME, READ_TYPE_SCALE, PANE_HEADINGS)}>
        {children}
      </ContentMarkdown>
    </div>
  );
}

/** The subagent's own prompt, readable, as the server resolved it. */
export function SubagentPrompt({ row }: { row: Subagent }) {
  const prompt = text(row.prompt);
  return (
    <section aria-label={t`${ph({ id: row.id })} prompt`} className="grid min-w-0 gap-1.5">
      <SettingsGroupLabel
        className="mt-1"
        actions={prompt ? <CopyAction label={t`Copy prompt`} value={prompt} /> : undefined}
      >
        {t`Prompt`}
      </SettingsGroupLabel>
      {prompt ? (
        <Reading>{prompt}</Reading>
      ) : (
        <StateView
          kind={'prompt' in row ? 'empty' : 'unavailable'}
          size="row"
          title={
            'prompt' in row
              ? t`This subagent has no prompt of its own.`
              : t`This ${agent} doesn’t report subagent prompts.`
          }
        />
      )}
    </section>
  );
}

function label(key: string): string {
  const words = key.replace(/[-_]+/gu, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * A skill as the agent reads it: its SKILL.md front matter as facts, its
 * instructions as a document, and the other files in its folder. Reads the
 * same inspection the plugin explorer does, so opening its files is instant.
 */
export function SkillContent({
  item,
  reference,
  onBrowse,
}: {
  item: PackageItem;
  /** The package's catalog reference, `marketplace/id`. */
  reference?: string;
  /** Open the package's file explorer at this skill. */
  onBrowse: () => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const inspection = useQuery({
    queryKey: ['plugin-inspection', connectionScope(settings), reference, false, item.id],
    enabled: Boolean(reference),
    queryFn: ({ signal }) => repository.inspectPlugin(reference!, false, signal, item.id),
  });
  if (!reference)
    return (
      <StateView
        detail={t`${ph({ plugin: item.plugin })} isn’t installed from a catalog this ${agent} can read.`}
        kind="unavailable"
        size="row"
        title={t`The skill’s files aren’t available`}
      />
    );
  if (inspection.isPending)
    return <StateView kind="loading" size="row" title={t`Reading the skill`} />;
  if (inspection.error)
    return (
      <StateView
        action={{ label: t`Retry`, onClick: () => void inspection.refetch() }}
        detail={serviceErrorDetail(inspection.error.message)}
        kind="error"
        size="row"
        title={t`The skill couldn’t be read`}
      />
    );
  const files = inspection.data.files;
  const skillFile = files
    .filter((file) => /(^|\/)skill\.md$/iu.test(file.path))
    .sort((a, b) => a.path.length - b.path.length)[0];
  const document = skillFile && !skillFile.error ? splitFrontmatter(skillFile.text) : undefined;
  const facts = (document?.meta ?? []).filter(
    ([key, value]) => value && !(key === 'name' && value === item.id) && key !== 'description',
  );
  return (
    <>
      {facts.length ? (
        <KeyValueGrid
          aria-label={t`${ph({ id: item.id })} settings`}
          items={facts.map(([key, value]) => ({
            label: label(key),
            value,
            wrap: true,
          }))}
          variant="rows"
        />
      ) : null}
      <section aria-label={t`${ph({ id: item.id })} instructions`} className="grid min-w-0 gap-1.5">
        <SettingsGroupLabel
          className="mt-1"
          actions={
            skillFile?.text ? (
              <CopyAction label={t`Copy SKILL.md`} value={skillFile.text} />
            ) : undefined
          }
        >
          {t`Instructions`}
        </SettingsGroupLabel>
        {document?.body.trim() ? (
          <Reading>{document.body}</Reading>
        ) : (
          <StateView
            detail={skillFile?.error || inspection.data.reason || undefined}
            kind={skillFile ? 'empty' : 'unavailable'}
            size="row"
            title={skillFile ? t`SKILL.md has no instructions.` : t`This skill has no SKILL.md.`}
          />
        )}
        {skillFile?.truncated ? (
          <p className="text-meta text-muted-foreground">
            {t`Only the start of SKILL.md is shown; open its files for the rest.`}
          </p>
        ) : null}
      </section>
      {files.length || inspection.data.incomplete ? (
        <section aria-label={t`Files in ${ph({ id: item.id })}`} className="grid min-w-0 gap-1">
          <SettingsGroupLabel className="mt-1">{t`Files in this skill`}</SettingsGroupLabel>
          <ItemList label={t`Files in ${ph({ id: item.id })}`}>
            {files.map((file) => (
              <ItemRow
                aria-label={t`Open ${ph({ path: file.path })}`}
                className="cursor-pointer"
                icon={<FileIcon />}
                key={file.path}
                meta={file.error || formatBytes(file.bytes)}
                onClick={onBrowse}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  onBrowse();
                }}
                role="button"
                size="line"
                tabIndex={0}
                title={<span className="font-mono">{file.path}</span>}
              />
            ))}
          </ItemList>
          {inspection.data.incomplete ? (
            <p className="text-meta text-muted-foreground">
              {inspection.data.reason || t`Some files are too large to list here.`}
            </p>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
