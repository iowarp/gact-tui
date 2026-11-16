import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { TransportError, type LocalPublishResult } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ExternalLink } from '@/components/ui/external-link';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { vocab } from '@/lib/brand-vocabulary';
import { useConnectionSettings } from '@/providers/connection-provider';
import { ConnectedAccountSignIn } from './connected-source-auth';
import { plural, ph, t } from '@lingui/core/macro';

/** What the person can do after a refused publication, by its typed reason. */
interface Refusal {
  code: string;
  message: string;
  accountUrl?: string;
}

function refusal(error: unknown): Refusal {
  if (error instanceof TransportError) {
    const details = (error.details ?? {}) as { account_url?: unknown };
    return {
      code: error.code ?? '',
      message: error.message,
      accountUrl: typeof details.account_url === 'string' ? details.account_url : undefined,
    };
  }
  return { code: '', message: error instanceof Error ? error.message : t`Try again` };
}

/**
 * Publish the private collection to the person's GitHub repository in one commit,
 * with their own CLIO GitHub sign-in. The manual ZIP stays available beside it.
 */
export function GitHubPublish({ hasLocalItems }: { hasLocalItems: boolean }) {
  const repository = useRepository();
  const client = useQueryClient();
  const { settings } = useConnectionSettings();
  const inputId = useId();
  const key = queryKeys.key(
    'agents',
    settings.endpoint,
    'local-publish',
    connectionScope(settings),
  );
  const status = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.localPublishStatus(signal),
    retry: false,
  });
  const [typed, setTyped] = useState<string>();
  const [signingIn, setSigningIn] = useState(false);
  const [published, setPublished] = useState<LocalPublishResult>();
  const last = status.data?.last;
  // What the person typed, otherwise the repository they last published to.
  const target = typed ?? last?.repository ?? '';
  const publish = useMutation({
    mutationFn: (allowPublic: boolean) =>
      repository.publishLocalMarketplace(target.trim(), allowPublic),
    onSuccess: async (result) => {
      setPublished(result);
      await client.invalidateQueries({ queryKey: key });
    },
  });
  const refused = publish.error ? refusal(publish.error) : undefined;

  if (status.isPending) return <p role="status">{t`Checking your GitHub sign-in…`}</p>;
  if (status.isError || !status.data)
    return (
      <div className="grid justify-items-start gap-2">
        <p role="alert" className="text-muted-foreground">
          {t`Publishing isn’t available from this host.`}
        </p>
        <Button size="sm" variant="outline" onClick={() => void status.refetch()}>
          {t`Retry`}
        </Button>
      </div>
    );
  const github = status.data.github;

  if (!github.signed_in || signingIn || refused?.code === 'github_sign_in_expired')
    return (
      <section aria-label={t`Publish to GitHub`} className="grid gap-2">
        <p className="leading-5">
          {t`Sign in to GitHub to publish your plugins and agents to a repository with one click.`}
        </p>
        <ConnectedAccountSignIn
          appUrl={github.account_url}
          provider="github"
          purpose="publish"
          onComplete={() => {
            setSigningIn(false);
            publish.reset();
            void status.refetch();
          }}
        />
      </section>
    );

  return (
    <section aria-label={t`Publish to GitHub`} className="grid gap-3">
      <p className="leading-5 text-muted-foreground">
        {github.account_name
          ? t`Signed in to GitHub as ${ph({ account: github.account_name })}.`
          : t`Signed in to GitHub.`}{' '}
        <button
          className="underline underline-offset-4"
          type="button"
          onClick={() => setSigningIn(true)}
        >
          {t`Use another account`}
        </button>
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor={inputId}>{t`Repository`}</Label>
        <div className="flex gap-2">
          <Input
            id={inputId}
            placeholder="owner/plugins-backup"
            value={target}
            onChange={(event) => {
              setTyped(event.target.value);
              setPublished(undefined);
              publish.reset();
            }}
          />
          <Button
            disabled={!hasLocalItems || !target.trim() || publish.isPending}
            onClick={() => publish.mutate(false)}
          >
            {publish.isPending ? t`Publishing…` : t`Publish`}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t`An existing repository, ideally private. Its other files are left as they are.`}{' '}
          <ExternalLink className="underline underline-offset-4" href="https://github.com/new">
            {t`Create GitHub repository`}
          </ExternalLink>
        </p>
      </div>
      {last && !published && !refused ? (
        <p className="text-xs text-muted-foreground">
          {status.data.changed_since
            ? t`Changed since you last published to ${ph({ repository: last.repository })}.`
            : t`Up to date with ${ph({ repository: last.repository })}.`}
        </p>
      ) : null}
      {published ? <Published result={published} /> : null}
      {refused ? (
        <PublishRefused
          refusal={refused}
          onPublishPublic={() => publish.mutate(true)}
          pending={publish.isPending}
        />
      ) : null}
    </section>
  );
}

function Published({ result }: { result: LocalPublishResult }) {
  const changes = result.written.length + result.removed.length;
  return (
    <div role="status" className="grid gap-1 rounded-md border p-3">
      <p className="font-medium">
        {result.up_to_date
          ? t`${ph({ repository: result.repository })} already matches this host.`
          : plural(changes, {
              one: `Published # change to ${ph({ repository: result.repository })}.`,
              other: `Published # changes to ${ph({ repository: result.repository })}.`,
            })}
      </p>
      {result.commit_url ? (
        <ExternalLink className="text-xs underline underline-offset-4" href={result.commit_url}>
          {t`View the commit on GitHub`}
        </ExternalLink>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {t`To use these on another host, add ${ph({ url: result.url })} from Marketplaces there.`}
      </p>
    </div>
  );
}

function PublishRefused({
  refusal: { code, message, accountUrl },
  onPublishPublic,
  pending,
}: {
  refusal: Refusal;
  onPublishPublic: () => void;
  pending: boolean;
}) {
  return (
    <div role="alert" className="grid justify-items-start gap-2 rounded-md border p-3">
      <p>{message}</p>
      {code === 'repository_public' ? (
        <Button size="sm" variant="outline" disabled={pending} onClick={onPublishPublic}>
          {t`Publish to the public repository`}
        </Button>
      ) : null}
      {code === 'repository_not_reachable' && accountUrl ? (
        <ExternalLink className="text-xs underline underline-offset-4" href={accountUrl}>
          {t`Give the ${ph({ agent: vocab.agent })} GitHub app access to the repository`}
        </ExternalLink>
      ) : null}
    </div>
  );
}
