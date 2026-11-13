import type { ConnectedSourceState, SourceOperation, SourceReview } from '@clio/core/v3';
import { CheckIcon, ChevronRightIcon, CircleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { vocab } from '@/lib/brand-vocabulary';
import { EditIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { RingSpinner } from './primitives/ring-spinner';
import { RowConfirm } from './primitives/row-confirm';
import { SourceStatusLine } from './source-form-parts';
import { Tag } from './primitives/tag';
import { InfoTip } from './info-tip';
import { ph, plural, t } from '@lingui/core/macro';

const { agent } = vocab;

const kindNames: Record<string, string> = {
  add: t`Added`,
  modify: t`Changed`,
  delete: t`Deleted`,
};

/**
 * Unpublished edits before they reach the originals: one row per file with its
 * checkbox, what changed, and the diff behind a disclosure. Publishing and
 * closing are the frame's footer.
 */
export function SourceReviewPanel({
  review,
  selected,
  disabled,
  onSelected,
}: {
  review: SourceReview;
  selected: string[];
  disabled: boolean;
  onSelected: (paths: string[]) => void;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-[5px]" aria-label={t`Review source changes`}>
      <div className="flex items-center gap-1.5 text-label text-muted-foreground">
        {t`Edits to publish`}
        <InfoTip label={t`About reviewed updates`}>
          {t`Update only the files you select. ${agent} checks for changes to the originals first. If an update fails, some files may already have been saved.`}
        </InfoTip>
      </div>
      {review.changes.length === 0 ? (
        <p className="text-meta text-faint">{t`No unpublished edits.`}</p>
      ) : (
        <div className="-mx-2 max-h-60 overflow-y-auto">
          {review.changes.map((change) => (
            <div key={change.path} className="min-w-0">
              <label className="flex min-h-[30px] min-w-0 items-center gap-[9px] rounded-[6px] px-2 text-menu whitespace-nowrap hover:bg-hover">
                <input
                  type="checkbox"
                  className="size-3.5 shrink-0 accent-primary"
                  disabled={change.conflict || disabled}
                  checked={selected.includes(change.path)}
                  onChange={(event) =>
                    onSelected(
                      event.target.checked
                        ? [...selected, change.path]
                        : selected.filter((path) => path !== change.path),
                    )
                  }
                />
                <span className="min-w-0 flex-1 truncate font-mono text-meta" title={change.path}>
                  {change.path}
                </span>
                <Tag
                  width="auto"
                  tone={change.conflict || change.kind === 'delete' ? 'off' : 'neutral'}
                >
                  {change.conflict ? t`Original changed` : (kindNames[change.kind] ?? change.kind)}
                </Tag>
              </label>
              {change.preview || change.preview_note ? (
                <details className="group mb-1 ml-[31px] text-label">
                  <summary className="flex h-6 cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                    {t`Inspect changes`}
                  </summary>
                  {change.preview && (
                    <pre className="mt-1 max-h-52 overflow-auto rounded-[6px] bg-muted/40 p-2 font-mono text-caption leading-normal">
                      {change.preview.split('\n').map((line, index) => (
                        <span
                          key={index}
                          className={
                            line.startsWith('+') && !line.startsWith('+++')
                              ? 'block text-success'
                              : line.startsWith('-') && !line.startsWith('---')
                                ? 'block text-destructive'
                                : 'block text-muted-foreground'
                          }
                        >
                          {line || ' '}
                        </span>
                      ))}
                    </pre>
                  )}
                  {change.preview_note && <p className="mt-1 text-faint">{change.preview_note}</p>}
                </details>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

const quiet = 'h-6 px-2 text-meta';

/** A publish-later link's edits waiting in the workspace: Discard, or Review and publish. */
export function SourceUnpublishedEdits({
  source,
  reviewing,
  disabled,
  onDiscard,
  onReview,
}: {
  source: ConnectedSourceState;
  reviewing: boolean;
  disabled: boolean;
  onDiscard: () => Promise<unknown>;
  onReview: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  if (confirmDiscard)
    return (
      <RowConfirm
        question={t`Discard all unpublished edits? The originals stay unchanged.`}
        action={t`Discard edits`}
        busyAction={t`Discarding…`}
        onKeep={() => setConfirmDiscard(false)}
        onConfirm={async () => {
          await onDiscard();
          setConfirmDiscard(false);
        }}
      />
    );
  return (
    <SourceStatusLine
      tone={source.pending_edits ? 'warning' : 'quiet'}
      icon={<EditIcon />}
      actions={
        source.pending_edits && !reviewing ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={quiet}
              disabled={disabled}
              onClick={() => setConfirmDiscard(true)}
            >
              {t`Discard`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={quiet}
              disabled={disabled}
              onClick={onReview}
            >
              {t`Review and publish`}
            </Button>
          </>
        ) : undefined
      }
    >
      <span
        title={
          source.provider === 'github'
            ? t`Edits stay in ${agent} until you publish them. Selected edits are published together in one commit.`
            : t`Edits stay in ${agent} until you publish them.`
        }
      >
        {source.pending_edits
          ? plural(source.pending_edits, {
              one: '# unpublished edit',
              other: '# unpublished edits',
            })
          : t`No unpublished edits`}
      </span>
    </SourceStatusLine>
  );
}

/** The latest publication: running, how many files reached the originals, or why it stopped. */
export function SourcePublicationStatus({ publication }: { publication: SourceOperation }) {
  const count = publication.applied_paths.length;
  return (
    <SourceStatusLine
      role="status"
      tone={
        publication.state === 'completed'
          ? 'ok'
          : publication.state === 'running'
            ? 'default'
            : 'error'
      }
      icon={
        publication.state === 'completed' ? (
          <CheckIcon />
        ) : publication.state === 'running' ? (
          <RingSpinner />
        ) : (
          <CircleAlertIcon />
        )
      }
    >
      {publication.state === 'completed'
        ? plural(count, {
            one: 'Published # file to the originals.',
            other: 'Published # files to the originals.',
          })
        : publication.state === 'running'
          ? t`Publishing selected edits…`
          : t`Publication ${ph({ state: publication.state })}. ${plural(count, {
              one: '# file was published.',
              other: '# files were published.',
            })} ${ph({ error: publication.error ?? '' })}`}
    </SourceStatusLine>
  );
}
