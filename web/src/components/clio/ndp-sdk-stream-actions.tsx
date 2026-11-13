import { Button } from '@/components/ui/button';
import type { NDPRecord } from './ndp-endpoint-data';
import { t } from '@lingui/core/macro';

/** Controls manage CLIO's SDK reader, leaving the independent source producer running. */
export function NDPSdkStreamActions({
  row,
  action,
}: {
  row: NDPRecord;
  action: (id: string, title: string, parameters?: NDPRecord) => void;
}) {
  const stopped = row.state === 'stopped';
  return (
    <div className="flex shrink-0 gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={stopped}
        onClick={() =>
          // i18n-ignore: NDP operation id
          action('SDK streaming_v2.read', t`Capture stream records`, {
            stream_id: String(row.id),
            cursor: String(row.cursor),
          })
        }
      >
        {t`Capture`}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          action(
            stopped ? 'SDK streaming_v2.resume' : 'SDK streaming_v2.stop', // i18n-ignore: NDP operation ids
            stopped ? t`Resume reader` : t`Stop reader`,
            { stream_id: String(row.id) },
          )
        }
      >
        {stopped ? t`Resume` : t`Stop`}
      </Button>
    </div>
  );
}
