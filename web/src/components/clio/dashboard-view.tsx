import { useMemo, useRef } from 'react';
import { dashboardReportSchema, type DashboardReport } from '@clio/core/v3';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import { loadSessionReviewRenderer } from '@/lib/session-export/renderer-assets';
import { ClioA2UISurface } from './a2ui-surface';
import { ArtifactReferenceContext } from './artifact-reference-context';
import { A2uiRegionCaptureProvider, captureRenderedSurfacePng } from './a2ui-region-capture';
import { SurfaceToolbar } from './surface-toolbar';
import { downloadBlob, downloadUrl, filenameStemFromTitle } from './surface-export';
import { ResourceUnavailable } from './resource-states';
import { useSavedA2uiCatalogs } from '@/lib/a2ui/saved-catalogs';

/** Open a compiled dashboard through the ordinary side-panel artifact viewer. */
export function DashboardResourceView({
  content,
  artifactId,
}: {
  content: string;
  artifactId: string;
}) {
  let report: DashboardReport | undefined;
  try {
    const parsed = dashboardReportSchema.safeParse(JSON.parse(content));
    if (parsed.success) report = parsed.data;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  if (report) return <DashboardView report={report} artifactId={artifactId} />;
  return (
    <ResourceUnavailable
      label="Dashboard unavailable"
      detail="The saved dashboard definition is invalid."
    />
  );
}

/** A full A2UI system: catalog navigation and bindings stay inside one shared model. */
export function DashboardView({
  report,
  artifactId,
  offline = false,
}: {
  report: DashboardReport;
  artifactId?: string;
  offline?: boolean;
}) {
  const root = useRef<HTMLElement>(null);
  const surface = useMemo(() => structuredClone(report.surface), [report.surface]);
  const catalogRegistry = useSavedA2uiCatalogs(report.session_id);
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const filename = filenameStemFromTitle(report.title);
  const components = report.definition.components;
  const modalTriggers = new Set(
    Array.isArray(components)
      ? components
          .filter(
            (component) =>
              component?.component === 'Modal' && typeof component.trigger === 'string',
          )
          .map((component) => component.trigger as string)
      : [],
  );
  const reference = {
    uri: artifactId ? `artifact://${artifactId}` : '',
    definition_path: report.definition_path,
    title: report.title,
  };
  const exportHtml = async () => {
    if (!artifactId) throw new Error('This dashboard has no saved artifact identity.');
    const snapshot = await repository.captureDashboard(report.session_id, [report.surface]);
    const prepared = await repository.prepareDashboardExport(
      report.session_id,
      artifactId,
      await loadSessionReviewRenderer(),
      snapshot,
    );
    downloadUrl(
      `${settings.endpoint.replace(/\/$/u, '')}${prepared.download_path}`,
      prepared.filename,
    );
  };
  return (
    <ArtifactReferenceContext.Provider value={reference}>
      <A2uiRegionCaptureProvider surface={surface}>
        <article
          ref={root}
          data-slot="a2ui-dashboard"
          className="group relative min-w-0 space-y-5 bg-background p-4 text-foreground"
        >
          <header className="flex flex-wrap items-start gap-3 border-b pb-4">
            <div className="min-w-0 flex-1 basis-64">
              <p className="text-xs text-muted-foreground">Dashboard</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{report.title}</h1>
            </div>
            {!offline && (
              <SurfaceToolbar
                floating={false}
                capabilities={{
                  captureWholeSurface: true,
                  captureComponentId: 'root',
                  imageAttention: true,
                  buildReference: () => ({
                    title: report.title,
                    summary: 'Whole dashboard',
                    markdown: `**${report.title}**\nWhole dashboard.`,
                    query: { report_id: report.id },
                  }),
                  exportFormats: [
                    {
                      id: 'png',
                      label: 'PNG image (displayed view)',
                      run: async () => {
                        if (!root.current) throw new Error('The dashboard is not displayed.');
                        downloadBlob(
                          await captureRenderedSurfacePng(root.current),
                          `${filename}.png`,
                        );
                      },
                    },
                    { id: 'html', label: 'HTML dashboard (all tabs and data)', run: exportHtml },
                  ],
                }}
              />
            )}
          </header>
          <ClioA2UISurface
            surface={surface}
            catalogRegistry={catalogRegistry}
            readOnly
            onRemoteAction={async ({ action }) => {
              // Modal opens locally. Its trigger Button's required action is
              // not a command against a live chat surface for this saved artifact.
              if (modalTriggers.has(action.sourceComponentId)) return;
              throw new Error('Reference this dashboard in the conversation to ask the agent.');
            }}
          />
        </article>
      </A2uiRegionCaptureProvider>
    </ArtifactReferenceContext.Provider>
  );
}
