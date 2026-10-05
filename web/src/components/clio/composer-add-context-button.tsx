import { AtSignIcon, PaperclipIcon } from 'lucide-react';
import { AddIcon } from '@/lib/icon-vocabulary';
import {
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputActionMenuTrigger,
  PromptInputButton,
} from '@/components/ai-elements/prompt-input';

export function ComposerAddContextButton({
  attachments: attachmentEnabled,
  contextReferences,
  onOpenFileUpload,
  onOpenReferences,
  onOpenSources,
}: {
  attachments: boolean;
  contextReferences: boolean;
  onOpenFileUpload: () => void;
  onOpenReferences: () => void;
  onOpenSources?: () => void;
}) {
  if (!contextReferences) {
    return (
      <>
        {attachmentEnabled || onOpenSources ? (
          <PromptInputButton
            aria-label="Attach"
            onClick={onOpenSources ?? onOpenFileUpload}
            title="Attach"
          >
            <AddIcon aria-hidden="true" />
          </PromptInputButton>
        ) : null}
      </>
    );
  }
  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger aria-label="Add context" title="Add context">
        <AddIcon aria-hidden="true" />
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent className="w-auto min-w-44 whitespace-nowrap">
        {attachmentEnabled || onOpenSources ? (
          <PromptInputActionMenuItem
            aria-label="Attach"
            onSelect={onOpenSources ?? onOpenFileUpload}
            title="Attach files, folders, or connected data"
          >
            <PaperclipIcon aria-hidden="true" />
            Attach
          </PromptInputActionMenuItem>
        ) : null}
        {contextReferences && (
          <PromptInputActionMenuItem
            aria-label="Reference existing context"
            onSelect={onOpenReferences}
            title="Reference existing context"
          >
            <AtSignIcon aria-hidden="true" />
            Reference
          </PromptInputActionMenuItem>
        )}
      </PromptInputActionMenuContent>
    </PromptInputActionMenu>
  );
}
