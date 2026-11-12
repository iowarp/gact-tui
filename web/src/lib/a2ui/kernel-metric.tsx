import {
  a2uiAccessibilityProps,
  type A2UIAccessibility,
} from '@/components/clio/a2ui-accessibility';
import { useDashboardPresentation } from '@/components/clio/dashboard-presentation';
import { dataViewFlexStyle } from '@/components/clio/data-view-layout';
import { copyTextToClipboard } from '@/components/clio/surface-export';
import { SurfaceToolbar, type SurfaceCapabilities } from '@/components/clio/surface-toolbar';

/** One `clio.metric.v1` figure: a card in a surface, an inline stat in a dashboard. */
export function MetricView(props: {
  accessibility?: A2UIAccessibility;
  detail?: string;
  label: string;
  trend?: string;
  unit?: string;
  value: unknown;
  weight?: number;
}) {
  const dashboard = useDashboardPresentation();
  // G0 row for clio.metric.v1: "copy value; Reference this." (No query/
  // filter/selection concept applies to a single scalar, so only `onCopy`
  // is declared here — Reference this is scoped to data views that can
  // describe a zone, which a bare metric cannot.)
  const metricCapabilities: SurfaceCapabilities = {
    onCopy: () =>
      copyTextToClipboard(`${String(props.value)}${props.unit ? ` ${props.unit}` : ''}`),
  };
  if (dashboard) {
    // A dashboard stat: an 18px figure over an 11px label, inline with its row.
    // In a narrow dashboard the stats stack and each reads figure then label.
    // A unit the label already names is not repeated. There, on touch, a stat's actions
    // wait for a tap on it (spec 390 fold), as a pointer's wait for hover.
    const unit =
      props.unit && !props.label.toLowerCase().includes(props.unit.toLowerCase())
        ? props.unit
        : undefined;
    const value = `${String(props.value)}${unit ? ` ${unit}` : ''}`;
    const note = [props.trend, props.detail].filter(Boolean).join(', ');
    return (
      <div
        {...a2uiAccessibilityProps(props.accessibility)}
        className="group group/stat relative min-w-0 outline-none @max-[24rem]/dashboard:flex @max-[24rem]/dashboard:items-baseline @max-[24rem]/dashboard:gap-2 @max-[24rem]/dashboard:pe-16"
        data-slot="a2ui-stat"
        role="group"
        style={dataViewFlexStyle(props.weight)}
        tabIndex={-1}
        title={[`${props.label}: ${value}`, note].filter(Boolean).join('\n')}
      >
        <span className="contents [@media(hover:none)]:@max-[24rem]/dashboard:invisible [@media(hover:none)]:@max-[24rem]/dashboard:group-focus-within/stat:visible">
          <SurfaceToolbar capabilities={metricCapabilities} />
        </span>
        <p className="truncate text-welcome font-semibold leading-tight tabular-nums text-foreground @max-[24rem]/dashboard:shrink-0">
          {String(props.value)}
          {unit ? (
            <span className="ml-1 text-caption font-normal text-muted-foreground">{unit}</span>
          ) : null}
        </p>
        {/* A narrow cell wraps the label between words rather than cutting it. */}
        <p className="line-clamp-2 text-caption leading-snug text-muted-foreground">
          {props.label}
          {note ? <span className="sr-only">, {note}</span> : null}
        </p>
      </div>
    );
  }
  return (
    <div
      {...a2uiAccessibilityProps(props.accessibility)}
      className="group relative min-w-0 rounded-lg border border-t-2 border-t-foreground/50 bg-card/70 p-4"
      style={dataViewFlexStyle(props.weight)}
      role="group"
    >
      <SurfaceToolbar capabilities={metricCapabilities} />
      <p className="text-sm font-medium text-muted-foreground">{props.label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
        {String(props.value)}
        {props.unit ? (
          <span className="ml-1 text-sm text-muted-foreground">{props.unit}</span>
        ) : null}
      </p>
      {props.trend || props.detail ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {[props.trend, props.detail].filter(Boolean).join(', ')}
        </p>
      ) : null}
    </div>
  );
}
