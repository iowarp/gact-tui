import { CheckIcon, CopyIcon } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { copyText } from '@/lib/clipboard';
import { useFileViewerContentsRegistry } from './file-viewer-action-context';
import { ToolbarAction } from './viewer-toolbar';
import { t } from '@lingui/core/macro';

/**
 * Copy the active text representation without tying the action to its source panel.
 * Inside a frame bar it renders nothing and becomes what Copy ▾ Contents copies.
 */
export function TextFileCopyAction({
  name,
  readText,
  disabled = false,
}: {
  name: string;
  readText: () => string | undefined | Promise<string | undefined>;
  disabled?: boolean;
}) {
  const registry = useFileViewerContentsRegistry();
  const id = useId();
  const reader = useRef(readText);
  useEffect(() => {
    reader.current = readText;
  });
  const read = useCallback(() => reader.current(), []);
  useEffect(() => {
    if (!registry) return undefined;
    registry(id, disabled ? undefined : read);
    return () => registry(id);
  }, [registry, id, disabled, read]);
  if (registry) return null;
  return <StandaloneCopy name={name} readText={readText} disabled={disabled} />;
}

function StandaloneCopy({
  name,
  readText,
  disabled,
}: {
  name: string;
  readText: () => string | undefined | Promise<string | undefined>;
  disabled: boolean;
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
      toast.error(error instanceof Error ? error.message : t`Could not copy the file text.`);
    } finally {
      setPending(false);
    }
  };
  return (
    <ToolbarAction
      label={t`Copy ${name}`}
      disabled={disabled || pending}
      aria-busy={pending}
      onClick={() => void copy()}
    >
      {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      <span className="sr-only" aria-live="polite">
        {copied ? t`Copied` : ''}
      </span>
    </ToolbarAction>
  );
}
