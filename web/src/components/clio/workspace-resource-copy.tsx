import type { WorkspaceResource } from '@clio/core/v3';
import { CopyPlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { FileCopyDialog } from './file-copy-dialog';

/** Standalone access to the same copy flow used by every file viewer. */
export function WorkspaceResourceCopyAction({
  resource,
  workspaceId,
}: {
  resource: WorkspaceResource;
  workspaceId: string;
}) {
  const [open, setOpen] = useState(false);
  if (resource.state !== 'ready') return null;
  return (
    <>
      <Button
        aria-label={`Copy ${resource.name} to another workspace`}
        className="size-8 shrink-0"
        size="icon-sm"
        title="Copy to another workspace"
        variant="ghost"
        onClick={() => setOpen(true)}
      >
        <CopyPlusIcon aria-hidden="true" />
      </Button>
      <FileCopyDialog
        source={{ kind: 'resource', resource, workspaceId }}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
