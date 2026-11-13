import { ZoomInIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { t } from '@lingui/core/macro';

/** Reuse zoom actions in both the inline and fullscreen chart toolbars. */
export function ChartZoomActions({
  active,
  selected,
  onZoom,
  onReset,
}: {
  active: boolean;
  selected: boolean;
  onZoom: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {selected ? (
        <Button
          aria-label={t`Zoom to selection`}
          onClick={onZoom}
          size="icon-sm"
          title={t`Zoom to selection`}
          variant="ghost"
        >
          <ZoomInIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
      {active ? (
        <Button
          aria-label={t`Reset zoom`}
          className="shrink-0"
          onClick={onReset}
          size="icon-sm"
          title={t`Reset zoom`}
          variant="ghost"
        >
          <RetryIcon aria-hidden="true" className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
