import { readThemeColor, readThemeFont } from '@/theme/runtime';
import { categoryPalette } from './category-colors';
import { isJsonObject } from './chart-spec-guard';

/**
 * Quiet, readable defaults shared by presets, authored charts and offline
 * dashboards, in the active theme's colors and interface typeface. A single
 * series takes the first chart token (the theme's accent); categories take
 * the shared category palette; continuous color takes the value scale.
 */
export function chartPresentationConfig() {
  const ink = readThemeColor('foreground');
  const muted = readThemeColor('muted-foreground');
  const grid = readThemeColor('border');
  const ramp = [
    readThemeColor('scale-low'),
    readThemeColor('scale-mid'),
    readThemeColor('scale-high'),
  ];
  return {
    background: 'transparent',
    font: readThemeFont('typeface-ui'),
    numberFormat: '~r',
    tooltipFormat: { numberFormat: '.8~r' },
    range: { category: categoryPalette(), ramp, heatmap: ramp },
    mark: { color: readThemeColor('chart-1') },
    style: { 'guide-label': { fill: muted }, 'guide-title': { fill: ink } },
    view: { stroke: null },
    scale: { continuousPadding: 12 },
    axis: {
      domain: false,
      ticks: false,
      gridColor: grid,
      gridOpacity: 0.35,
      tickCount: 4,
      labelColor: muted,
      labelFontSize: 13,
      labelBound: true,
      labelPadding: 8,
      titleColor: ink,
      titleFontSize: 13,
      titleFontWeight: 500 as const,
      titlePadding: 14,
    },
    axisX: { grid: false, labelAngle: 0, labelOverlap: 'greedy' as const },
    legend: {
      labelColor: muted,
      labelFontSize: 13,
      titleColor: ink,
      titleFontSize: 12,
      titleFontWeight: 500 as const,
      padding: 8,
      symbolStrokeWidth: 2,
      orient: 'bottom' as const,
    },
    title: {
      color: ink,
      subtitleColor: muted,
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
