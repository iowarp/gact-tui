import type { SystemVersionStatus } from './version-check-issue';
import { NoticeFrame } from './attention-notice-frame';
import { ListRow } from './primitives/list-row';
import { ProductUpdateIcon } from './product-update-summary';
import { attentionUpdate } from './version-check-issue';
import { t } from '@lingui/core/macro';

export function AttentionUpdateRows({ versions }: { versions: SystemVersionStatus }) {
  const { updateReady, checkIssue } = attentionUpdate(versions);
  return (
    <>
      {updateReady ? (
        <NoticeFrame
          className="min-h-[46px] rounded-[6px] px-2 py-1.5"
          data-slot="attention-update"
          subject="the update notice"
        >
          {(expanded) => (
            <ListRow
              description={versions.message}
              expanded={expanded}
              hoverText={{ description: versions.message }}
              icon={<ProductUpdateIcon state={versions.state} />}
              primaryAction={
                versions.desktopShell ? (
                  <button
                    className="hover:underline disabled:opacity-50"
                    disabled={versions.updating}
                    onClick={() => versions.updateAll()}
                    type="button"
                  >
                    {t`Update`}
                  </button>
                ) : undefined
              }
              title={<span className="font-semibold text-foreground">{t`Update ready`}</span>}
              variant="notice"
            />
          )}
        </NoticeFrame>
      ) : null}
      {checkIssue ? (
        <NoticeFrame
          className="min-h-[46px] rounded-[6px] px-2 py-1.5"
          data-slot="attention-update-issue"
          subject="the update check notice"
        >
          {(expanded) => (
            <ListRow
              description={checkIssue}
              expanded={expanded}
              hoverText={{ description: checkIssue }}
              icon={<ProductUpdateIcon state="unavailable" />}
              title={
                <span className="font-semibold text-foreground">{t`Couldn't check for updates`}</span>
              }
              variant="notice"
            />
          )}
        </NoticeFrame>
      ) : null}
    </>
  );
}
