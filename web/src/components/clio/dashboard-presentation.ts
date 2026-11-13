import { createContext, useContext, useMemo } from 'react';
import { readThemeColor, useThemeKey } from '@/theme/runtime';
import { isJsonObject } from './chart-spec-guard';
import { t } from '@lingui/core/macro';

/**
 * Set by a saved dashboard. Its metrics read as one compact stat row, and its
 * charts keep a compact title (two lines at most in a narrow pane) with the
 * units in a caption instead of axis titles. Every other surface keeps the
 * shared presentation.
 */
export const DashboardPresentationContext = createContext(false);

export function useDashboardPresentation(): boolean {
  return useContext(DashboardPresentationContext);
}

type Spec = Record<string, unknown>;

const POSITION_CHANNELS = ['x', 'y', 'x2', 'y2'] as const;
const COMPOSITION_KEYS = ['layer', 'concat', 'hconcat', 'vconcat'] as const;

function markType(mark: unknown): string | undefined {
  if (typeof mark === 'string') return mark;
  return isJsonObject(mark) && typeof mark.type === 'string' ? mark.type : undefined;
}

/** A constant rule without an authored color: a baseline or threshold line. */
function isReferenceRule(node: Spec): boolean {
  if (markType(node.mark) !== 'rule') return false;
  if (isJsonObject(node.mark) && (node.mark.color !== undefined || node.mark.stroke !== undefined))
    return false;
  const encoding = isJsonObject(node.encoding) ? node.encoding : {};
  if (encoding.color !== undefined || encoding.stroke !== undefined) return false;
  return POSITION_CHANNELS.every((channel) => {
    const value = encoding[channel];
    return !isJsonObject(value) || value.field === undefined;
  });
}

function axisTitle(channel: Record<string, unknown>): string | undefined {
  if (channel.axis === null) return undefined;
  const authored = isJsonObject(channel.axis)
    ? (channel.axis.title ?? channel.title)
    : channel.title;
  if (typeof authored === 'string' && authored.trim()) return authored.trim();
  if (authored !== undefined || typeof channel.field !== 'string') return undefined;
  return channel.field.replaceAll('_', ' ');
}

function withoutAxisTitles(
  node: Spec,
  titles: { x: string[]; y: string[] },
  referenceColor: string,
): Spec {
  const next: Spec = { ...node };
  if (isJsonObject(node.encoding)) {
    const encoding = { ...node.encoding };
    for (const axis of ['x', 'y'] as const) {
      const channel = encoding[axis];
      if (!isJsonObject(channel)) continue;
      const title = axisTitle(channel);
      if (title && channel.type === 'quantitative' && !titles[axis].includes(title))
        titles[axis].push(title);
      encoding[axis] = {
        ...channel,
        title: null,
        ...(isJsonObject(channel.axis) ? { axis: { ...channel.axis, title: null } } : {}),
      };
    }
    next.encoding = encoding;
  }
  if (isReferenceRule(node)) {
    next.mark = {
      ...(isJsonObject(node.mark) ? node.mark : { type: 'rule' }),
      color: referenceColor,
    };
  }
  for (const key of COMPOSITION_KEYS) {
    const children = node[key];
    if (Array.isArray(children)) {
      next[key] = children.map((child) =>
        isJsonObject(child) ? withoutAxisTitles(child, titles, referenceColor) : child,
      );
    }
  }
  if (isJsonObject(node.spec)) next.spec = withoutAxisTitles(node.spec, titles, referenceColor);
  return next;
}

/**
 * A dashboard chart without axis titles; their quantitative units move to the
 * caption. Constant reference rules default to the theme's warning color.
 */
export function dashboardChartSpec(
  spec: Spec,
  referenceColor: string,
): { spec: Spec; caption?: string } {
  const titles = { x: [] as string[], y: [] as string[] };
  const next = withoutAxisTitles(spec, titles, referenceColor);
  const y = titles.y.join(', ');
  const x = titles.x.join(', ');
  const caption = y && x ? t`${y} against ${x}` : y || x || undefined;
  return { spec: next, caption };
}

/** The dashboard form of a built chart spec, or the spec unchanged elsewhere. */
export function useDashboardChartSpec(spec: Spec | undefined): {
  spec: Spec | undefined;
  caption?: string;
} {
  const dashboard = useDashboardPresentation();
  // Subscribing re-renders on a theme change, so the reference color is re-read.
  useThemeKey();
  const referenceColor = dashboard ? readThemeColor('warning') : '';
  return useMemo(
    () => (dashboard && spec ? dashboardChartSpec(spec, referenceColor) : { spec }),
    [dashboard, referenceColor, spec],
  );
}
