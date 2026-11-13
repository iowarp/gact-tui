import { ChevronRightIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { IconButton } from '@/components/clio/primitives/icon-button';
import { StateView } from '@/components/clio/primitives/state-view';
import { SettingsGroupLabel, SettingsRow } from '@/components/clio/settings-row';
import { SettingsScopeIcon } from '@/components/clio/settings-scope-icon';
import { Button } from '@/components/ui/button';
import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import {
  SettingsResultsContext,
  type SettingsResultBlock,
  type SettingsSearchResults,
} from '@/lib/settings-search-results';
import { cn } from '@/lib/utils';

/**
 * The filtered Settings window (Ctrl ? from the global search): every match,
 * grouped under its section's breadcrumb. Settings stay live in place; a list
 * or a section matched by name is one row that opens its section.
 */
export function SettingsResults({
  results,
  query,
  scopeLabels,
  renderSection,
  onOpen,
  onClear,
}: {
  results: SettingsSearchResults;
  query: string;
  scopeLabels: Record<string, string>;
  /** The section's page, of which only the matching rows show. */
  renderSection: (section: string) => ReactNode;
  onOpen: (section: string) => void;
  onClear: () => void;
}) {
  if (!results.blocks.length) {
    return (
      <StateView
        action={{ label: 'Show every section', onClick: onClear }}
        kind="empty"
        size="row"
        title={`No settings match \u201c${query.trim()}\u201d`}
      />
    );
  }
  return (
    <div
      className="[&>section:first-child>[data-slot=settings-group-label]]:mt-0"
      data-settings-results
    >
      {results.blocks.map((block) => (
        <ResultBlock
          block={block}
          key={block.section.id}
          onOpen={() => onOpen(block.section.id)}
          query={query}
          renderSection={renderSection}
          scopeLabel={scopeLabels[block.scope] ?? block.scope}
        />
      ))}
    </div>
  );
}

function ResultBlock({
  block,
  query,
  scopeLabel,
  renderSection,
  onOpen,
}: {
  block: SettingsResultBlock;
  query: string;
  scopeLabel: string;
  renderSection: (section: string) => ReactNode;
  onOpen: () => void;
}) {
  const { section, host, rows, lists, nameOnly } = block;
  const trail = [scopeLabel, host?.label, section.label].filter(Boolean).join(' \u203a ');
  // Rows shown as one line that opens the section: lists, a name match, and
  // settings this agent didn't render.
  const opener = (label: string) => (
    <SettingsRow inlineControl key={label} title={label}>
      <Button
        className="h-6 gap-1 px-1.5 text-label font-normal text-muted-foreground hover:text-foreground"
        onClick={onOpen}
        size="sm"
        variant="ghost"
      >
        Open section
        <ChevronRightIcon aria-hidden="true" className="size-3.5" />
      </Button>
    </SettingsRow>
  );
  const labels = new Set([
    ...rows.map((row) => row.label),
    ...lists.map((row) => row.label),
    ...(nameOnly ? [section.label] : []),
  ]);
  return (
    <section aria-label={trail}>
      <SettingsGroupLabel
        actions={
          <IconButton icon={<ChevronRightIcon />} label="Open section" onClick={onOpen} size="sm" />
        }
        className={cn('text-muted-foreground', SETTINGS_COLUMN)}
      >
        <span className="inline-flex min-w-0 items-center gap-2 align-middle">
          <SettingsScopeIcon className="size-[0.8125rem]" group={block.scope} />
          <span className="min-w-0 truncate">{trail}</span>
        </span>
      </SettingsGroupLabel>
      <SettingsResultsContext.Provider value={{ query, labels }}>
        {rows.length ? (
          <>
            <div className="clio-settings-filter" data-settings-filter>
              {renderSection(section.id)}
            </div>
            <div data-settings-fallback>{rows.map((row) => opener(row.label))}</div>
          </>
        ) : null}
        {lists.map((row) => opener(row.label))}
        {nameOnly ? opener(section.label) : null}
      </SettingsResultsContext.Provider>
    </section>
  );
}
