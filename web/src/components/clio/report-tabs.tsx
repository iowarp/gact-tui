import type { ToolPresentationBlock } from '@clio/core/v3';
import { MarkdownText } from '@/components/ai-elements/markdown';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { clioStatusLabel, type ClioStatusValue } from './status';
import { t, ph } from '@lingui/core/macro';

function statusWords(block: ToolPresentationBlock): string {
  if (block.status === 'pending') return t`Still running`;
  if (!block.status) return block.severity === 'error' ? t`Could not collect` : t`No outcome`;
  return clioStatusLabel(block.status as ClioStatusValue) || block.status;
}

/**
 * One tab per child of a wait or a blocking spawn: the tab names the child and says its
 * status in words; the panel shows the model it ran on and its report. Shared by
 * ``wait_tasks`` and ``spawn_agents_parallel(wait=true)``.
 */
export function ReportTabs({ reports }: { reports: readonly ToolPresentationBlock[] }) {
  const first = reports[0]?.id;
  if (!first) return null;
  return (
    <Tabs defaultValue={first} className="min-w-0" data-slot="report-tabs">
      <TabsList className="h-auto max-w-full flex-wrap justify-start" aria-label={t`Reports`}>
        {reports.map((report) => (
          <TabsTrigger className="gap-1 text-xs" key={report.id} value={report.id}>
            <span className="max-w-40 truncate">{report.title || report.label || report.id}</span>
            <span className="text-muted-foreground">{statusWords(report)}</span>
          </TabsTrigger>
        ))}
      </TabsList>
      {reports.map((report) => (
        <TabsContent className="mt-2 min-w-0" key={report.id} value={report.id}>
          {report.model ? (
            <p className="mb-1 text-xs text-muted-foreground">{t`Ran on ${ph({ model: report.model })}`}</p>
          ) : null}
          {report.severity === 'error' ? (
            <p role="alert" className="whitespace-pre-wrap text-sm text-destructive">
              {report.text}
            </p>
          ) : (
            <div className="min-w-0 text-sm">
              <MarkdownText mode="static">{report.text ?? ''}</MarkdownText>
            </div>
          )}
          {report.detail ? (
            <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">
              {report.detail}
            </p>
          ) : null}
        </TabsContent>
      ))}
    </Tabs>
  );
}
