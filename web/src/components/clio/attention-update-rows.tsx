import type { SystemVersionStatus } from './version-check-issue';
import { ListRow } from './primitives/list-row';
import { ProductUpdateIcon } from './product-update-summary';
import { attentionUpdate } from './version-check-issue';

export function AttentionUpdateRows({ versions }: { versions: SystemVersionStatus }) {
  const { updateReady, checkIssue } = attentionUpdate(versions);
  return (
    <>
      {updateReady ? (
        <div className="min-h-[46px] rounded-[6px] px-2 py-1.5" data-slot="attention-update">
          <ListRow
            description={versions.message}
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
                  Update
                </button>
              ) : undefined
            }
            title={<span className="font-semibold text-foreground">Update ready</span>}
            variant="notice"
          />
        </div>
      ) : null}
      {checkIssue ? (
        <div className="min-h-[46px] rounded-[6px] px-2 py-1.5" data-slot="attention-update-issue">
          <ListRow
            description={checkIssue}
            hoverText={{ description: checkIssue }}
            icon={<ProductUpdateIcon state="unavailable" />}
            title={
              <span className="font-semibold text-foreground">Couldn't check for updates</span>
            }
            variant="notice"
          />
        </div>
      ) : null}
    </>
  );
}
