import { useEffect, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { RefreshButton } from './refresh-button';
import { CircleAlertIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { connectionScope } from '@/lib/connection-scope';
import { SourceField, SourceStatusLine, sourceInputClass } from './source-form-parts';

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
    'h-[30px] w-full min-w-0 rounded-[7px] border border-input bg-transparent px-2 text-menu disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30';
  return (
    <div className="flex flex-col gap-[5px]">
      <SourceField label="Revision" htmlFor={`${formId}-revision-kind`}>
        <div className="grid min-w-0 grid-cols-[30%_minmax(0,1fr)] gap-1.5">
          <select
            id={`${formId}-revision-kind`}
            aria-label="Revision kind"
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
          <select
            id={`${formId}-revision`}
            aria-label={label}
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
                {kind === 'commit' ? `${row.sha.slice(0, 7)} ${row.label}` : row.label}
              </option>
            ))}
            {kind === 'commit' && <option value="__manual__">Enter a commit ID…</option>}
          </select>
        </div>
      </SourceField>
      {manual && (
        <SourceField label="Commit ID" htmlFor={`${formId}-commit`}>
          <Input
            id={`${formId}-commit`}
            className={sourceInputClass}
            form={formId}
            value={value}
            required
            pattern="[a-fA-F0-9]{7,40}"
            maxLength={40}
            placeholder="Paste the commit ID"
            onChange={(event) => onChange(event.target.value.trim())}
          />
        </SourceField>
      )}
      {!repoUrl && (
        <p className="text-caption text-faint">
          Enter a GitHub repository to choose its branch, tag, or commit.
        </p>
      )}
      {ready && choices.length === 0 && (
        <p className="text-caption text-faint">
          No {kind === 'branch' ? 'branches' : `${kind}s`} found.
        </p>
      )}
      {revisions.error && (
        <SourceStatusLine
          role="alert"
          tone="error"
          icon={<CircleAlertIcon />}
          actions={
            <RefreshButton
              label="Try again"
              refreshing={revisions.isFetching}
              type="button"
              size="sm"
              variant="ghost"
              onRefresh={() => revisions.refetch()}
            >
              Try again
            </RefreshButton>
          }
        >
          {revisions.error.message}
        </SourceStatusLine>
      )}
      {revisions.hasNextPage && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="self-start"
          disabled={revisions.isFetchingNextPage}
          onClick={() => void revisions.fetchNextPage()}
        >
          {revisions.isFetchingNextPage
            ? 'Loading…'
            : `Load more ${kind === 'branch' ? 'branches' : `${kind}s`}`}
        </Button>
      )}
      {ready && kind !== 'branch' && (
        <p className="text-caption text-faint">
          Tags and commits pin a version. Choose a branch to publish edits.
        </p>
      )}
    </div>
  );
}
