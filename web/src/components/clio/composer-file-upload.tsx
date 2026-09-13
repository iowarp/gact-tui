import { useEffect, useState } from 'react';
import { usePromptInputAttachments } from '@/components/ai-elements/prompt-input';
import { FileUploadDropzone } from '@/components/reui/file-upload-dropzone';
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
}: {
  enabled: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const attachments = usePromptInputAttachments();
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const handleDragEnter = (event: globalThis.DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDragging(true);
      onOpenChange(true);
    };
    const handleDragOver = (event: globalThis.DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
    };
    const handleDrop = (event: globalThis.DragEvent) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      if (event.dataTransfer && event.dataTransfer.files.length > 0) {
        attachments.add(event.dataTransfer.files);
      }
      onOpenChange(false);
    };

    document.addEventListener('dragenter', handleDragEnter);
    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragenter', handleDragEnter);
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [attachments, enabled, onOpenChange]);

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
