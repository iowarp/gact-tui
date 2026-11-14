import { useId, useRef, useState } from 'react';
import { ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@lingui/core/macro';

/** Attach an optional rating and comment to the original response. */
export function ResponseFeedbackComment({
  rating,
  comment,
  saving,
  error,
  onClose,
  onSave,
  onRestoreFocus,
}: {
  rating: 'good' | 'bad' | null;
  comment: string;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (rating: 'good' | 'bad' | null, comment: string) => void;
  onRestoreFocus: () => void;
}) {
  const [choice, setChoice] = useState(rating);
  const [text, setText] = useState(comment);
  const commentId = useId();
  const commentRef = useRef<HTMLTextAreaElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          commentRef.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onRestoreFocus();
        }}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving) onSave(choice, text.trim());
          }}
        >
          <DialogHeader>
            <DialogTitle>{t`Response feedback`}</DialogTitle>
            <DialogDescription>{t`What was good or bad about this response?`}</DialogDescription>
          </DialogHeader>
          <div className="my-4 flex gap-2">
            {(['good', 'bad'] as const).map((value) => {
              const Icon = value === 'good' ? ThumbsUpIcon : ThumbsDownIcon;
              return (
                <Button
                  key={value}
                  type="button"
                  disabled={saving}
                  variant={choice === value ? 'secondary' : 'outline'}
                  className="min-w-0 flex-1 px-2 text-xs sm:text-sm"
                  aria-pressed={choice === value}
                  onClick={() => setChoice(choice === value ? null : value)}
                >
                  <Icon aria-hidden="true" className="size-3.5" />
                  {value === 'good' ? t`Good response` : t`Bad response`}
                </Button>
              );
            })}
          </div>
          <Label htmlFor={commentId}>{t`Comment`}</Label>
          <Textarea
            autoFocus
            ref={commentRef}
            id={commentId}
            className="mt-2 min-h-28 max-h-60"
            placeholder={t`Add details about what worked or what could improve…`}
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={4000}
            disabled={saving}
          />
          {error ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t`Cancel`}
            </Button>
            <Button
              type="submit"
              disabled={saving || (choice === rating && text.trim() === comment)}
            >
              {saving ? t`Saving feedback…` : t`Save feedback`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
