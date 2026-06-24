/**
 * Derives a short human activity label (e.g. "running tool", "thinking")
 * from the latest semantic-feed events for status display.
 */
import type { SemanticEventPayload } from '@clio/core';
import { normalizeWhitespace } from './presentationUtils.js';

const REDACTED_RE = /^\[redacted\]:\d+ chars$/i;

export function activityLabelFromSemanticEvents(
  events: SemanticEventPayload[],
): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const label = semanticEventActivityLabel(events[i]);
    if (label) return label;
  }
  return '';
}

function semanticEventActivityLabel(event: SemanticEventPayload | undefined): string {
  if (!event) return '';
  const summary = cleanSummary(event.summary);
  if (summary) return summary;

  const actor = stringField(event.actor, ['agent_title', 'agent_id', 'tool', 'hook']);
  const subject = stringField(event.subject, ['agent_id', 'tool', 'call_id']);
  const tool = stringField(event.actor, ['tool']) || stringField(event.payload, ['tool']);

  switch (event.event_type) {
    case 'blueprint.delegation.started':
      return actor && subject
        ? compact(`Handing work from ${actor} to ${subject}`)
        : 'Handing work to another expert';
    case 'blueprint.delegation.completed':
      return actor ? compact(`${actor} returned evidence`) : 'Expert returned evidence';
    case 'blueprint.delegation.parent_resumed':
      return actor ? compact(`${actor} resumed the workflow`) : 'Workflow resumed';
    case 'tool.call.started':
      return tool ? compact(`Running ${tool}`) : 'Running a tool';
    case 'tool.call.completed':
      return tool ? compact(`${tool} completed`) : 'Tool completed';
    case 'llm.request.started':
      return actor ? compact(`${actor} is planning`) : 'Planning next step';
    case 'hook.invocation.started':
      return actor ? compact(`Running ${actor} hook`) : 'Running hook';
    default:
      return '';
  }
}

function cleanSummary(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = normalizeSummary(normalizeWhitespace(value));
  if (!text || REDACTED_RE.test(text)) return '';
  return compact(text);
}

function normalizeSummary(text: string): string {
  return text
    .replace(/\bdelegated sync work to\b/gi, 'handed work to')
    .replace(/\bdelegated async work to\b/gi, 'handed work to')
    .replace(/\bdelegated work to\b/gi, 'handed work to')
    .replace(/\bdelegate\.started\b/gi, 'started')
    .replace(/\bdelegate\.completed\b/gi, 'returned')
    .replace(/\bparent\.resumed\b/gi, 'resumed')
    .replace(/\.$/, '');
}

function stringField(
  record: Record<string, unknown> | undefined,
  keys: string[],
): string {
  if (!record) return '';
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const text = value.trim();
    if (!text || REDACTED_RE.test(text)) continue;
    return text;
  }
  return '';
}

function compact(text: string): string {
  const clean = normalizeWhitespace(text);
  if (clean.length <= 92) return clean;
  return `${clean.slice(0, 89).trimEnd()}...`;
}
