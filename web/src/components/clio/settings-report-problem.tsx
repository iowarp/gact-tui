import { brand } from '@brand';
import type { ProblemReport } from '@clio/core/v3';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CheckIcon, CopyIcon, DownloadIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useRepository } from '@/hooks/use-repository';
import { copyText } from '@/lib/clipboard';
import { SETTINGS_COLUMN } from '@/lib/settings-fold';
import { inTauri } from '@/lib/transport/tauri-runtime';
import { cn } from '@/lib/utils';
import { useConnectionSettings } from '@/providers/connection-provider';
import { StateView } from './primitives/state-view';
import { ReportPreview } from './settings-report-problem-preview';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { downloadText } from './surface-export';
import { ph, t } from '@lingui/core/macro';

/** Log lines a report starts with; Show more doubles it up to the service's limit. */
const FIRST_LINES = 500;
const NO_CONVERSATION = '__none__';
const RECENT_CONVERSATIONS = 30;
const SELECT_TRIGGER =
  'w-[260px] max-w-full min-w-0 px-[9px] text-menu data-[size=default]:h-[1.875rem] data-[size=default]:rounded-md';

/** The page as Settings routes it: `?conversation=` names the conversation to report on. */
export function ReportProblemSettingsRoute() {
  const [params] = useSearchParams();
  const conversation = params.get('conversation') ?? undefined;
  return <ReportProblemSettings initialConversationId={conversation} key={conversation} />;
}

/**
 * Settings › Report a problem: CLIO's version, health and log tail, with one
 * conversation's reply errors when the person picks it, ready to copy or save.
 * The service removes secrets before the report reaches this page.
 */
export function ReportProblemSettings({
  initialConversationId,
}: {
  /** A conversation to report about, from a failed reply's Report this. */
  initialConversationId?: string;
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const [conversationId, setConversationId] = useState(initialConversationId ?? '');
  const [includeMessages, setIncludeMessages] = useState(false);
  const [lines, setLines] = useState(FIRST_LINES);
  const [copied, setCopied] = useState(false);
  const includeId = useId();
  const client = inTauri() ? 'desktop' : 'web';
  const report = useQuery({
    queryKey: ['problem-report', settings.endpoint, conversationId, includeMessages, lines],
    queryFn: ({ signal }) =>
      repository.problemReport(
        { lines, sessionId: conversationId || undefined, includeMessages, client },
        signal,
      ),
    placeholderData: keepPreviousData,
    retry: false,
    staleTime: 0,
  });
  const recent = useQuery({
    queryKey: ['problem-report', 'conversations', settings.endpoint, initialConversationId],
    queryFn: async ({ signal }) => {
      const page = await repository.sessionPage(
        { limit: RECENT_CONVERSATIONS, kinds: ['conversation'] },
        signal,
      );
      const sessions = page.sessions;
      // A conversation opened from its failed reply stays listed even when it is older.
      if (initialConversationId && !sessions.some((item) => item.id === initialConversationId)) {
        const [picked] = await repository.sessionsById([initialConversationId], signal);
        if (picked) return [picked, ...sessions];
      }
      return sessions;
    },
    retry: false,
  });
  const data = report.data;
  const copy = async () => {
    if (!data) return;
    try {
      await copyText(data.text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t`The report could not be copied. Use Download report instead.`);
    }
  };
  const download = () => {
    if (data) downloadText(data.text, 'text/plain;charset=utf-8', data.filename);
  };
  const pickConversation = (value: string) => {
    setConversationId(value === NO_CONVERSATION ? '' : value);
    setIncludeMessages(false);
  };
  return (
    <div>
      <SettingsSectionHeading title={t`Report a problem`} />
      <p className={cn('mt-1 mb-2 text-menu text-pretty text-muted-foreground', SETTINGS_COLUMN)}>
        {t`The report holds the ${ph({ wordmark: brand.wordmark })} version, its health checks and its recent log. Passwords, keys and tokens are removed before you see it.`}
      </p>
      <SettingsGroupLabel>{t`About a conversation`}</SettingsGroupLabel>
      <SettingsRow
        htmlFor="report-conversation"
        note={t`Optional. Adds the outcome of its recent replies.`}
        title={t`Conversation`}
        wideControl
      >
        <Select onValueChange={pickConversation} value={conversationId || NO_CONVERSATION}>
          <SelectTrigger
            aria-label={t`Conversation`}
            className={SELECT_TRIGGER}
            id="report-conversation"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={NO_CONVERSATION}>{t`No conversation`}</SelectItem>
            {(recent.data ?? []).map((session) => (
              <SelectItem key={session.id} value={session.id}>
                <span className="block max-w-[320px] truncate">
                  {session.title.trim() || t`Untitled conversation`}
                </span>
              </SelectItem>
            ))}
            {conversationId && !recent.data?.some((item) => item.id === conversationId) ? (
              <SelectItem value={conversationId}>{t`The conversation you came from`}</SelectItem>
            ) : null}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow
        htmlFor={includeId}
        inlineControl
        note={t`Off: only reply errors are included, never what was written.`}
        title={t`Include this conversation’s messages`}
      >
        <Checkbox
          checked={includeMessages}
          disabled={!conversationId}
          id={includeId}
          onCheckedChange={(checked) => setIncludeMessages(checked === true)}
        />
      </SettingsRow>
      <SettingsGroupLabel
        className={SETTINGS_COLUMN}
        actions={
          <>
            <Button
              disabled={!data}
              onClick={() => void copy()}
              size="sm"
              type="button"
              variant="outline"
            >
              {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
              {copied ? t`Copied` : t`Copy report`}
            </Button>
            <Button disabled={!data} onClick={download} size="sm" type="button">
              <DownloadIcon aria-hidden="true" />
              {t`Download report`}
            </Button>
          </>
        }
      >
        {t`Report`}
      </SettingsGroupLabel>
      <ReportBody
        data={data}
        error={report.isError}
        loading={report.isPending}
        onRetry={() => void report.refetch()}
        onShowMore={() =>
          setLines((current) => Math.min(current * 2, data?.logs.max_lines ?? current))
        }
        refreshing={report.isFetching && !report.isPending}
      />
    </div>
  );
}

function ReportBody({
  data,
  error,
  loading,
  refreshing,
  onRetry,
  onShowMore,
}: {
  data: ProblemReport | undefined;
  error: boolean;
  loading: boolean;
  refreshing: boolean;
  onRetry: () => void;
  onShowMore: () => void;
}) {
  if (loading) return <StateView kind="loading" size="row" title={t`Preparing the report…`} />;
  if (error && !data)
    return (
      <StateView
        action={{ label: t`Retry`, onClick: onRetry }}
        kind="error"
        size="row"
        title={t`The report could not be prepared. This service may be too old to offer it.`}
      />
    );
  if (!data) return null;
  return <ReportPreview onShowMore={onShowMore} refreshing={refreshing} report={data} />;
}
