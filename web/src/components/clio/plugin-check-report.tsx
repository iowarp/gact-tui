import type { PluginCheckReport } from '@clio/core/v3';
import { useEffect, useRef } from 'react';
import { CloseIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import { StatusIndicator } from './primitives/status-indicator';

/** The plugin check verdict, per failing plugin, with the full report on request. */
export function CheckReport({
  report,
  onClose,
}: {
  report: PluginCheckReport;
  onClose: () => void;
}) {
  const failed = report.targets.filter((target) => !target.ok);
  const section = useRef<HTMLElement>(null);
  // The menu that asked for the check sits above; on a phone the report lands below the fold.
  useEffect(() => {
    section.current?.scrollIntoView({ block: 'nearest' });
  }, [report]);
  return (
    <section
      aria-label="Plugin check results"
      className="mt-4 grid gap-2 rounded-lg border border-border p-3 text-ui"
      ref={section}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <h2 className="min-w-0 truncate font-medium" title={report.source}>
          Plugin check: {report.source}
        </h2>
        <StatusIndicator
          label={report.ok ? 'Passed' : 'Failed'}
          tone={report.ok ? 'success' : 'error'}
        />
        <span className="text-xs whitespace-nowrap text-faint">
          {report.targets.length - failed.length} of {report.targets.length} passed
        </span>
        <span className="flex-1" />
        <IconButton icon={<CloseIcon />} label="Close check results" onClick={onClose} />
      </div>
      {[...report.diagnostics, ...failed.flatMap((target) => target.diagnostics)].length ? (
        <ul className="grid gap-1">
          {report.diagnostics.map((row, index) => (
            <li key={`report:${index}`}>
              <span className="font-medium">{row.severity}</span>: {row.message}
            </li>
          ))}
          {failed.map((target) => (
            <li key={`${target.kind}:${target.id}`}>
              <span className="font-medium">
                {target.kind} {target.id}
              </span>
              <ul className="ml-4 list-disc text-muted-foreground">
                {target.diagnostics.map((row, index) => (
                  <li key={`${row.code}:${index}`}>
                    {row.message} <span className="font-mono">[{row.code}]</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">No problems found.</p>
      )}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">Full report</summary>
        <pre className="mt-1 max-h-72 overflow-auto font-mono whitespace-pre-wrap">
          {report.text}
        </pre>
      </details>
    </section>
  );
}
