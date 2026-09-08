'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Ansi from 'ansi-to-react';
import { CheckIcon, CopyIcon, TerminalIcon, Trash2Icon } from 'lucide-react';
import type { ComponentProps, HTMLAttributes } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

/** Resolve ansi-to-react across its CommonJS default-export shapes. */
export function resolveAnsiComponent(moduleValue: unknown): typeof Ansi {
  let candidate = moduleValue;
  const visited = new Set<unknown>();
  while (
    candidate !== null &&
    typeof candidate === 'object' &&
    'default' in candidate &&
    !visited.has(candidate)
  ) {
    visited.add(candidate);
    candidate = (candidate as { default: unknown }).default;
  }
  if (typeof candidate !== 'function') {
    throw new TypeError('ansi-to-react did not resolve to a React component');
  }
  return candidate as typeof Ansi;
}

const AnsiRenderer = resolveAnsiComponent(Ansi);

interface TerminalContextType {
  output: string;
  isStreaming: boolean;
  autoScroll: boolean;
  onClear?: () => void;
}

const TerminalContext = createContext<TerminalContextType>({
  autoScroll: true,
  isStreaming: false,
  output: '',
});

export type TerminalHeaderProps = HTMLAttributes<HTMLDivElement>;

export const TerminalHeader = ({ className, children, ...props }: TerminalHeaderProps) => (
  <div
    className={cn(
      'flex items-center justify-between border-zinc-800 border-b px-4 py-2',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export type TerminalTitleProps = HTMLAttributes<HTMLDivElement>;

export const TerminalTitle = ({ className, children, ...props }: TerminalTitleProps) => (
  <div className={cn('flex items-center gap-2 text-sm text-zinc-400', className)} {...props}>
    <TerminalIcon className="size-4" />
    {children ?? 'Terminal'}
  </div>
);

export type TerminalStatusProps = HTMLAttributes<HTMLDivElement>;

export const TerminalStatus = ({ className, children, ...props }: TerminalStatusProps) => {
  const { isStreaming } = useContext(TerminalContext);

  if (!isStreaming) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 text-xs text-zinc-400', className)} {...props}>
      {children}
    </div>
  );
};

export type TerminalActionsProps = HTMLAttributes<HTMLDivElement>;

export const TerminalActions = ({ className, children, ...props }: TerminalActionsProps) => (
  <div className={cn('flex items-center gap-1', className)} {...props}>
    {children}
  </div>
);

export type TerminalCopyButtonProps = ComponentProps<typeof Button> & {
  onCopy?: () => void;
  onError?: (error: Error) => void;
  timeout?: number;
};

export const TerminalCopyButton = ({
  onCopy,
  onError,
  timeout = 2000,
  children,
  className,
  ...props
}: TerminalCopyButtonProps) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<number>(0);
  const { output } = useContext(TerminalContext);

  const copyToClipboard = useCallback(async () => {
    if (typeof window === 'undefined' || !navigator?.clipboard?.writeText) {
      onError?.(new Error('Clipboard API not available'));
      return;
    }

    try {
      await navigator.clipboard.writeText(output);
      setIsCopied(true);
      onCopy?.();
      timeoutRef.current = window.setTimeout(() => setIsCopied(false), timeout);
    } catch (error) {
      onError?.(error as Error);
    }
  }, [output, onCopy, onError, timeout]);

  useEffect(
    () => () => {
      window.clearTimeout(timeoutRef.current);
    },
    [],
  );

  const Icon = isCopied ? CheckIcon : CopyIcon;

  return (
    <Button
      className={cn(
        'size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        className,
      )}
      onClick={copyToClipboard}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Icon size={14} />}
    </Button>
  );
};

export type TerminalClearButtonProps = ComponentProps<typeof Button>;

export const TerminalClearButton = ({
  children,
  className,
  ...props
}: TerminalClearButtonProps) => {
  const { onClear } = useContext(TerminalContext);

  if (!onClear) {
    return null;
  }

  return (
    <Button
      className={cn(
        'size-7 shrink-0 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100',
        className,
      )}
      onClick={onClear}
      size="icon"
      variant="ghost"
      {...props}
    >
      {children ?? <Trash2Icon size={14} />}
    </Button>
  );
};

export type TerminalContentProps = HTMLAttributes<HTMLDivElement>;

export const TerminalContent = ({ className, children, ...props }: TerminalContentProps) => {
  const { output, isStreaming, autoScroll } = useContext(TerminalContext);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [output, autoScroll]);

  return (
    <div
      className={cn('max-h-96 overflow-auto p-4 font-mono text-sm leading-relaxed', className)}
      ref={containerRef}
      {...props}
    >
      {children ?? (
        <pre className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]">
          <AnsiRenderer>{output}</AnsiRenderer>
          {isStreaming && (
            <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-zinc-100" />
          )}
        </pre>
      )}
    </div>
  );
};

export type TerminalCommandProps = HTMLAttributes<HTMLDivElement> & {
  command: string;
};

/** Display the exact command associated with terminal output. */
export const TerminalCommand = ({ command, className, ...props }: TerminalCommandProps) => (
  <div
    aria-label="Command"
    className={cn(
      'flex items-start gap-2 border-zinc-800 border-b bg-zinc-900/60 px-4 py-2 font-mono text-sm',
      className,
    )}
    {...props}
  >
    <span aria-hidden="true" className="shrink-0 select-none text-emerald-400">
      $
    </span>
    <code className="min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere] text-zinc-100">
      {command}
    </code>
  </div>
);

export type TerminalProps = HTMLAttributes<HTMLDivElement> & {
  output: string;
  command?: string;
  isStreaming?: boolean;
  autoScroll?: boolean;
  onClear?: () => void;
};

export const Terminal = ({
  output,
  command,
  isStreaming = false,
  autoScroll = true,
  onClear,
  className,
  children,
  ...props
}: TerminalProps) => {
  const contextValue = useMemo(
    () => ({ autoScroll, isStreaming, onClear, output }),
    [autoScroll, isStreaming, onClear, output],
  );

  return (
    <TerminalContext.Provider value={contextValue}>
      <div
        className={cn(
          'flex flex-col overflow-hidden rounded-lg border bg-zinc-950 text-zinc-100',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <TerminalHeader>
              <TerminalTitle />
              <div className="flex items-center gap-1">
                <TerminalStatus />
                <TerminalActions>
                  <TerminalCopyButton />
                  {onClear && <TerminalClearButton />}
                </TerminalActions>
              </div>
            </TerminalHeader>
            {command ? <TerminalCommand command={command} /> : null}
            <TerminalContent />
          </>
        )}
      </div>
    </TerminalContext.Provider>
  );
};
