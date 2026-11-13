import type { Artifact } from '@clio/core/v3';
import { useMemo, useState, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ARTIFACT_CATEGORIES,
  artifactCategory,
  filterArtifacts,
  type ArtifactCategory,
} from '@/lib/artifact-categories';
import { plural, t, ph } from '@lingui/core/macro';

/** Shared controls for long output lists, preserving each surface's card/open behavior. */
export function ArtifactFilters({
  artifacts,
  children,
}: {
  artifacts: readonly Artifact[];
  children: (visible: readonly Artifact[]) => ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<ArtifactCategory | 'all'>('all');
  const counts = useMemo(() => {
    const result = new Map<ArtifactCategory, number>();
    for (const artifact of artifacts) {
      const kind = artifactCategory(artifact);
      result.set(kind, (result.get(kind) ?? 0) + 1);
    }
    return result;
  }, [artifacts]);
  const visible = useMemo(
    () => filterArtifacts(artifacts, query, category),
    [artifacts, query, category],
  );
  const filtered = Boolean(query.trim() || category !== 'all');
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
      {artifacts.length > 1 || filtered ? (
        <>
          <div className="flex min-w-0 flex-wrap gap-2">
            <Input
              aria-label={t`Search artifacts`}
              className="min-w-28 flex-1"
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t`Search artifacts`}
              type="search"
              value={query}
            />
            <Select
              value={category}
              onValueChange={(value) => setCategory(value as ArtifactCategory | 'all')}
            >
              <SelectTrigger aria-label={t`Artifact category`} className="max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t`All types (${ph({ count: artifacts.length })})`}</SelectItem>
                {ARTIFACT_CATEGORIES.filter(
                  (item) => counts.has(item.value) || item.value === category,
                ).map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label} ({counts.get(item.value) ?? 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span aria-live="polite">
              {plural(artifacts.length, {
                one: `${ph({ visible: visible.length })} of # artifact`,
                other: `${ph({ visible: visible.length })} of # artifacts`,
              })}
            </span>
            {filtered ? (
              <Button
                onClick={() => {
                  setQuery('');
                  setCategory('all');
                }}
                size="xs"
                variant="ghost"
              >
                {t`Clear filters`}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
      {filtered && !visible.length ? (
        <p className="py-3 text-sm text-muted-foreground">{t`No artifacts match these filters.`}</p>
      ) : (
        children(visible)
      )}
    </div>
  );
}
