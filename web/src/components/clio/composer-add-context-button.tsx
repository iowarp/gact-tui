import { AtSignIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';

/**
 * The first two controls of the composer row: `+` attaches files (or opens the
 * connected-sources window, which also offers file upload) and `@` opens the
 * reference picker.
 */
export function ComposerAddContextButtons({
  attachments: attachmentEnabled,
  contextReferences,
  disabled,
  onOpenFileUpload,
  onOpenReferences,
  onOpenSources,
}: {
  attachments: boolean;
  contextReferences: boolean;
  disabled?: boolean;
  onOpenFileUpload: () => void;
  onOpenReferences: () => void;
  onOpenSources?: () => void;
}) {
  return (
    <>
      {attachmentEnabled || onOpenSources ? (
        <IconButton
          disabled={disabled}
          icon={<AddIcon />}
          label="Attach files"
          onClick={onOpenSources ?? onOpenFileUpload}
          size="toolbar"
          tooltipSide="top"
          type="button"
        />
      ) : null}
      {contextReferences ? (
        <IconButton
          disabled={disabled}
          icon={<AtSignIcon />}
          label="Add a reference"
          onClick={onOpenReferences}
          size="toolbar"
          tooltipSide="top"
          type="button"
        />
      ) : null}
    </>
  );
}
