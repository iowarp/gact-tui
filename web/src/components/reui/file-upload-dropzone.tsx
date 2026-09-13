import type { DragEvent, HTMLAttributes } from 'react';
import { UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FileUploadDropzoneProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onDrop'> {
  dragging?: boolean;
  maxSizeLabel?: string;
  onFilesAdded: (files: FileList) => void;
  onSelectFiles: () => void;
}

/** ReUI file-upload drop surface adapted for an externally owned attachment queue. */
export function FileUploadDropzone({
  className,
  dragging = false,
  maxSizeLabel,
  onFilesAdded,
  onSelectFiles,
  ...props
}: FileUploadDropzoneProps) {
  const handleDrag = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    handleDrag(event);
    if (event.dataTransfer.files.length > 0) onFilesAdded(event.dataTransfer.files);
  };

  return (
    <div
      aria-label="File drop area"
      className={cn(
        'relative rounded-xl border border-dashed p-8 text-center transition-colors',
        dragging
          ? 'border-primary bg-primary/5'
          : 'border-muted-foreground/25 hover:border-muted-foreground/50',
        className,
      )}
      data-dragging={dragging}
      data-slot="file-upload-dropzone"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      role="region"
      {...props}
    >
      <div className="flex flex-col items-center gap-4">
        <div
          className={cn(
            'flex size-16 items-center justify-center rounded-full',
            dragging ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <UploadIcon aria-hidden="true" />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Drop files to attach</h3>
          <p className="text-sm text-muted-foreground">
            Drop them anywhere in this window, or choose files from your device.
          </p>
          {maxSizeLabel ? (
            <p className="text-xs text-muted-foreground">Up to {maxSizeLabel} per file</p>
          ) : null}
        </div>
        <Button onClick={onSelectFiles} type="button">
          <UploadIcon aria-hidden="true" data-icon="inline-start" />
          Select files
        </Button>
      </div>
    </div>
  );
}
