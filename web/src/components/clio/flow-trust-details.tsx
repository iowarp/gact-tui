import { FileCodeIcon, ShieldAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { fileName, flowTrustAuthor, type FlowTrustRequest } from '@/lib/plugin-review';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { PluginReviewDialog } from './plugin-review-dialog';

/**
 * The compact facts of a flow-trust permission, under its "Running flow …"
 * title, in the card's facts rows: who wrote the plugin, and its file, which
 * opens the plugin's review.
 */
export function FlowTrustDetails({ request }: { request: FlowTrustRequest }) {
  const [open, setOpen] = useState(false);
  const file = fileName(request.file);
  const items: KeyValueItem[] = [
    {
      label: 'Trust',
      icon: <ShieldAlertIcon />,
      value: `${flowTrustAuthor(request)}, not trusted yet`,
    },
  ];
  if (request.reviewUrl) {
    items.push({
      label: 'Flow',
      icon: <FileCodeIcon />,
      mono: true,
      title: request.file
        ? `Review ${request.file} and its plugin`
        : `Review the ${request.plugin} plugin`,
      value: (
        <button
          aria-haspopup="dialog"
          className="min-w-0 truncate rounded-sm text-accent-foreground underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setOpen(true)}
          type="button"
        >
          {file || `Review the ${request.plugin} plugin`}
        </button>
      ),
    });
  } else if (file) {
    items.push({
      label: 'Flow',
      icon: <FileCodeIcon />,
      mono: true,
      title: request.file,
      value: (
        <>
          <span className="min-w-0 truncate">{file}</span>
          <span className="shrink-0 font-sans text-[12px] text-muted-foreground">
            No review available
          </span>
        </>
      ),
    });
  }
  return (
    <div className="min-w-0" data-slot="flow-trust">
      <KeyValueGrid items={items} variant="facts" />
      {request.reviewUrl ? (
        <PluginReviewDialog onOpenChange={setOpen} open={open} request={request} />
      ) : null}
    </div>
  );
}
