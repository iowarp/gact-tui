import type { ProblemReport } from '@clio/core/v3';
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/locale-format';
import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import { cn } from '@/lib/utils';
import { humanizeProtocolValue } from './presentation-labels';
import { StateView } from './primitives/state-view';
import { StatusIndicator, type StatusTone } from './primitives/status-indicator';
import { integrationTitle, statusOf } from './settings-health-labels';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { plural, t } from '@lingui/core/macro';

type Reply = NonNullable<NonNullable<ProblemReport['conversation']>['recent_replies']>[number];
type LogSource = ProblemReport['logs']['sources'][number];

const LOG_TITLES: Record<LogSource['role'], string> = {
  server: t`Service log`,
  gact: t`Service error output`,
  desktop: t`Desktop app log`,
};

const REPLY_STATUS: Record<Reply['outcome'], { tone: StatusTone; label: string }> = {
  failed: { tone: 'error', label: t`Failed` },
  completed: { tone: 'success', label: t`Answered` },
  empty: { tone: 'warning', label: t`No reply` },
};

/** What the report will hold: the facts first, then the log tail in a scrollable box. */
export function ReportPreview({
  report,
  refreshing,
  onShowMore,
}: {
  report: ProblemReport;
  refreshing: boolean;
  onShowMore: () => void;
}) {
  const { about, health, logs, conversation } = report;
  const removed = report.redaction
    .filter((item) => item.rule !== 'home_path')
    .reduce((sum, item) => sum + item.count, 0);
  const canShowMore =
    logs.sources.some((source) => source.earlier_lines) && logs.lines_requested < logs.max_lines;
  return (
    <div aria-busy={refreshing} data-slot="report-preview">
      <Fact label={t`Version`} mono value={about.version} />
      <Fact label={t`System`} value={about.os} />
      <Fact
        label={t`App`}
        value={
          about.app_kind === 'desktop'
            ? t`Desktop application`
            : about.app_kind === 'web'
              ? t`Web browser`
              : t`Not reported`
        }
      />
      <Fact
        label={t`Model`}
        mono
        value={[about.provider, about.model].filter(Boolean).join('/') || t`Not set`}
      />
      <HealthFacts health={health} />
      {conversation ? <ConversationFacts conversation={conversation} /> : null}
      <SettingsGroupLabel>{t`Recent log`}</SettingsGroupLabel>
      {logs.degradation ? (
        <div className={SETTINGS_COLUMN}>
          <StateView
            kind="empty"
            size="row"
            title={t`No log file was found on this computer. A service started from a terminal writes its log there instead.`}
            wrapDetail
          />
        </div>
      ) : null}
      {logs.sources.map((source) => (
        <LogBox key={source.path} source={source} />
      ))}
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-meta text-muted-foreground">
        <span>
          {plural(logs.lines_requested, {
            one: 'Showing the last line of each log.',
            other: 'Showing the last # lines of each log.',
          })}
        </span>
        {canShowMore ? (
          <Button
            disabled={refreshing}
            onClick={onShowMore}
            size="xs"
            type="button"
            variant="outline"
          >
            {refreshing ? t`Loading…` : t`Show more`}
          </Button>
        ) : null}
      </div>
      <p className="mt-3 text-meta text-muted-foreground" data-slot="report-redaction">
        {plural(removed, {
          0: 'No secrets were found to remove. Your home folder is shown as ~.',
          one: 'Removed before showing: # secret. Your home folder is shown as ~.',
          other: 'Removed before showing: # secrets. Your home folder is shown as ~.',
        })}
      </p>
    </div>
  );
}

function Fact({ label, value, mono = false }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <SettingsRow title={label}>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-left [contain:inline-size] @xs:text-right max-[1023px]:in-data-window-content:text-left!',
          mono ? 'font-mono text-xs text-muted-foreground' : 'text-menu text-muted-foreground',
        )}
        data-slot="settings-value"
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </span>
    </SettingsRow>
  );
}

function HealthFacts({ health }: { health: ProblemReport['health'] }) {
  const overall = health.overall_status ? statusOf(health.overall_status) : undefined;
  const attention = health.rows.filter((row) => statusOf(row.status).tone !== 'success');
  return (
    <>
      <SettingsRow title={t`Health`}>
        {overall ? (
          <StatusIndicator label={overall.label} tone={overall.tone} />
        ) : (
          <span className="text-xs text-faint">{t`Not available`}</span>
        )}
      </SettingsRow>
      {attention.length ? (
        <ul
          aria-label={t`Health checks that need attention`}
          className={cn('mt-1 mb-2 flex flex-col gap-1.5', SETTINGS_COLUMN)}
        >
          {attention.map((row) => {
            const status = statusOf(row.status);
            return (
              <li className="flex min-w-0 flex-col gap-0.5" key={row.name}>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-menu">
                  <span className="font-medium text-foreground">{integrationTitle(row.name)}</span>
                  <StatusIndicator label={status.label} tone={status.tone} />
                </span>
                {row.summary ? (
                  <span className="text-meta text-pretty break-words text-muted-foreground">
                    {row.summary}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </>
  );
}

function ConversationFacts({
  conversation,
}: {
  conversation: NonNullable<ProblemReport['conversation']>;
}) {
  if (conversation.degradation)
    return (
      <div className={SETTINGS_COLUMN}>
        <StateView
          kind="unavailable"
          size="row"
          title={t`That conversation is not on this agent service.`}
        />
      </div>
    );
  const replies = conversation.recent_replies ?? [];
  return (
    <>
      <SettingsGroupLabel>{t`The conversation`}</SettingsGroupLabel>
      <Fact
        label={t`Messages included`}
        value={conversation.messages_included ? t`Yes` : t`No, only reply outcomes`}
      />
      {conversation.busy ? <Fact label={t`State`} value={t`A reply is running`} /> : null}
      {replies.length ? (
        <ul
          aria-label={t`Recent replies`}
          className={cn('mt-1 flex flex-col gap-1.5', SETTINGS_COLUMN)}
        >
          {replies.map((reply) => {
            const status = REPLY_STATUS[reply.outcome];
            const code = reply.error_code ? humanizeProtocolValue(reply.error_code) : undefined;
            return (
              <li className="flex min-w-0 flex-col gap-0.5" key={reply.message_id}>
                <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-menu">
                  <StatusIndicator label={status.label} tone={status.tone} />
                  <span className="text-meta text-muted-foreground tabular-nums">
                    {formatDateTime(reply.created_at)}
                  </span>
                  {code ? <span className="text-foreground">{code}</span> : null}
                </span>
                {reply.error_message ? (
                  <span className="text-meta text-pretty break-words text-muted-foreground">
                    {reply.error_message}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-meta text-muted-foreground">{t`No replies yet.`}</p>
      )}
    </>
  );
}

function LogBox({ source }: { source: LogSource }) {
  const title = LOG_TITLES[source.role];
  const box = useRef<HTMLPreElement>(null);
  // Newest lines are last: open at the end, where the failure usually is.
  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [source.lines]);
  return (
    <section aria-label={title} className="mt-2 min-w-0">
      <div className="mb-1 flex min-w-0 flex-wrap items-baseline gap-x-2">
        <h3 className="text-menu font-medium text-foreground">{title}</h3>
        <span className="min-w-0 truncate font-mono text-caption text-faint" title={source.path}>
          {source.path}
        </span>
      </div>
      {source.lines.length ? (
        <pre
          aria-label={t`${title}, last lines`}
          className="max-h-80 min-w-0 overflow-auto rounded-md border border-border bg-muted/40 p-2 font-mono text-[11.5px] leading-[1.45] whitespace-pre text-foreground"
          data-slot="report-log"
          ref={box}
          // Scrollable by keyboard, as the box can be taller than the window.
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
        >
          {source.lines.join('\n')}
        </pre>
      ) : (
        <p className="text-meta text-muted-foreground">
          {source.status === 'empty'
            ? t`The log file is empty.`
            : t`The log file could not be read.`}
        </p>
      )}
    </section>
  );
}
