import { useEffect, useState } from 'react';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';
import { FileUploadDropzone } from '@/components/reui/file-upload-dropzone';
import { readDroppedFolders } from '@/lib/dropped-folders';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function carriesFiles(event: globalThis.DragEvent): boolean {
  return event.dataTransfer?.types.includes('Files') ?? false;
}

/** Shared drop and browse surface for the composer's existing attachment queue. */
export function ClioComposerFileUpload({
  enabled,
  onOpenChange,
  open,
  onFolderFiles,
}: {
  enabled: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  onFolderFiles?: (files: File[]) => void;
}) {
  const attachments = usePromptInputAttachments();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    // Native image drags can advertise Files too. Only files entering from
    // outside this document belong in the attachment picker.
    let internalDrag = false;
    const handleDragStart = (event: globalThis.DragEvent) => {
      internalDrag = !event.defaultPrevented;
    };
    const handleDragEnd = () => {
      internalDrag = false;
    };

    const handleDragEnter = (event: globalThis.DragEvent) => {
      if (internalDrag || !carriesFiles(event)) return;
      event.preventDefault();
      setDragging(true);
      onOpenChange(true);
    };
    const handleDragOver = (event: globalThis.DragEvent) => {
      if (internalDrag || !carriesFiles(event)) return;
      event.preventDefault();
    };
    const handleDrop = (event: globalThis.DragEvent) => {
      if (internalDrag || !carriesFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      const entries = Array.from(event.dataTransfer?.items ?? []).flatMap((item) => {
        const entry = item.webkitGetAsEntry?.();
        return entry ? [entry] : [];
      });
      if (entries.some((entry) => entry.isDirectory)) {
        event.stopImmediatePropagation();
        onOpenChange(false);
        void readDroppedFolders(entries)
          .then((files) => {
            if (onFolderFiles) onFolderFiles(files);
            else toast.error('Choose a workspace before attaching a folder');
          })
          .catch((error: unknown) =>
            toast.error(error instanceof Error ? error.message : 'Could not read this folder'),
          );
        return;
      }
      // Ordinary file drops are handled at their original target or during bubbling.
      if (event.eventPhase === Event.CAPTURING_PHASE) return;
      if (event.dataTransfer && event.dataTransfer.files.length > 0) {
        attachments.add(event.dataTransfer.files);
      }
      onOpenChange(false);
    };
    const captureFolder = (event: globalThis.DragEvent) => {
      if (internalDrag && carriesFiles(event)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        Array.from(event.dataTransfer?.items ?? []).some(
          (item) => item.webkitGetAsEntry?.()?.isDirectory,
        )
      )
        handleDrop(event);
    };

    document.addEventListener('dragstart', handleDragStart);
    document.addEventListener('dragend', handleDragEnd, true);
    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('drop', captureFolder, true);
    return () => {
      document.removeEventListener('dragstart', handleDragStart);
      document.removeEventListener('dragend', handleDragEnd, true);
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('drop', captureFolder, true);
    };
  }, [attachments, enabled, onOpenChange, onFolderFiles]);

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setDragging(false);
        onOpenChange(nextOpen);
      }}
      open={open}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add attachments</DialogTitle>
          <DialogDescription>
            Files are added to this message and remain editable before you send it.
          </DialogDescription>
        </DialogHeader>
        <FileUploadDropzone
          dragging={dragging}
          maxSizeLabel="250 MB"
          onFilesAdded={(files) => {
            attachments.add(files);
            setDragging(false);
            onOpenChange(false);
          }}
          onSelectFiles={() => {
            onOpenChange(false);
            attachments.openFileDialog();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
