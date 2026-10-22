import { FileCodeIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { fileName, flowTrustAuthor, type FlowTrustRequest } from '@/lib/plugin-review';
import { PluginReviewDialog } from './plugin-review-dialog';

/**
 * The compact facts of a flow-trust permission, under its "Running flow …"
 * title: who wrote the plugin and its file, which opens the plugin's review.
 */
export function FlowTrustDetails({ request }: { request: FlowTrustRequest }) {
  const [open, setOpen] = useState(false);
  const file = fileName(request.file);
  return (
    <div className="grid min-w-0 justify-items-start gap-0.5 text-sm" data-slot="flow-trust">
      <p className="text-muted-foreground">{`${flowTrustAuthor(request)} · not trusted yet`}</p>
      {request.reviewUrl ? (
        <>
          <Button
            aria-haspopup="dialog"
            className="h-auto max-w-full gap-1 p-0 font-mono text-sm"
            onClick={() => setOpen(true)}
            title={
              request.file
                ? `Review ${request.file} and its plugin`
                : `Review the ${request.plugin} plugin`
            }
            type="button"
            variant="link"
          >
            <FileCodeIcon aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="min-w-0 truncate">
              {file || `Review the ${request.plugin} plugin`}
            </span>
          </Button>
          <PluginReviewDialog onOpenChange={setOpen} open={open} request={request} />
        </>
      ) : file ? (
        <p className="flex min-w-0 items-center gap-1 font-mono">
          <FileCodeIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="min-w-0 truncate">{file}</span>
          <span className="shrink-0 font-sans text-xs text-muted-foreground">
            No review available
          </span>
        </p>
      ) : null}
    </div>
  );
}
