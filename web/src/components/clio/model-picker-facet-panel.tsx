import { SearchIcon } from 'lucide-react';
import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  filterFacetGroups,
  mainFacetGroups,
  type FacetChip,
  type FacetTab,
  type FacetTabId,
} from '@/lib/model-facets';
import { FacetChipCluster } from './model-picker-facet-chips';

/** A tab with more chips than this gets its own "Filter … by name" field. */
const NAME_FILTER_THRESHOLD = 6;

interface ModelPickerFacetPanelProps {
  tabs: readonly FacetTab[];
  onToggleChip: (chip: FacetChip) => void;
}

/**
 * Keeps real focus in the picker's search field while the panel is used with
 * a pointer, so typing after a chip press still searches. The name-filter
 * field is the one control here that takes focus on purpose.
 */
function keepSearchFocus(event: MouseEvent<HTMLDivElement>): void {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
}

/** The name-filter field's keys stay in it: the list behind the panel must not move. */
function containKeys(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== 'Escape') event.stopPropagation();
}

/**
 * The model picker's filter panel, opened under the search field: a Main tab
 * with each group's leading chips (and "+N" into the group's own tab), then
 * one tab per group -- Tasks (grouped the way Hugging Face groups them),
 * Input, Output, Capabilities, Providers, Other. Every chip comes from the
 * catalog's own tags and toggles its token in the search bar.
 */
export function ModelPickerFacetPanel({ tabs, onToggleChip }: ModelPickerFacetPanelProps) {
  const [tab, setTab] = useState<'main' | FacetTabId>('main');
  const [nameFilter, setNameFilter] = useState('');
  const main = mainFacetGroups(tabs);

  function openTab(next: string): void {
    setTab(next as 'main' | FacetTabId);
    setNameFilter('');
  }

  return (
    <div
      aria-label="Filter models"
      className="absolute inset-x-0 top-full z-30 mt-1 flex h-[min(28rem,60dvh)] flex-col overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-lg"
      data-slot="facet-panel"
      onMouseDown={keepSearchFocus}
      role="region"
    >
      <Tabs className="min-h-0 flex-1 gap-0" onValueChange={openTab} value={tab}>
        <div className="shrink-0 overflow-x-auto border-b px-2 pt-2 pb-1.5">
          <TabsList className="h-8" variant="line">
            <TabsTrigger value="main">Main</TabsTrigger>
            {tabs.map((item) => (
              <TabsTrigger key={item.id} value={item.id}>
                {item.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent className="flex flex-col gap-4 p-3" value="main">
            {main.length ? (
              main.map((group) => (
                <section className="flex flex-col gap-2" data-group={group.id} key={`${group.tab}/${group.id}`}>
                  <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
                  <FacetChipCluster
                    chips={group.chips}
                    more={group.more}
                    moreLabel={group.label}
                    onMore={() => openTab(group.tab)}
                    onToggle={onToggleChip}
                  />
                </section>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No model matches this search.</p>
            )}
          </TabsContent>
          {tabs.map((item) => {
            const groups = filterFacetGroups(item.groups, tab === item.id ? nameFilter : '');
            return (
              <TabsContent className="flex flex-col gap-4 p-3" key={item.id} value={item.id}>
                {item.chipCount > NAME_FILTER_THRESHOLD ? (
                  <InputGroup className="h-8">
                    <InputGroupAddon>
                      <SearchIcon aria-hidden="true" />
                    </InputGroupAddon>
                    <InputGroupInput
                      aria-label={`Filter ${item.label} by name`}
                      onChange={(event) => setNameFilter(event.target.value)}
                      onKeyDown={containKeys}
                      placeholder={`Filter ${item.label} by name`}
                      value={nameFilter}
                    />
                  </InputGroup>
                ) : null}
                {groups.length ? (
                  groups.map((group) => (
                    <section className="flex flex-col gap-2" data-group={group.id} key={group.id}>
                      <h3 className="text-xs font-medium text-muted-foreground">{group.label}</h3>
                      <FacetChipCluster chips={group.chips} onToggle={onToggleChip} />
                    </section>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {nameFilter ? `No ${item.label.toLowerCase()} match "${nameFilter}".` : `No ${item.label.toLowerCase()} in the listed models.`}
                  </p>
                )}
              </TabsContent>
            );
          })}
        </ScrollArea>
      </Tabs>
    </div>
  );
}
