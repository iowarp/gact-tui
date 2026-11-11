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

const kindNames: Record<string, string> = { add: 'Added', modify: 'Changed', delete: 'Deleted' };

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
    <section className="flex min-w-0 flex-col gap-[5px]" aria-label="Review source changes">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
        Edits to publish
        <InfoTip label="About reviewed updates">
          Update only the files you select. {vocab.agent} checks for changes to the originals first.
          If an update fails, some files may already have been saved.
        </InfoTip>
      </div>
      {review.changes.length === 0 ? (
        <p className="text-[12px] text-faint">No unpublished edits.</p>
      ) : (
        <div className="-mx-2 max-h-60 overflow-y-auto">
          {review.changes.map((change) => (
            <div key={change.path} className="min-w-0">
              <label className="flex min-h-[30px] min-w-0 items-center gap-[9px] rounded-[6px] px-2 text-[12.5px] whitespace-nowrap hover:bg-hover">
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
                <span className="min-w-0 flex-1 truncate font-mono text-[12px]" title={change.path}>
                  {change.path}
                </span>
                <Tag
                  width="auto"
                  tone={change.conflict || change.kind === 'delete' ? 'off' : 'neutral'}
                >
                  {change.conflict ? 'Original changed' : (kindNames[change.kind] ?? change.kind)}
                </Tag>
              </label>
              {change.preview || change.preview_note ? (
                <details className="group mb-1 ml-[31px] text-[11.5px]">
                  <summary className="flex h-6 cursor-pointer list-none items-center gap-1 text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronRightIcon
                      aria-hidden="true"
                      className="size-3 transition-transform group-open:rotate-90 motion-reduce:transition-none"
                    />
                    Inspect changes
                  </summary>
                  {change.preview && (
                    <pre className="mt-1 max-h-52 overflow-auto rounded-[6px] bg-muted/40 p-2 font-mono text-[11px] leading-[1.5]">
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

const quiet = 'h-6 px-2 text-[12px]';

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
        question="Discard all unpublished edits? The originals stay unchanged."
        action="Discard edits"
        busyAction="Discarding…"
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
              Discard
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={quiet}
              disabled={disabled}
              onClick={onReview}
            >
              Review and publish
            </Button>
          </>
        ) : undefined
      }
    >
      <span
        title={`Edits stay in ${vocab.agent} until you publish them.${source.provider === 'github' ? ' Selected edits are published together in one commit.' : ''}`}
      >
        {source.pending_edits
          ? `${source.pending_edits} unpublished ${source.pending_edits === 1 ? 'edit' : 'edits'}`
          : 'No unpublished edits'}
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
        ? `Published ${count} ${count === 1 ? 'file' : 'files'} to the originals.`
        : publication.state === 'running'
          ? 'Publishing selected edits…'
          : `Publication ${publication.state}. ${count} files were published. ${publication.error ?? ''}`}
    </SourceStatusLine>
  );
}
