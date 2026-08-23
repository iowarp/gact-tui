import { CheckIcon, CopyIcon, LinkIcon, LoaderCircleIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface ClioShareSessionDialogProps {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onShare: (ttlSeconds: number) => Promise<string>;
}

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
      await navigator.clipboard.writeText(shareUrl);
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
    <Dialog onOpenChange={handleOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share {title}</DialogTitle>
          <DialogDescription>
            Create an expiring, read-only link to the server-owned session snapshot. Anyone with the
            link can view it until it expires.
          </DialogDescription>
        </DialogHeader>
        {shareUrl ? (
          <div className="space-y-2">
            <Label htmlFor="session-share-url">Share link</Label>
            <div className="flex gap-2">
              <Input id="session-share-url" readOnly ref={inputRef} value={shareUrl} />
              <Button aria-label="Copy share link" onClick={() => void copy()} size="icon">
                {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="session-share-expiry">Link expires</Label>
            <Select onValueChange={setTtlSeconds} value={ttlSeconds}>
              <SelectTrigger className="w-full" id="session-share-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3600">In 1 hour</SelectItem>
                <SelectItem value="86400">In 1 day</SelectItem>
                <SelectItem value="604800">In 7 days</SelectItem>
                <SelectItem value="2592000">In 30 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button disabled={pending} onClick={() => handleOpenChange(false)} variant="outline">
            {shareUrl ? 'Done' : 'Cancel'}
          </Button>
          {!shareUrl ? (
            <Button disabled={pending} onClick={() => void createShare()}>
              {pending ? (
                <LoaderCircleIcon aria-hidden="true" className="animate-spin" />
              ) : (
                <LinkIcon aria-hidden="true" />
              )}
              {pending ? 'Creating link…' : 'Create share link'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
