import { AtSignIcon, DatabaseIcon, PaperclipIcon } from 'lucide-react';
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
  if (!contextReferences && !onOpenSources) {
    return (
      <PromptInputButton aria-label="Add files" onClick={onOpenFileUpload} title="Add files">
        <AddIcon aria-hidden="true" />
      </PromptInputButton>
    );
  }
  return (
    <PromptInputActionMenu>
      <PromptInputActionMenuTrigger aria-label="Add context" title="Add context">
        <AddIcon aria-hidden="true" />
      </PromptInputActionMenuTrigger>
      <PromptInputActionMenuContent>
        {attachmentEnabled ? (
          <PromptInputActionMenuItem
            aria-label="Attach a new file"
            onSelect={onOpenFileUpload}
            title="Attach a new file"
          >
            <PaperclipIcon aria-hidden="true" />
            Attach
          </PromptInputActionMenuItem>
        ) : null}
        {onOpenSources && (
          <PromptInputActionMenuItem aria-label="Connect data" onSelect={onOpenSources}>
            <DatabaseIcon aria-hidden="true" />
            Connect data
          </PromptInputActionMenuItem>
        )}
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
