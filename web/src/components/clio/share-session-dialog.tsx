import { CheckIcon, CopyIcon, Share2Icon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/utils';
import { DialogFrame } from './primitives/dialog-frame';
import { IconButton } from './primitives/icon-button';
import { t } from '@lingui/core/macro';

const EXPIRY_OPTIONS = [
  { value: '3600', label: t`In 1 hour` },
  { value: '86400', label: t`In 1 day` },
  { value: '604800', label: t`In 7 days` },
  { value: '2592000', label: t`In 30 days` },
] as const;

export interface ClioShareSessionDialogProps {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onShare: (ttlSeconds: number) => Promise<string>;
}

/**
 * Share a read-only snapshot. Once the link exists, Cancel becomes Done and
 * Copy sits in the link's field.
 */
export function ClioShareSessionDialog({
  open,
  title,
  onOpenChange,
  onShare,
}: ClioShareSessionDialogProps) {
  const [ttlSeconds, setTtlSeconds] = useState('604800');
  const [shareUrl, setShareUrl] = useState<string>();
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const createShare = async () => {
    setPending(true);
    try {
      setShareUrl(await onShare(Number(ttlSeconds)));
    } catch {
      // The route reports the authoritative service error.
    } finally {
      setPending(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await copyText(shareUrl);
      setCopied(true);
    } catch {
      inputRef.current?.select();
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && pending) return;
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setShareUrl(undefined);
      setCopied(false);
    }
  };

  return (
    <DialogFrame
      open={open}
      onOpenChange={handleOpenChange}
      icon={<Share2Icon />}
      title={t`Share ${title}`}
      description={t`A read-only snapshot. Anyone with the link can view it until it expires.`}
      cancelLabel={shareUrl ? null : t`Cancel`}
      confirm={
        shareUrl
          ? { label: t`Done`, onConfirm: () => handleOpenChange(false), key: 'Enter' }
          : {
              label: pending ? t`Creating link…` : t`Create share link`,
              disabled: pending,
              onConfirm: () => void createShare(),
            }
      }
    >
      <div className="grid gap-3">
        <div className="grid gap-1.5">
          <Label
            htmlFor="session-share-expiry"
            className="text-xs font-normal text-muted-foreground"
          >
            {t`Link expires`}
          </Label>
          {/* The link is minted with its expiry: afterwards the field keeps its box and
              chevron with muted text (spec "Share, after the link"). */}
          <Select
            disabled={Boolean(shareUrl) || pending}
            onValueChange={setTtlSeconds}
            value={ttlSeconds}
          >
            <SelectTrigger
              className={cn(
                'h-[30px] w-full text-menu',
                shareUrl && 'disabled:cursor-default disabled:opacity-100 text-muted-foreground',
              )}
              id="session-share-expiry"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {shareUrl ? (
          <div className="grid gap-1.5">
            <Label
              htmlFor="session-share-url"
              className="text-xs font-normal text-muted-foreground"
            >
              {t`Share link`}
            </Label>
            <div className="relative">
              <Input
                id="session-share-url"
                readOnly
                ref={inputRef}
                value={shareUrl}
                className="h-[30px] pr-8 font-mono text-meta md:text-meta"
                onFocus={(event) => event.currentTarget.select()}
              />
              <IconButton
                size="sm"
                label={copied ? t`Copied` : t`Copy share link`}
                icon={copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
                onClick={() => void copy()}
                className="absolute top-1/2 right-[3px] size-6 -translate-y-1/2"
              />
            </div>
          </div>
        ) : null}
      </div>
    </DialogFrame>
  );
}
