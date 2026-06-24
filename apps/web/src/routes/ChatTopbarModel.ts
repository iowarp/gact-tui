/**
 * Pure topbar derivations: summarises the running-tools list into the chip
 * model (label, visible names, progress, overflow) for the topbar readout.
 */
import type { RunningTool } from '../live.js';

export interface RunningToolsChipSummary {
  title: string;
  visibleNames: string;
  progressPercent: number | null;
  overflowCount: number;
}

export function runningToolsChipSummary(tools: RunningTool[]): RunningToolsChipSummary | null {
  if (tools.length === 0) return null;
  const first = tools[0];
  return {
    title: tools
      .map((tool) => `${tool.toolName}${tool.progressMessage ? ' — ' + tool.progressMessage : ''}`)
      .join('\n'),
    visibleNames: tools
      .slice(0, 2)
      .map((tool) => tool.toolName)
      .join(', '),
    progressPercent: first?.progress != null ? Math.round(first.progress * 100) : null,
    overflowCount: Math.max(0, tools.length - 2),
  };
}
