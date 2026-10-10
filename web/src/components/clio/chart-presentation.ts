import { CATEGORY_COLORS } from './category-colors';
import { isJsonObject } from './chart-spec-guard';

/** Quiet, readable defaults shared by presets, authored charts and offline dashboards. */
export function chartPresentationConfig(dark: boolean) {
  const ink = dark ? '#e2e8f0' : '#172033';
  const muted = dark ? '#a8b4c6' : '#526174';
  const grid = dark ? '#334155' : '#e2e8f0';
  return {
    background: 'transparent',
    font: 'Inter, system-ui, sans-serif',
    numberFormat: ',~g',
    tooltipFormat: { numberFormat: ',.8~g' },
    range: { category: [...CATEGORY_COLORS] },
    view: { stroke: null },
    axis: {
      domain: false,
      ticks: false,
      gridColor: grid,
      gridOpacity: 0.65,
      labelColor: muted,
      labelFontSize: 12,
      labelPadding: 8,
      titleColor: ink,
      titleFontSize: 12,
      titleFontWeight: 500 as const,
      titlePadding: 14,
    },
    legend: {
      labelColor: muted,
      labelFontSize: 12,
      titleColor: ink,
      titleFontSize: 12,
      titleFontWeight: 500 as const,
      padding: 8,
      symbolStrokeWidth: 2,
      orient: 'bottom' as const,
    },
    title: {
      color: ink,
      fontSize: 16,
      fontWeight: 600 as const,
      anchor: 'start' as const,
      offset: 16,
    },
    text: { color: ink, fontSize: 12 },
    line: { strokeWidth: 2.5 },
    point: { size: 56 },
  };
}

/** Authored side legends need room; the shared default sits below the plot. */
export function chartSideLegendSpace(spec: Record<string, unknown>): number {
  const config = isJsonObject(spec.config) ? spec.config : {};
  const orient = isJsonObject(config.legend) ? config.legend.orient : undefined;
  const hasSideLegend = (node: Record<string, unknown>): boolean => {
    const guides = isJsonObject(node.encoding) ? Object.values(node.encoding) : [];
    if (
      guides.some((guide) => {
        if (!isJsonObject(guide) || guide.legend === null) return false;
        const position = isJsonObject(guide.legend) ? (guide.legend.orient ?? orient) : orient;
        return position === 'right' || position === 'left';
      })
    )
      return true;
    for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) {
      if (
        Array.isArray(node[key]) &&
        node[key].some((child) => isJsonObject(child) && hasSideLegend(child))
      )
        return true;
    }
    return isJsonObject(node.spec) && hasSideLegend(node.spec);
  };
  return hasSideLegend(spec) ? 112 : 0;
}
