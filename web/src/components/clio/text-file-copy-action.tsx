import { CheckIcon, CopyIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { ToolbarAction } from './viewer-toolbar';

/** Copy the active text representation without tying the action to its source panel. */
export function TextFileCopyAction({
  name,
  readText,
  disabled = false,
}: {
  name: string;
  readText: () => string | undefined | Promise<string | undefined>;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    setPending(true);
    try {
      const text = await readText();
      if (text === undefined) throw new Error('The file text is not available yet.');
      await copyText(text);
      setCopied(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not copy the file text.');
    } finally {
      setPending(false);
    }
  };
  return (
    <ToolbarAction
      label={`Copy ${name}`}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : ''}
      </span>
    </ToolbarAction>
  );
}
