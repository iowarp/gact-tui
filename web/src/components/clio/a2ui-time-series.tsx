import { queryKeys } from '@/lib/query-keys';
import { useQuery } from '@tanstack/react-query';
import { Frame, FramePanel } from '@/components/reui/frame';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { ClioTimeSeriesPlot, type PlotRow } from './time-series-plot';

function artifactIdFromDataUri(uri: string): string | undefined {
  const match = /^artifact:\/\/(artifact_[A-Za-z0-9_-]+)$/u.exec(uri);
  return match?.[1];
}

function ArtifactTimeSeries({
  dataUri,
  title,
  xKey,
  yKeys,
  accessibility,
}: {
  accessibility?: A2UIAccessibility;
  dataUri: string;
  title?: string;
  xKey: string;
  yKeys: string[];
}) {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const artifactId = artifactIdFromDataUri(dataUri);
  const preview = useQuery({
    enabled: Boolean(artifactId),
    queryKey: queryKeys.key('artifact-table-preview', settings.endpoint, artifactId, xKey, ...yKeys),
    queryFn: ({ signal }) =>
      repository.artifactTablePreview(artifactId!, [xKey, ...yKeys], 1_000, signal),
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (!artifactId) {
    return (
      <Frame spacing="sm">
        <FramePanel className="text-sm text-destructive">
          Plot unavailable: the data source is not a registered artifact id.
        </FramePanel>
      </Frame>
    );
  }
  if (preview.isPending) {
    return (
      <Frame spacing="sm">
        <FramePanel className="text-sm text-muted-foreground">Loading chart data…</FramePanel>
      </Frame>
    );
  }
  if (preview.isError) {
    return (
      <Frame spacing="sm">
        <FramePanel className="text-sm text-destructive">
          Plot unavailable: {preview.error.message}
        </FramePanel>
      </Frame>
    );
  }
  return (
    <ClioTimeSeriesPlot
      accessibilityDescription={a2uiAccessibilityDescription(accessibility)}
      accessibilityLabel={a2uiAccessibilityLabel(accessibility)}
      rows={preview.data.rows as PlotRow[]}
      sourceRows={preview.data.total_rows}
      title={title}
      truncated={preview.data.truncated}
      xKey={xKey}
      yKeys={yKeys}
    />
  );
}

export function ClioA2UITimeSeries({
  dataUri,
  rows,
  title,
  xKey,
  yKeys,
  accessibility,
}: {
  accessibility?: A2UIAccessibility;
  dataUri?: string;
  rows?: PlotRow[];
  title?: string;
  xKey: string;
  yKeys: string[];
}) {
  if (dataUri) {
    return (
      <ArtifactTimeSeries
        accessibility={accessibility}
        dataUri={dataUri}
        title={title}
        xKey={xKey}
        yKeys={yKeys}
      />
    );
  }
  return (
    <ClioTimeSeriesPlot
      accessibilityDescription={a2uiAccessibilityDescription(accessibility)}
      accessibilityLabel={a2uiAccessibilityLabel(accessibility)}
      rows={rows ?? []}
      title={title}
      xKey={xKey}
      yKeys={yKeys}
    />
  );
}
