import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshButton } from './refresh-button';
import { ConnectField, ConnectInput } from './connect-frame';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';

type RevisionKind = 'branch' | 'tag' | 'commit';

/** Discover revisions through the connected CLIO's account and bounded request cache. */
export function GitHubRevisionPicker({
  root,
  value,
  onChange,
  formId,
  disabled = false,
  onValidityChange,
}: {
  root: string;
  value: string;
  onChange: (value: string) => void;
  formId: string;
  disabled?: boolean;
  onValidityChange: (valid: boolean) => void;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [kind, setKind] = useState<RevisionKind>(
    value.startsWith('refs/tags/')
      ? 'tag'
      : /^[a-fA-F0-9]{7,40}$/.test(value)
        ? 'commit'
        : 'branch',
  );
  const [manual, setManual] = useState(false);
  const [settled, setSettled] = useState('');
  const match = root
    .trim()
    .match(/^https:\/\/github\.com\/([\w.-]+)\/([\w.-]+)(?:\/tree\/[^?#]+)?\/?$/);
  const repoUrl = match ? `https://github.com/${match[1]}/${match[2].replace(/\.git$/, '')}` : '';
  useEffect(() => {
    const timer = setTimeout(() => setSettled(repoUrl), 500);
    return () => clearTimeout(timer);
  }, [repoUrl]);
  const revisions = useInfiniteQuery({
    queryKey: ['connected-storage', connectionScope(settings), 'github-revisions', repoUrl, kind],
    queryFn: ({ pageParam, signal }) =>
      repository.githubRevisions(repoUrl, kind, pageParam, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => last.next_page ?? undefined,
    enabled: Boolean(repoUrl && settled === repoUrl && !disabled),
    staleTime: 300_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const data = settled === repoUrl ? revisions.data : undefined;
  const choices = [
    ...new Map(
      data?.pages.flatMap((page) => page.revisions).map((row) => [row.value, row]) ?? [],
    ).values(),
  ];
  const ready = Boolean(data && repoUrl && !disabled);
  const valid =
    disabled ||
    (ready && (kind === 'branch' || (manual ? /^[a-fA-F0-9]{7,40}$/.test(value) : Boolean(value))));
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);
  const fromLink = root.match(/\/tree\/([^/]+)/)?.[1];
  const label = kind === 'branch' ? 'Branch' : kind === 'tag' ? 'Tag' : 'Commit';
  const selection = kind === 'tag' && value.startsWith('refs/tags/') ? value.slice(10) : value;
  const selectClass =
    'h-[30px] w-full min-w-0 rounded-[7px] border border-input bg-transparent px-2 text-[12.5px] text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-sidebar';
  return (
    <div className="space-y-2">
      <div className="grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-2.5">
        <ConnectField htmlFor={`${formId}-revision-kind`} label="Revision">
          <select
            id={`${formId}-revision-kind`}
            className={selectClass}
            value={kind}
            disabled={!repoUrl || settled !== repoUrl || disabled}
            onChange={(event) => {
              setKind(event.target.value as RevisionKind);
              setManual(false);
              onChange('');
            }}
          >
            <option value="branch">Branch</option>
            <option value="tag">Tag</option>
            <option value="commit">Commit</option>
          </select>
        </ConnectField>
        <ConnectField htmlFor={`${formId}-revision`} label={label}>
          <select
            id={`${formId}-revision`}
            form={formId}
            className={selectClass}
            value={manual ? '__manual__' : selection}
            disabled={!ready}
            required={kind !== 'branch'}
            onChange={(event) => {
              const next = event.target.value;
              setManual(next === '__manual__');
              onChange(
                next === '__manual__' ? '' : kind === 'tag' && next ? `refs/tags/${next}` : next,
              );
            }}
          >
            <option value="">
              {!repoUrl
                ? 'Enter a repository first'
                : !ready
                  ? revisions.error
                    ? 'Unable to load revisions'
                    : 'Loading revisions…'
                  : kind === 'branch'
                    ? fromLink
                      ? `From link: ${fromLink}`
                      : `Default: ${data?.pages[0].default_branch || 'no branch yet'}`
                    : `Choose a ${kind}`}
            </option>
            {selection && !choices.some((row) => row.value === selection) && !manual && (
              <option value={selection}>{selection}</option>
            )}
            {choices.map((row) => (
              <option key={row.value} value={row.value}>
                {kind === 'commit' ? `${row.sha.slice(0, 7)} — ${row.label}` : row.label}
              </option>
            ))}
            {kind === 'commit' && <option value="__manual__">Enter a commit ID…</option>}
          </select>
        </ConnectField>
      </div>
      {manual && (
        <ConnectField htmlFor={`${formId}-commit`} label="Commit ID">
          <ConnectInput
            mono
            id={`${formId}-commit`}
            form={formId}
            value={value}
            required
            pattern="[a-fA-F0-9]{7,40}"
            maxLength={40}
            placeholder="Paste the commit ID"
            onChange={(event) => onChange(event.target.value.trim())}
          />
        </ConnectField>
      )}
      {!repoUrl && (
        <p className="text-xs text-muted-foreground">
          Enter a GitHub repository to choose its branch, tag, or commit.
        </p>
      )}
      {ready && choices.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No {kind === 'branch' ? 'branches' : `${kind}s`} found.
        </p>
      )}
      {revisions.error && (
        <div role="alert" className="space-y-1 text-xs text-destructive">
          <p>{revisions.error.message}</p>
          <RefreshButton
            label="Try again"
            refreshing={revisions.isFetching}
            type="button"
            size="sm"
            variant="outline"
            onRefresh={() => revisions.refetch()}
          >
            Try again
          </RefreshButton>
        </div>
      )}
      {revisions.hasNextPage && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={revisions.isFetchingNextPage}
          onClick={() => void revisions.fetchNextPage()}
        >
          {revisions.isFetchingNextPage
            ? 'Loading…'
            : `Load more ${kind === 'branch' ? 'branches' : `${kind}s`}`}
        </Button>
      )}
      {ready && kind !== 'branch' && (
        <p className="text-xs text-muted-foreground">
          Tags and commits pin a version. Choose a branch to publish edits.
        </p>
      )}
    </div>
  );
}
