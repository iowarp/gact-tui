import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { Frame, FramePanel } from '@/components/reui/frame';
import { useRepository } from '@/hooks/use-repository';
import {
  a2uiAccessibilityDescription,
  a2uiAccessibilityLabel,
  type A2UIAccessibility,
} from './a2ui-accessibility';
import { ClioTimeSeriesPlot, type PlotRow } from './time-series-plot';

const plotValue = z.union([z.string(), z.number(), z.null()]);

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
  const artifactId = artifactIdFromDataUri(dataUri);
  const preview = useQuery({
    enabled: Boolean(artifactId),
    queryKey: ['artifact-table-preview', artifactId, xKey, ...yKeys],
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

const schema = z
  .object({
    series: z.array(z.record(plotValue)).max(10_000).optional(),
    dataUri: z.string().optional(),
    xKey: z.string(),
    yKeys: z.array(z.string()).min(1).max(5),
    title: CommonSchemas.DynamicString.optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict()
  .refine((value) => Boolean(value.series) !== Boolean(value.dataUri), {
    message: 'Provide exactly one of series or dataUri',
  });

// The catalog adapter is intentionally thin; interaction belongs to the shared plot.
// oxlint-disable-next-line react/only-export-components
export const ClioTimeSeriesCatalogComponent = createComponentImplementation(
  { name: 'clio.time-series.v1', schema },
  ({ props }) => (
    <ClioA2UITimeSeries
      accessibility={props.accessibility}
      dataUri={props.dataUri}
      rows={props.series as PlotRow[] | undefined}
      title={props.title}
      xKey={props.xKey}
      yKeys={props.yKeys}
    />
  ),
);
