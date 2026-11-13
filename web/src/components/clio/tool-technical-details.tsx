import type { AttentionBlock, ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';
import { ChevronRightIcon } from 'lucide-react';
import { useContext, useMemo, useState, type ReactNode } from 'react';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/tooltip';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLiveStore } from '@/store/live-store';
import { jsonLine } from './json-line';
import { DialogFrame } from './primitives/dialog-frame';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { PresentationLink } from './presentation-link';
import { PresentationNavigation } from './presentation-navigation';
import { PagedBlock } from './tool-result-primitives';
import { ToolAttentionField } from './tool-attention-fields';
import { CopyAction } from './tool-compact-row';
import { toolResultRecord } from './tool-result-shared';
import { getToolActionLabel } from './tool-presentation';
import type { SandboxBoundary } from './sandbox-boundary';
import { plural, ph, t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import { formatLocale } from '@/lib/locale-format';

function clock(at: string | undefined): string | undefined {
  if (!at) return undefined;
  const date = new Date(at);
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleTimeString(formatLocale(), {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
}

/** Code lines shown before "Show all"; a large result stays one click away. */
const CODE_LINES = 400;
/** Terminal lines an error shows; the full text is copied or in Raw result. */
const TAIL_LINES = 8;

function asText(value: unknown): { text: string; json: boolean } {
  if (typeof value === 'string')
    return value ? { text: value, json: false } : { text: '""', json: true };
  return { text: JSON.stringify(value, null, 2) ?? String(value), json: true };
}

/**
 * A Technical details dialog's facts (spec `.tdg`): 118px keys, a 10px gap and
 * 24px rows. The keys stay words at every width; the dialog has room for them.
 */
export function TechnicalDetailsFacts({ items }: { items: readonly KeyValueItem[] }) {
  return (
    <KeyValueGrid
      items={items}
      variant="facts"
      className="grid-cols-[118px_minmax(0,1fr)] @max-[420px]:grid-cols-[118px_minmax(0,1fr)]"
    />
  );
}

/** A dialog section: a quiet 28px heading, an optional aside and copy, then its block. */
export function DetailsSection({
  title,
  aside,
  copy,
  copyLabel,
  label,
  children,
}: {
  title: string;
  aside?: string;
  copy?: string;
  /** The copy button's name (`Copy arguments`); written whole so it reads right in every language. */
  copyLabel?: string;
  /** The section's accessible name when it differs from its heading. */
  label?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={label} className="min-w-0" data-slot="details-section">
      <div className="flex h-7 min-w-0 items-center gap-2 text-meta whitespace-nowrap text-muted-foreground">
        <h4 className="font-medium text-foreground/90">{title}</h4>
        {aside ? <span className="min-w-0 truncate">{aside}</span> : null}
        {copy ? (
          <span className="ml-auto flex">
            <CopyAction
              value={copy}
              label={copyLabel ?? t`Copy ${ph({ section: title.toLowerCase() })}`}
            />
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Line-numbered code in a bordered block; JSON in theme syntax colors. */
function NumberedCode({ text, json }: { text: string; json: boolean }) {
  const lines = useMemo(() => text.split('\n'), [text]);
  const [all, setAll] = useState(false);
  const shown = all ? lines : lines.slice(0, CODE_LINES);
  const hidden = lines.length - shown.length;
  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-background"
      data-slot="details-code"
    >
      <pre className="grid grid-cols-[34px_minmax(0,1fr)] py-1.5 pr-2.5 font-mono text-label leading-[1.65] text-foreground/90">
        {shown.map((line, index) => (
          <span className="contents" key={index}>
            <span aria-hidden="true" className="pr-3 text-right text-faint select-none">
              {index + 1}
            </span>
            <code className="break-all whitespace-pre-wrap">
              {line ? (json ? jsonLine(line) : line) : ' '}
            </code>
          </span>
        ))}
      </pre>
      {hidden > 0 ? (
        <div className="flex h-[30px] items-center gap-2.5 border-t border-border pr-1.5 pl-2.5 text-label whitespace-nowrap text-muted-foreground">
          <span className="truncate">
            {plural(hidden, { one: '# more line', other: '# more lines' })}
          </span>
          <Button
            variant="ghost"
            className="ml-auto h-6 px-2 text-meta"
            onClick={() => setAll(true)}
          >
            {t`Show all`}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * An error's last lines as the terminal printed them: messages in the body
 * color, indented frames ("at file:line") faint.
 */
function TerminalTail({ text }: { text: string }) {
  const lines = text.replace(/\s+$/u, '').split('\n');
  const earlier = Math.max(0, lines.length - TAIL_LINES);
  return (
    <div
      className="min-w-0 overflow-hidden rounded-lg border border-border bg-background"
      data-slot="details-terminal"
    >
      <pre className="overflow-x-auto px-3 py-1.5 font-mono text-label leading-[1.6] whitespace-pre text-foreground/90">
        {earlier ? (
          <span className="block text-faint">
            {plural(earlier, { one: '# earlier line', other: '# earlier lines' })}
          </span>
        ) : null}
        {lines.slice(earlier).map((line, index) => (
          <span className={cn('block', /^\s/u.test(line) && 'text-faint')} key={index}>
            {line || ' '}
          </span>
        ))}
      </pre>
    </div>
  );
}

function CodeSection({
  title,
  copyLabel,
  value,
}: {
  title: string;
  copyLabel: string;
  value: unknown;
}) {
  const { text, json } = asText(value);
  return (
    <DetailsSection title={title} copy={text} copyLabel={copyLabel}>
      <NumberedCode text={text} json={json} />
    </DetailsSection>
  );
}

/**
 * A call's outcome. A result is line-numbered code. An error is its exit code
 * and the stderr (or error) tail in a terminal block, with the full result
 * folded behind Raw result.
 */
function OutcomeSection({
  tool,
  output,
  error,
  resultTitle = t`Result`,
  resultCopyLabel = t`Copy result`,
}: {
  tool?: ToolInvocation;
  output: unknown;
  error: unknown;
  resultTitle?: string;
  resultCopyLabel?: string;
}) {
  const [rawOpen, setRawOpen] = useState(false);
  const errorText =
    error === undefined || error === null || error === ''
      ? undefined
      : typeof error === 'string'
        ? error
        : JSON.stringify(error, null, 2);
  if (!errorText)
    return output === undefined ? null : (
      <CodeSection title={resultTitle} copyLabel={resultCopyLabel} value={output} />
    );
  const record = tool ? toolResultRecord(tool.output) : undefined;
  const stderr =
    typeof record?.stderr === 'string' && record.stderr.trim() ? record.stderr : undefined;
  const exitCode =
    typeof record?.exit_code === 'number' ? t`exit ${ph({ code: record.exit_code })}` : undefined;
  // The error names what stderr does not say; stderr already carries it otherwise.
  const lead = stderr && !stderr.includes(errorText.trim()) ? errorText.split('\n')[0] : undefined;
  const terminal = stderr ?? errorText;
  const raw = output === undefined ? undefined : asText(output);
  return (
    <DetailsSection
      title={t`Error`}
      copyLabel={t`Copy error`}
      aside={exitCode}
      copy={lead ? `${errorText}\n${terminal}` : terminal}
    >
      {lead ? (
        <p className="mb-1.5 truncate text-foreground" title={errorText}>
          {lead}
        </p>
      ) : null}
      <TerminalTail text={terminal} />
      {raw ? (
        <>
          <button
            type="button"
            aria-expanded={rawOpen}
            className="mt-1.5 inline-flex h-6 items-center gap-1.5 rounded-[5px] pr-1.5 text-meta text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setRawOpen((value) => !value)}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                'size-[13px] shrink-0 motion-safe:transition-transform',
                rawOpen && 'rotate-90',
              )}
            />
            {t`Raw result`}
          </button>
          {rawOpen ? <NumberedCode text={raw.text} json={raw.json} /> : null}
        </>
      ) : null}
    </DetailsSection>
  );
}

/**
 * ⓘ on an activity row: the call's facts on one grid (tool, caller, timing,
 * sandbox), then its arguments, result or error, diagnostics and the
 * submission response, in the shared dialog frame.
 */
export function ToolTechnicalDetailsDialog({
  open,
  onOpenChange,
  tool,
  title,
  duration,
  active,
  boundary,
  link,
  catalogContent,
  attentionFields,
  sessionId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool: ToolInvocation;
  title: string;
  duration?: number;
  active: boolean;
  boundary?: SandboxBoundary;
  /** A compact row's subject or flow, reachable from the dialog. */
  link?: ReactNode;
  catalogContent: readonly ToolPresentationBlock[];
  attentionFields?: readonly AttentionBlock[];
  sessionId?: string;
}) {
  const provided = useContext(PresentationNavigation)?.tools;
  const parent = useLiveStore((state) =>
    tool.parent_call_id
      ? (provided?.[tool.parent_call_id] ?? state.entities.tools[tool.parent_call_id])
      : undefined,
  );
  const started = clock(tool.started_at);
  const roots = boundary?.request_roots.join(', ');
  const [submissionOpen, setSubmissionOpen] = useState(false);
  const items: KeyValueItem[] = [
    { label: t`Tool`, value: tool.name, mono: true },
    ...(parent
      ? [{ label: t`Called by`, value: getToolActionLabel(parent), title: parent.name }]
      : []),
    ...(duration !== undefined
      ? [
          {
            label: active ? t`Elapsed time` : t`Execution time`,
            // The same reading as the row's elapsed column, so 820 ms reads 0.8s in both.
            value: started
              ? t`${ph({ duration: formatDuration(duration, 'elapsed') })}, started ${started}`
              : formatDuration(duration, 'elapsed'),
          },
        ]
      : []),
    ...(boundary
      ? [
          {
            label: t`Sandbox`,
            value: boundary.request_roots.length ? (
              <span className="min-w-0 truncate">
                {boundary.kind === 'write_denied' ? (
                  <Trans>
                    On, blocked a write to <span className="font-mono text-meta">{roots}</span>
                  </Trans>
                ) : (
                  <Trans>
                    On, blocked access to <span className="font-mono text-meta">{roots}</span>
                  </Trans>
                )}
              </span>
            ) : (
              boundary.message
            ),
            title: boundary.message,
          },
        ]
      : []),
  ];
  const attentionInput = attentionFields?.filter((entry) => entry.kind === 'tool_input') ?? [];
  const attentionResult = attentionFields?.filter((entry) => entry.kind === 'tool_result') ?? [];
  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      icon={<InfoIcon className="size-4" />}
      title={title}
      description={t`Original tool arguments, result, and diagnostics.`}
      className="w-[clamp(360px,56vw,760px)]"
      footerStart={
        tool.submission ? (
          <button
            type="button"
            aria-expanded={submissionOpen}
            className="inline-flex h-6 min-w-0 items-center gap-1.5 rounded-[5px] pr-1.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => setSubmissionOpen((value) => !value)}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cn(
                'size-[13px] shrink-0 motion-safe:transition-transform',
                submissionOpen && 'rotate-90',
              )}
            />
            <span className="truncate">{t`Submission response`}</span>
          </button>
        ) : undefined
      }
    >
      <div
        role="region"
        aria-label={t`Scrollable result content`}
        tabIndex={0}
        className="-mr-3 grid max-h-[65dvh] min-w-0 grid-cols-1 gap-2.5 overflow-auto overscroll-contain pr-3 pb-2 text-menu [overflow-wrap:anywhere]"
        data-slot="tool-technical-details"
      >
        <TooltipProvider delayDuration={200}>
          <TechnicalDetailsFacts items={items} />
          {link}
          {catalogContent.length ? (
            <DetailsSection title={t`Loaded content`} label={t`Loaded widget catalog`}>
              <PagedBlock
                block={catalogContent[0]}
                groupedBlocks={[...catalogContent]}
                lines={20}
                full
              />
            </DetailsSection>
          ) : null}
          {attentionInput.length ? (
            attentionInput.map((block) => (
              <ToolAttentionField
                key={`${block.part_id}:${block.field}`}
                block={block}
                tool={tool}
                sessionId={sessionId}
              />
            ))
          ) : tool.input !== undefined ? (
            <CodeSection
              title={t`Arguments`}
              copyLabel={t`Copy arguments`}
              value={tool.input ?? {}}
            />
          ) : null}
          {attentionResult.length ? (
            attentionResult.map((block) => (
              <ToolAttentionField
                key={`${block.part_id}:${block.field}`}
                block={block}
                tool={tool}
                sessionId={sessionId}
              />
            ))
          ) : (
            <OutcomeSection tool={tool} output={tool.output} error={tool.error} />
          )}
          {attentionResult.length && tool.error ? <p role="alert">{String(tool.error)}</p> : null}
          {tool.execution_task && attentionResult.length ? (
            <OutcomeSection
              tool={tool}
              output={tool.output}
              error={tool.error}
              resultTitle={t`Execution result`}
              resultCopyLabel={t`Copy execution result`}
            />
          ) : null}
          {tool.presentation?.diagnostic ? (
            <p className="text-muted-foreground">{tool.presentation.diagnostic}</p>
          ) : null}
          {tool.submission && submissionOpen ? (
            <OutcomeSection
              output={tool.submission.output}
              error={tool.submission.error}
              resultTitle={t`Submission response`}
              resultCopyLabel={t`Copy submission response`}
            />
          ) : null}
        </TooltipProvider>
      </div>
    </DialogFrame>
  );
}

/** A compact row's way to its subject or flow from inside the dialog. */
export function TechnicalDetailsLink({
  onOpenFlow,
  flowLabel,
  subject,
  onClose,
}: {
  onOpenFlow?: () => void;
  flowLabel?: string;
  subject?: ToolPresentationBlock;
  onClose: () => void;
}) {
  if (onOpenFlow)
    return (
      <Button
        variant="link"
        className="h-auto justify-start p-0"
        onClick={() => {
          onClose();
          onOpenFlow();
        }}
      >
        {flowLabel ? t`Open ${ph({ flow: flowLabel.toLowerCase() })} run` : t`Open flow run`}
      </Button>
    );
  return subject ? <PresentationLink block={subject} /> : null;
}
