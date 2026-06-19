import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount, type JSX } from 'solid-js';
import { brand } from '@brand';
import type { FileDiff, Message, Part } from '@clio/core';
import { Icon, type IconName } from './Icon.js';
import { InlineMarkdown } from './InlineMarkdown.js';
import {
  summarizeToolResultPresentation,
  toolInputRows,
  type StructuredResultPresentation,
} from '../presentation.js';
import type { ExecutionTranscriptEvent } from '../live.js';
import type { ModelOption } from './Composer.js';
import './transcript.css';
import './inline-markdown.css';

export type TranscriptDensity = 'verbose' | 'normal' | 'summary';

export interface TranscriptProps {
  messages: Message[];
  /** True while the message list is loading (session switch) — renders
   * skeleton bubbles instead of a blank pane (W3 Tier-1). */
  loading?: boolean;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  /** Optional per-message action callbacks. Wired in LiveDriven mode. */
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  /** Retry variants (1.0 item 4). When either is provided the Regenerate
   * button opens a variant menu instead of firing immediately; clio's
   * retry route accepts `notes` and `provider_id`/`model_id` overrides. */
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  /** Available models for the "Regenerate with model" submenu. */
  models?: ModelOption[];
  onEdit?: (msg: Message) => void;
  onQuote?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  /** Currently-focused message id (drives the Inspector). */
  selectedId?: string;
  onSelect?: (msg: Message) => void;
  /** Cmd+F highlight state. */
  searchQuery?: string;
  /** Match identifier "<message_id>:<index>" pointing at the focused hit. */
  currentMatchKey?: string;
  /** When true, the last text part of the last assistant message renders a streaming cursor. */
  streaming?: boolean;
  /** When set, assistant messages render a Speak button that pulls
   * TTS audio from POST /v1/sessions/{id}/voice/synthesize. */
  onSpeak?: (msg: Message) => void | Promise<void>;
  /** When set, renders a copy-link action that calls back with the
   * message id; ChatScreen wraps it into a `clio://session/<sid>#<mid>`
   * permalink and writes to the clipboard. */
  onCopyPermalink?: (msg: Message) => void | Promise<void>;
  /** The scrollable ancestor (ChatScreen's `chat__pane`). Required for
   * virtual windowing of very large transcripts (1.0 item 6) — without it
   * (or below the threshold) every message renders, exactly as before. */
  scrollEl?: HTMLElement;
  /**
   * A2 — backend advertises capabilities.multimodal_image_parts. When
   * explicitly false, image parts render an honest "image not supported
   * by this backend" placeholder instead of an inline <img>. Defaults to
   * true (absent capability is treated as allowed).
   */
  imagePartsSupported?: boolean;
  /** Chronological CLIO execution ledger. When present, assistant execution
   * renders as one interleaved timeline instead of separate semantic/message
   * blocks. Shared by web and desktop. */
  executionEvents?: ExecutionTranscriptEvent[];
}

// ---- Virtual windowing (1.0 item 6) ----
// Past this many messages only the on-screen slice (+ buffer) renders;
// spacer divs preserve the scroll geometry so the scrollbar, autoscroll
// and jump-to-bottom keep working. Below the threshold behavior is
// byte-identical to the original full render.
const VIRTUAL_THRESHOLD = 150;
const VIRTUAL_BUFFER = 10;
const EST_HEIGHT = 132;
/** Flex gap between .trx children — included in per-message height. */
const TRX_GAP = 24;

const ROLE_ICON: Record<string, IconName> = {
  user: 'user',
  assistant: 'bot',
  system: 'help',
  tool: 'tool',
};

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: brand.name,
  system: 'System',
  tool: 'Tool',
};

interface ProjectedExecutionNode {
  kind: 'text' | 'handoff' | 'step' | 'report';
  agent: string;
  parent?: string;
  depth: number;
  text?: string;
  question?: string;
  toolName?: string;
  toolArgs?: unknown;
  observation?: unknown;
  isFinish?: boolean;
  reasoning?: string;
  structured?: unknown;
}

function projectedTranscriptMessages(
  messages: Message[],
  events?: ExecutionTranscriptEvent[],
): Message[] {
  const turns = projectWebExecutionTurns(events ?? []);
  if (turns.length === 0) return messages;
  const keyed = new Map(turns.filter((turn) => turn.turnId).map((turn) => [turn.turnId, turn.nodes]));
  const unscoped = turns.filter((turn) => !turn.turnId).map((turn) => turn.nodes);
  const supplements = assistantSupplementNodesByTurn(messages);
  let unscopedIdx = 0;
  const projected: Message[] = [];
  for (const message of messages) {
    if (message.role !== 'user') continue;
    projected.push(message);
    let nodes = keyed.get(message.id);
    if (!nodes && unscopedIdx < unscoped.length) {
      nodes = unscoped[unscopedIdx++];
    }
    const turnSupplements = supplements.get(message.id) ?? [];
    if (turnSupplements.length) {
      nodes = dedupeProjectedSupplements(nodes ?? [], turnSupplements);
    }
    if (nodes?.length) {
      projected.push({
        id: `execution-projected-assistant-${message.id}`,
        role: 'assistant',
        parts: [{ type: 'text', text: formatProjectedExecution(nodes) }],
      } satisfies Message);
    }
  }
  for (; unscopedIdx < unscoped.length; unscopedIdx++) {
    const nodes = unscoped[unscopedIdx];
    if (!nodes) continue;
    projected.push({
      id: `execution-projected-assistant-unscoped-${unscopedIdx}`,
      role: 'assistant',
      parts: [{ type: 'text', text: formatProjectedExecution(nodes) }],
    } satisfies Message);
  }
  return projected;
}

function assistantSupplementNodesByTurn(messages: Message[]): Map<string, ProjectedExecutionNode[]> {
  const out = new Map<string, ProjectedExecutionNode[]>();
  let currentTurnId = '';
  for (const message of messages) {
    if (message.role === 'user') {
      currentTurnId = message.id;
      continue;
    }
    if (message.role !== 'assistant' || !currentTurnId) continue;
    const nodes = assistantSupplementNodes(message);
    if (nodes.length) out.set(currentTurnId, [...(out.get(currentTurnId) ?? []), ...nodes]);
  }
  return out;
}

function assistantSupplementNodes(message: Message): ProjectedExecutionNode[] {
  const nodes: ProjectedExecutionNode[] = [];
  for (const part of message.parts ?? []) {
    if (part.type === 'text') {
      const text = stripControlContracts(part.text ?? '');
      if (text && carriesArtifact(text)) nodes.push({ kind: 'text', agent: 'main', depth: 0, text });
      continue;
    }
    if (part.type === 'expert_handoff') {
      const metadata = objectValue(part.metadata);
      const text = stringValue(part.text);
      const structured = objectValue(metadata['structured']);
      const retained = retainedWorkflowStateFromText(text);
      const node: ProjectedExecutionNode = {
        kind: 'report',
        agent: stringValue(metadata['agent_id']) || stringValue(metadata['delegate_to']) || 'expert',
        parent: stringValue(metadata['parent_id']) || stringValue(metadata['parent']),
        depth: agentDepth(stringValue(metadata['agent_id']) || stringValue(metadata['delegate_to'])),
        text,
        structured: Object.keys(structured).length ? structured : retained,
      };
      const preview = reportPreview(node);
      if (carriesArtifact(preview)) nodes.push({ ...node, text: preview });
      continue;
    }
    if (part.type === 'image') {
      const raw = part as unknown as Record<string, unknown>;
      const path = stringValue(raw['uri']) || stringValue(objectValue(raw['metadata'])['path']);
      nodes.push({
        kind: 'report',
        agent: 'artifact',
        depth: 1,
        text: ['image artifact', path, path ? 'show full image' : ''].filter(Boolean).join('\n'),
      });
    }
  }
  return nodes;
}

function dedupeProjectedSupplements(existing: ProjectedExecutionNode[], supplements: ProjectedExecutionNode[]): ProjectedExecutionNode[] {
  let comparable = existing.map(nodeComparableText).map(normalizeComparable).join(' ');
  const out = [...existing];
  for (const node of supplements) {
    const text = normalizeComparable(nodeComparableText(node));
    if (!text || comparable.includes(text)) continue;
    out.push(node);
    comparable += ` ${text}`;
  }
  return out;
}

function nodeComparableText(node: ProjectedExecutionNode): string {
  return node.text || node.question || '';
}

function normalizeComparable(text: string): string {
  return stripControlContracts(text).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

interface ProjectedExecutionTurn {
  turnId: string;
  nodes: ProjectedExecutionNode[];
}

function projectWebExecutionTurns(events: ExecutionTranscriptEvent[]): ProjectedExecutionTurn[] {
  if (!events.some((e) => ['react.step.completed', 'expert.extract.completed', 'blueprint.delegation.started'].includes(e.type))) {
    return [];
  }
  const buckets = new Map<string, ExecutionTranscriptEvent[]>();
  const firstSequence = new Map<string, number>();
  for (const event of events) {
    const key = event.turnId?.trim() || '__unscoped__';
    buckets.set(key, [...(buckets.get(key) ?? []), event]);
    firstSequence.set(key, Math.min(firstSequence.get(key) ?? event.sequence, event.sequence));
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (firstSequence.get(a) ?? 0) - (firstSequence.get(b) ?? 0))
    .map(([key, bucketEvents]) => ({
      turnId: key === '__unscoped__' ? '' : key,
      nodes: projectWebExecutionTimeline(bucketEvents),
    }))
    .filter((turn) => turn.nodes.length > 0);
}

function projectWebExecutionTimeline(events: ExecutionTranscriptEvent[]): ProjectedExecutionNode[] {
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const nodes: ProjectedExecutionNode[] = [];
  let buffer = '';
  let currentAgent = 'main';
  const handoffQuestions = new Map<string, string>();
  const reportedAgents = new Set<string>();
  const reactStepSpans = new Set<string>();
  for (const event of ordered) {
    if (event.type === 'react.step.completed') {
      const payload = objectValue(event.payload['payload']);
      const span = stringValue(payload['step_span_id']) || stringValue(event.payload['parent_span_id']);
      if (span) reactStepSpans.add(span);
    }
  }
  const flushText = () => {
    const text = buffer.trim();
    buffer = '';
    if (!text) return;
    nodes.push({ kind: 'text', agent: currentAgent || 'main', depth: agentDepth(currentAgent), text });
  };
  for (const event of ordered) {
    if (event.type === 'message.part.delta') {
      const delta = objectValue(event.payload['delta']);
      buffer += stringValue(delta['text_append']);
      continue;
    }
    if (event.type === 'message.part.added') {
      const part = event.part;
      if (part?.type === 'text') {
        buffer += part.text ?? '';
      }
      if (part?.type === 'expert_handoff') {
        const meta = part.metadata ?? {};
        const parent = stringValue(meta['parent_id']) || stringValue(meta['parent']) || 'main';
        const agent = stringValue(meta['agent_id']) || stringValue(meta['delegate_to']);
        const question = stringValue(meta['question']);
        if (agent && question && !isRedacted(question)) {
          handoffQuestions.set(`${parent}->${agent}`, question);
          const existing = nodes.find((n) => n.kind === 'handoff' && n.parent === parent && n.agent === agent && !n.question);
          if (existing) existing.question = question;
        }
      }
      continue;
    }
    if (event.type === 'expert.lifecycle.started') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      currentAgent = stringValue(payload['expert_id']) || stringValue(objectValue(event.payload['actor'])['agent_id']) || currentAgent;
      continue;
    }
    if (event.type === 'blueprint.delegation.started') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      const parent = stringValue(payload['parent_id']) || stringValue(objectValue(event.payload['actor'])['agent_id']) || 'main';
      const agent = stringValue(payload['delegate_to']) || stringValue(payload['agent_id']) || stringValue(objectValue(event.payload['subject'])['agent_id']);
      let question = stringValue(payload['question']);
      if (isRedacted(question)) question = handoffQuestions.get(`${parent}->${agent}`) ?? '';
      nodes.push({ kind: 'handoff', agent, parent, depth: handoffDepth(parent, agent), question });
      if (agent) currentAgent = agent;
      continue;
    }
    if (event.type === 'react.step.completed') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      const agent = stringValue(payload['expert_id']) || stringValue(objectValue(event.payload['actor'])['agent_id']) || currentAgent;
      nodes.push({
        kind: 'step',
        agent,
        depth: agentDepth(agent),
        text: stringValue(payload['thought']),
        reasoning: stringValue(payload['reasoning']),
        toolName: stringValue(payload['tool_name']),
        toolArgs: payload['tool_args'],
        observation: payload['observation'],
        isFinish: Boolean(payload['is_finish']),
      });
      continue;
    }
    if (event.type === 'expert.extract.completed') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      const agent = stringValue(payload['expert_id']) || stringValue(objectValue(event.payload['actor'])['agent_id']) || currentAgent;
      reportedAgents.add(agent);
      nodes.push({
        kind: 'report',
        agent,
        depth: agentDepth(agent),
        text: stringValue(payload['output']) || stringValue(payload['result_summary']),
        structured: payload['structured'],
      });
      continue;
    }
    if (event.type === 'blueprint.delegation.completed') {
      flushText();
      const payload = objectValue(event.payload['payload']);
      const agent = stringValue(payload['delegate_to']) || stringValue(payload['agent_id']) || stringValue(objectValue(event.payload['actor'])['agent_id']);
      const parent = stringValue(payload['return_to']) || stringValue(payload['parent_id']) || stringValue(objectValue(event.payload['subject'])['agent_id']);
      if (reportedAgents.has(agent)) {
        currentAgent = parent || currentAgent;
        continue;
      }
      nodes.push({
        kind: 'report',
        agent,
        parent,
        depth: handoffDepth(parent, agent),
        text: stringValue(payload['output_summary']) || stringValue(payload['return_output_summary']) || stringValue(event.payload['summary']),
      });
      currentAgent = parent || currentAgent;
      continue;
    }
    if ((event.type === 'tool.call.started' || event.type === 'tool.call.completed') && reactStepSpans.size > 0) {
      continue;
    }
    if ((event.type === 'tool.call.started' || event.type === 'tool.call.completed') && reactStepSpans.has(stringValue(event.payload['parent_span_id']))) {
      continue;
    }
  }
  flushText();
  return nodes.filter((n) => !isRedacted(n.text ?? '') && !isRedacted(n.question ?? ''));
}

function formatProjectedExecution(nodes: ProjectedExecutionNode[]): string {
  const rows: string[] = [];
  for (const node of nodes) {
    if (rows.length > 0 && (node.kind === 'text' || node.kind === 'report')) rows.push('');
    const indent = '  '.repeat(Math.max(0, node.depth));
    if (node.kind === 'text') {
      rows.push(`${indent}${node.agent || 'main'}`);
      pushWrapped(rows, node.text ?? '', `${indent}  `);
    } else if (node.kind === 'handoff') {
      rows.push(`${indent}↳ ${node.parent || 'main'} → ${node.agent}`);
      pushWrapped(rows, node.question ?? '', `${indent}  `);
    } else if (node.kind === 'step') {
      const text = node.reasoning ? `${node.text ?? ''} · show reasoning trace` : node.text ?? '';
      pushWrapped(rows, text, indent);
      if (node.toolName && !node.isFinish) {
        rows.push(`${indent}${toolDisplayName(node.toolName)}${formatArgs(node.toolArgs)}`);
        const obs = observationPreview(node.toolName, node.observation);
        if (obs) pushWrapped(rows, `⎿ ${obs}`, `${indent}  `);
      }
    } else if (node.kind === 'report') {
      rows.push(`${indent}${node.agent} returned evidence`);
      pushWrapped(rows, reportPreview(node), `${indent}  `);
    }
  }
  return rows.join('\n').trim();
}

function pushWrapped(rows: string[], text: string, prefix: string) {
  const clean = structuredAgentTextPreview(stripControlContracts(text));
  if (!clean) return;
  for (const line of clean.split('\n')) {
    rows.push(prefix + line);
  }
}

function structuredAgentTextPreview(text: string): string {
  const parsed = objectValue(parseJSON(text) ?? {});
  if (!Object.keys(parsed).some((key) => ['workflow_state', 'catalog', 'acquisition', 'resource_candidate', 'station_catalog', 'profile', 'artifact', 'plot'].includes(key))) {
    return text;
  }
  return reportPreview({ kind: 'report', agent: 'main', depth: 0, structured: parsed, text });
}

function formatArgs(args: unknown): string {
  const obj = objectValue(args);
  const parts = Object.keys(obj).sort().map((key) => `${key}: ${compactValue(obj[key])}`).filter((v) => !isRedacted(v));
  return parts.length ? `(${parts.join(' · ')})` : '';
}

function observationPreview(toolName: string, raw: unknown): string {
  const specific = specificObservationPreview(toolName, raw);
  if (specific) return specific;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw ?? '');
  if (!text || isRedacted(text) || /^(completed|done|ok)$/i.test(text.trim())) return '';
  if (/geocode/i.test(toolName)) {
    const name = /display_name['"]?\s*:\s*['"]([^'"]+)/.exec(text)?.[1];
    const lat = /lat['"]?\s*:\s*([-\d.]+)/.exec(text)?.[1];
    const lon = /lon['"]?\s*:\s*([-\d.]+)/.exec(text)?.[1];
    return [name, lat && lon ? `center ${lat}, ${lon}` : ''].filter(Boolean).join('\n');
  }
  const csv = /[\w.-]+\.csv\b/.exec(text)?.[0];
  if (/ndp_search/i.test(toolName) && csv) return csv;
  if (/local_path/.test(text)) {
    const path = /"local_path"\s*:\s*"([^"]+)"/.exec(text)?.[1];
    const size = /"size_bytes"\s*:\s*(\d+)/.exec(text)?.[1];
    return [path, size ? `${size} bytes` : ''].filter(Boolean).join(' · ');
  }
  return text.length > 240 ? `${text.slice(0, 240)}…\nshow full output` : text;
}

function specificObservationPreview(toolName: string, raw: unknown): string {
  const obj = objectValue(raw);
  const lower = toolName.toLowerCase();
  if (lower.includes('filter_points') || lower.includes('points_by_radius')) {
    const points = Array.isArray(obj['points']) ? obj['points'] : [];
    const rows = [
      stringValue(obj['within_radius_count']) || stringValue(obj['count'])
        ? `${stringValue(obj['within_radius_count']) || stringValue(obj['count'])} stations within radius`
        : '',
      ...points.slice(0, 3).map((rawPoint) => {
        const point = objectValue(rawPoint);
        const id = stringValue(point['Site']) || stringValue(point['site']) || stringValue(point['station']) || stringValue(point['id']);
        const distance = formatDistanceKm(stringValue(point['distance_km']) || stringValue(point['distance']));
        return id ? `${id}${distance ? ` ${distance} km` : ''}` : '';
      }),
      points.length > 3 ? 'show full output' : '',
    ].filter(Boolean);
    return rows.join('\n');
  }
  if (lower.startsWith('ndp_stage')) {
    const path = stringValue(obj['local_path']) || stringValue(obj['path']) || stringValue(obj['output_path']) || stringValue(obj['artifact_path']);
    if (!path) return '';
    const size = stringValue(obj['size_bytes']) || stringValue(obj['bytes']);
    return `${basename(path)}${size ? ` · ${size} bytes` : ''}`;
  }
  if (lower === 'shell_bash') {
    const command = stringValue(obj['command']);
    const dst = redirectDestination(command);
    if (dst) return `prepared ${basename(dst)}`;
  }
  if (lower.includes('plot') || lower.includes('chart') || lower.includes('visual')) {
    const path = stringValue(obj['output_path']) || stringValue(obj['artifact_path']) || stringValue(obj['path']) || stringValue(obj['file_path']);
    if (!path) return '';
    return [
      path,
      stringValue(obj['plot_type']) ? `chart ${stringValue(obj['plot_type'])}` : '',
      stringValue(obj['x_column']) ? `x ${stringValue(obj['x_column'])}` : '',
      Array.isArray(obj['y_columns']) ? `y ${obj['y_columns'].join(', ')}` : '',
      stringValue(obj['data_points']) ? `${stringValue(obj['data_points'])} rows` : '',
    ].filter(Boolean).join('\n');
  }
  return '';
}

function basename(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) ?? path;
}

function formatDistanceKm(value: string): string {
  if (!value) return '';
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return parsed.toFixed(2).replace(/\.00$/, '');
}

function redirectDestination(command: string): string {
  const parts = command.split('>');
  if (parts.length < 2) return '';
  return parts.at(-1)?.trim().replace(/^['"]|['"]$/g, '') ?? '';
}

function reportPreview(node: ProjectedExecutionNode): string {
  const structured = objectValue(node.structured);
  const workflow = objectValue(structured['workflow_state']);
  const state = objectValue(workflow[node.agent]);
  const source = Object.keys(state).length
    ? state
    : Object.keys(workflow).length
      ? workflow
      : objectValue(parseJSON(stripControlContracts(node.text ?? '')) ?? {});
  const acquisition = objectValue(source['acquisition']);
  const resource = objectValue(source['resource_candidate']);
  if (Object.keys(acquisition).length || Object.keys(resource).length) {
    return [
      stringValue(acquisition['status']) ? `acquisition ${stringValue(acquisition['status'])}` : '',
      stringValue(acquisition['metadata_path']),
      stringValue(acquisition['analysis_ready']) ? `analysis ready ${stringValue(acquisition['analysis_ready'])}` : '',
      stringValue(resource['resource_name']) || stringValue(resource['dataset_name']),
    ].filter(Boolean).join('\n');
  }
  const artifact = objectValue(source['artifact']);
  const plot = objectValue(source['plot']);
  const artifactSource = Object.keys(artifact).length ? artifact : plot;
  if (Object.keys(artifactSource).length) {
    const path = stringValue(artifactSource['path']) || stringValue(artifactSource['local_path']) || stringValue(artifactSource['output_path']) || stringValue(artifactSource['plot_path']) || stringValue(artifactSource['artifact_path']);
    return [
      stringValue(artifactSource['kind']) || stringValue(artifactSource['plot_type']) || stringValue(artifactSource['type']),
      path,
      imagePath(path) ? 'show full image' : '',
      Array.isArray(artifactSource['columns']) ? `columns ${artifactSource['columns'].join(', ')}` : '',
      stringValue(artifactSource['status']) ? `status ${stringValue(artifactSource['status'])}` : '',
    ].filter(Boolean).join('\n');
  }
  const rows = [
    stringValue(source['region_name']) || stringValue(source['display_name']) || stringValue(source['name']),
    stringValue(source['center_lat']) && stringValue(source['center_lon'])
      ? `center ${stringValue(source['center_lat'])}, ${stringValue(source['center_lon'])}`
      : '',
    stringValue(source['radius_km']) ? `radius ${stringValue(source['radius_km'])} km` : '',
    stringValue(source['confidence']) ? `confidence ${stringValue(source['confidence'])}` : '',
    stringValue(source['provenance']) ? `provenance ${stringValue(source['provenance'])}` : '',
  ].filter(Boolean);
  return rows.length ? rows.join('\n') : stripControlContracts(node.text ?? '');
}

function retainedWorkflowStateFromText(text: string): Record<string, unknown> {
  for (const marker of [
    'Retained typed workflow state:',
    'CLIO durable typed workflow state:',
    'CLIO merged nested typed workflow state:',
    'CLIO typed workflow state:',
  ]) {
    const idx = text.toLowerCase().lastIndexOf(marker.toLowerCase());
    if (idx < 0) continue;
    const tail = text.slice(idx + marker.length);
    const brace = tail.indexOf('{');
    if (brace < 0) continue;
    return objectValue(parseJSON(tail.slice(brace)) ?? {});
  }
  return {};
}

function carriesArtifact(text: string): boolean {
  return /(\.png|\.jpe?g|\.gif|\.webp|plot|artifact|full image)/i.test(text);
}

function imagePath(path: string): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(path);
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function compactValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(compactValue).filter(Boolean).join(', ');
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stripControlContracts(text: string): string {
  return text
    .replace(/CLIO typed workflow state:\s*\n?[\s\S]*$/m, '')
    .replace(/CLIO durable typed workflow state:\s*\n?[\s\S]*$/m, '')
    .replace(/Retained typed workflow state:\s*\n?[\s\S]*$/m, '')
    .replace(/The workflow state is populated accordingly:\s*\n?[\s\S]*$/m, '')
    .replace(/The workflow state now records[\s\S]*$/m, '')
    .trim();
}

function isRedacted(text: string): boolean {
  return /\[redacted\]/i.test(text.trim());
}

function agentDepth(agent: string): number {
  if (!agent || agent === 'main') return 0;
  if (['data', 'geospatial', 'analysis', 'visualization', 'synthesis'].includes(agent)) return 1;
  return 2;
}

function handoffDepth(parent: string, agent: string): number {
  if (!parent || parent === 'main') return agent === 'main' ? 0 : 1;
  return agentDepth(parent) + 1;
}

function toolDisplayName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('geocode')) return 'Geocode location';
  if (lower.startsWith('ndp_search')) return 'NDP catalog search';
  if (lower.startsWith('ndp_stage')) return 'NDP resource staging';
  if (lower === 'shell_bash') return 'Shell command';
  if (lower.includes('plot') || lower.includes('chart') || lower.includes('visual')) return 'Plot timeseries';
  return name;
}

function shouldRenderPart(part: Part, density: TranscriptDensity): boolean {
  if (density === 'verbose') return true;
  if (density === 'summary') {
    // summary keeps the answer + diffs + images; the routing breadcrumb
    // is useful but not load-bearing for read-back.
    return (
      part.type === 'text' || part.type === 'file_diff' || part.type === 'image'
    );
  }
  // normal density: hide thinking; show routing_decision so the user
  // can see which expert handled the turn.
  return part.type !== 'thinking';
}

function PartView(props: {
  part: Part;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onPinFile?: (path: string) => void;
  searchQuery?: string;
  messageId?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
  showCursor?: boolean;
  imagePartsSupported?: boolean;
}) {
  const p = props.part;
  if (p.type === 'text') {
    const text = p.text ?? '';
    const commandResult = commandResultInfo(p, text);
    if (commandResult && !props.searchQuery?.trim()) {
      return (
        <CommandResultCard
          command={commandResult.command}
          text={commandResult.text}
        >
          <Show when={props.showCursor}>
            <span class="trx-cursor" aria-hidden>▌</span>
          </Show>
        </CommandResultCard>
      );
    }
    const workflow = splitWorkflowState(text);
    if (workflow && !props.searchQuery?.trim()) {
      return (
        <div class="trx-text">
          <Show when={workflow.before.trim()}>
            <InlineMarkdown text={workflow.before.trim()} />
          </Show>
          <WorkflowStateCard state={workflow.state} raw={workflow.raw} />
          <Show when={workflow.after.trim()}>
            <InlineMarkdown text={workflow.after.trim()} />
          </Show>
          <Show when={props.showCursor}>
            <span class="trx-cursor" aria-hidden>▌</span>
          </Show>
        </div>
      );
    }
    const q = props.searchQuery?.trim() ?? '';
    if (!q) {
      return (
        <div class="trx-text">
          <InlineMarkdown text={text} />
          <Show when={props.showCursor}>
            <span class="trx-cursor" aria-hidden>▌</span>
          </Show>
        </div>
      );
    }
    // When searching, prefer the highlight renderer over markdown
    // formatting — keeps the <mark> wrapping correct without having
    // to teach InlineMarkdown about search.
    return (
      <div class="trx-text">
        <HighlightedText
          text={text}
          query={q}
          messageId={props.messageId ?? ''}
          baseIndex={props.matchBaseIndex ?? 0}
          currentMatchKey={props.currentMatchKey ?? ''}
        />
        <Show when={props.showCursor}>
          <span class="trx-cursor" aria-hidden>▌</span>
        </Show>
      </div>
    );
  }
  if (p.type === 'thinking') {
    const body = p.thinking ?? p.text ?? '';
    const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;
    const label = wordCount > 0
      ? `Thought for ~${wordCount} word${wordCount === 1 ? '' : 's'}`
      : 'Thinking';
    return (
      <details class="trx-thinking">
        <summary>
          <Icon name="sparkle" size={12} />
          <span>{label}</span>
          <span class="trx-thinking__hint">click to expand</span>
        </summary>
        <pre>{body}</pre>
      </details>
    );
  }
  if (p.type === 'tool_call') {
    const inputRows = () => toolInputRows(p.input ?? {});
    if (props.density === 'normal') {
      return (
        <div
          class="trx-toolcall trx-toolcall--collapsed"
          data-testid={`toolcall-${p.call_id ?? p.id ?? p.tool_name}`}
        >
          <Icon name="tool" size={14} class="trx-toolcall__icon" />
          <span class="trx-toolcall__name">{p.tool_name}</span>
          <span class="trx-toolcall__args">
            ({inputRows().slice(0, 2).map((row) => row.label).join(', ')})
          </span>
        </div>
      );
    }
    return (
      <div
        class="trx-toolcall"
        data-testid={`toolcall-${p.call_id ?? p.id ?? p.tool_name}`}
      >
        <Icon name="tool" size={14} class="trx-toolcall__icon" />
        <div style="flex:1; min-width:0">
          <div>
            <span class="trx-toolcall__name">{p.tool_name}</span>
          </div>
          <Show when={inputRows().length > 0} fallback={<div class="trx-toolcall__empty">No visible input</div>}>
            <dl class="trx-toolcall__kv">
              <For each={inputRows()}>
                {(row) => (
                  <div>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                )}
              </For>
            </dl>
          </Show>
        </div>
      </div>
    );
  }
  if (p.type === 'tool_result') {
    const body = (() => {
      if (typeof p.output === 'string') return p.output;
      if (Array.isArray(p.content)) {
        return p.content
          .map((c) => {
            if (c.type === 'text') return c.text;
            if (c.type === 'tool_result') return typeof c.output === 'string' ? c.output : '';
            return `[${c.type}]`;
          })
          .join('\n');
      }
      return '';
    })();
    const toolResultName = String(
      (p as Part & { tool_name?: string }).tool_name ??
        p.metadata?.['tool_name'] ??
        p.metadata?.['tool'] ??
        '',
    );
    const structured = summarizeToolResultPresentation(toolResultName, body);
    if (structured && !props.searchQuery?.trim()) {
      return (
        <StructuredToolResultCard
          result={structured}
          error={Boolean(p.is_error)}
        />
      );
    }
    return (
      <div class={'trx-toolresult ' + (p.is_error ? 'trx-toolresult--err' : '')}>
        <Icon name="check" size={14} class="trx-toolresult__icon" />
        <pre>{body}</pre>
      </div>
    );
  }
  if (p.type === 'file_diff') {
    const path = p.path;
    const stats = (() => {
      const ud = p.unified_diff ?? '';
      if (ud) {
        const adds = ud.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
        const dels = ud.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
        return { adds, dels };
      }
      const beforeLines = (p.before ?? '').split('\n').length;
      const afterLines = (p.after ?? '').split('\n').length;
      const adds = Math.max(0, afterLines - beforeLines);
      const dels = Math.max(0, beforeLines - afterLines);
      return { adds, dels };
    })();
    return (
      <div class="trx-filediff-wrap">
        <button
          type="button"
          class="trx-filediff"
          data-testid="filediff-chip"
          onClick={() => props.onOpenDiff?.(p)}
        >
          <Icon name="diff" size={14} />
          <div class="trx-filediff__chip">
            <span class="trx-filediff__path">{path}</span>
            <span class="trx-filediff__stats">
              <span class="trx-filediff__plus">+{stats.adds}</span>
              <span class="trx-filediff__minus">−{stats.dels}</span>
            </span>
          </div>
        </button>
        <Show when={props.onPinFile}>
          <button
            type="button"
            class="trx-filediff-pin"
            data-testid={`filediff-pin-${path}`}
            title="Pin this file to session context"
            onClick={() => props.onPinFile?.(path)}
          >
            <Icon name="pin" size={12} />
          </button>
        </Show>
      </div>
    );
  }
  // routing_decision parts — show clio's chosen expert + rationale so
  // the user can see why a particular tool/expert handled the turn.
  // Matches the TUI's detail_view rendering.
  if (p.type === 'routing_decision') {
    const selected = (p as Part & { selected_agent?: string }).selected_agent ?? '';
    const rationale = (p as Part & { rationale?: string }).rationale ?? '';
    const metadata = (p as Part & { metadata?: Record<string, unknown> }).metadata ?? {};
    const reason = String(metadata['route_reason'] ?? '');
    const source = String(metadata['route_source'] ?? '');
    if (
      !source &&
      (!selected || selected === 'main') &&
      /removed retained evidence scaffolding/i.test(`${reason} ${rationale}`)
    ) {
      return null;
    }
    return (
      <div class="trx-routing">
        <span class="trx-routing__icon" aria-hidden>
          <Icon name="branch" size={11} />
        </span>
        <span class="trx-routing__body">
          <span class="trx-routing__head">
            routed to <strong>{selected || 'chat'}</strong>
            <Show when={source}>
              <span class="trx-routing__src"> · {source}</span>
            </Show>
          </span>
          <Show when={rationale || reason}>
            <span class="trx-routing__why">{rationale || reason}</span>
          </Show>
        </span>
      </div>
    );
  }
  // expert_handoff parts — clio delegated the turn to a sub-expert; show
  // who handled it + the status/summary. (clio emits this as a Part, not a
  // standalone event, so it must be rendered here or it's silently dropped.)
  if (p.type === 'expert_handoff') {
    const hp = p as Part & { metadata?: Record<string, unknown>; text?: string };
    const meta = hp.metadata ?? {};
    const agent = String(meta['agent_id'] ?? meta['expert'] ?? 'expert');
    const parent = String(meta['parent_id'] ?? meta['parent'] ?? '').trim();
    const status = String(meta['status'] ?? 'observed');
    const output = String(meta['output_summary'] ?? meta['summary'] ?? '').trim();
    const summary = hp.text ?? '';
    const detail = output || summary;
    const workflow = splitWorkflowState(detail);
    const displayDetail = workflow
      ? summarizeHandoffDetail(workflow.before.trim() || workflow.after.trim())
      : summarizeHandoffDetail(detail);
    return (
      <div class="trx-routing">
        <span class="trx-routing__icon" aria-hidden>
          <Icon name="bot" size={11} />
        </span>
        <span class="trx-routing__body">
          <span class="trx-routing__head">
            <Show when={parent} fallback={<>handoff to <strong>{agent}</strong></>}>
              handoff <strong>{parent}</strong> → <strong>{agent}</strong>
            </Show>
            <span class="trx-routing__src"> · {status}</span>
          </span>
          <Show when={displayDetail}>
            <span class="trx-routing__why">{displayDetail}</span>
          </Show>
          <Show when={workflow}>
            <WorkflowStateCard state={workflow!.state} raw={workflow!.raw} />
          </Show>
        </span>
      </div>
    );
  }
  // Inline image parts (1.0 item 2). base64/url sources render directly;
  // backend file references show an honest placeholder until fetched.
  if (p.type === 'image') {
    // A2: when the backend explicitly lacks multimodal_image_parts, render
    // an honest placeholder rather than an <img> the backend ignored.
    if (props.imagePartsSupported === false) {
      return (
        <div
          class="trx-image-unavailable"
          data-testid="trx-image-unsupported"
        >
          <Icon name="alert" size={12} />
          <span>image not supported by this backend</span>
        </div>
      );
    }
    const src =
      p.source.kind === 'base64' && p.source.data
        ? `data:${p.source.media_type ?? 'image/png'};base64,${p.source.data}`
        : p.source.kind === 'url'
          ? p.source.url
          : undefined;
    if (!src) {
      return (
        <div class="trx-image-unavailable" data-testid="trx-image-unavailable">
          <Icon name="attach" size={12} />
          <span>image attachment (backend file reference — open the Inspector Context tab to preview)</span>
        </div>
      );
    }
    return (
      <img
        class="trx-image"
        src={src}
        alt={p.source.media_type ?? 'image attachment'}
        loading="lazy"
        data-testid="trx-image"
      />
    );
  }
  return null;
}

function StructuredToolResultCard(props: {
  result: StructuredResultPresentation;
  error?: boolean;
}) {
  return (
    <section
      class={'trx-structured-result ' + (props.error ? 'trx-structured-result--err' : '')}
      data-testid="structured-tool-result"
    >
      <div class="trx-structured-result__head">
        <Icon name={props.error ? 'alert' : 'check'} size={14} />
        <span>{props.result.title}</span>
      </div>
      <dl class="trx-structured-result__grid" data-testid="structured-tool-result-summary">
        <For each={props.result.rows.slice(0, 8)}>
          {(row) => (
            <div>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          )}
        </For>
      </dl>
      <details class="trx-structured-result__raw" data-testid="structured-tool-result-raw">
        <summary>Raw result</summary>
        <pre>{prettyJson(props.result.raw)}</pre>
      </details>
    </section>
  );
}

function commandResultInfo(
  part: Part,
  text: string,
): { command: string; text: string } | null {
  const synthetic = String(part.metadata?.['synthetic'] ?? '');
  if (synthetic !== 'command_result') return null;
  const command = String(part.metadata?.['command'] ?? '').trim() || 'Command';
  const prefix = command.startsWith('/') ? `[${command}]` : '';
  const body = prefix && text.trimStart().startsWith(prefix)
    ? text.trimStart().slice(prefix.length).trimStart()
    : text;
  return { command, text: body };
}

function CommandResultCard(props: {
  command: string;
  text: string;
  children?: JSX.Element;
}) {
  return (
    <section class="trx-command-result" data-testid="command-result-card">
      <div class="trx-command-result__head">
        <Icon name="tool" size={14} />
        <span class="trx-command-result__label">Command result</span>
        <code>{props.command}</code>
      </div>
      <div class="trx-command-result__body">
        <InlineMarkdown text={props.text} />
        {props.children}
      </div>
    </section>
  );
}

interface WorkflowStateBlock {
  before: string;
  after: string;
  raw: string;
  state: Record<string, unknown>;
}

const WORKFLOW_STATE_MARKERS = [
  'CLIO durable typed workflow state:',
  'CLIO typed workflow state:',
  'Retained typed workflow state:',
] as const;

function splitWorkflowState(text: string): WorkflowStateBlock | null {
  let markerIndex = -1;
  let marker = '';
  for (const candidate of WORKFLOW_STATE_MARKERS) {
    const idx = text.indexOf(candidate);
    if (idx >= 0 && (markerIndex < 0 || idx < markerIndex)) {
      markerIndex = idx;
      marker = candidate;
    }
  }
  if (markerIndex < 0) return null;

  const before = text.slice(0, markerIndex).trimEnd();
  const tail = text.slice(markerIndex + marker.length).trimStart();
  const jsonStart = tail.indexOf('{');
  if (jsonStart < 0) return null;
  const end = findBalancedJsonEnd(tail, jsonStart);
  if (end < 0) return null;

  const raw = tail.slice(jsonStart, end + 1);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const state = isRecord(parsed['workflow_state'])
      ? parsed['workflow_state']
      : parsed;
    return {
      before,
      after: tail.slice(end + 1).trimStart(),
      raw,
      state,
    };
  } catch {
    return null;
  }
}

function findBalancedJsonEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = inString;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function summarizeHandoffDetail(detail: string): string {
  const text = detail.trim();
  if (!text) return '';
  const jsonStart = text.search(/{/);
  if (jsonStart !== 0) return text;
  const end = findBalancedJsonEnd(text, 0);
  if (end < 0) return text;
  const raw = text.slice(0, end + 1);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return text.slice(end + 1).trimStart();
    const summary = summarizeEvidenceRecord(parsed);
    const rest = text.slice(end + 1).trimStart();
    return [summary, rest].filter(Boolean).join(' · ');
  } catch {
    return text;
  }
}

function summarizeEvidenceRecord(record: Record<string, unknown>): string {
  const region = shortScalar(record['REGION_LABEL'] ?? record['region_label'] ?? record['region_name']);
  const confidence = shortScalar(record['CONFIDENCE'] ?? record['confidence']);
  const lat = shortScalar(record['CENTER_LAT'] ?? record['center_lat']);
  const lon = shortScalar(record['CENTER_LON'] ?? record['center_lon']);
  const radius = shortScalar(record['RADIUS_KM'] ?? record['radius_km']);
  const warnings = shortScalar(record['WARNINGS'] ?? record['warnings']);
  if (region) {
    const bits = [
      `Resolved region: ${region}`,
      lat && lon ? `center ${lat}, ${lon}` : '',
      radius ? `radius ${radius} km` : '',
      confidence ? `confidence ${confidence}` : '',
      warnings ? `warnings ${warnings}` : '',
    ].filter(Boolean);
    return bits.join(' · ');
  }

  const bits = Object.entries(record)
    .filter(([, value]) => value != null && value !== '')
    .slice(0, 4)
    .map(([key, value]) => `${humanizeKey(key)}: ${shortScalar(value)}`)
    .filter((bit) => !bit.endsWith(': '));
  return bits.join(' · ');
}

function WorkflowStateCard(props: { state: Record<string, unknown>; raw: string }) {
  const rows = () => workflowRows(props.state);
  const hasError = () => rows().some((row) => row.tone === 'err');
  return (
    <section
      class={'trx-workflow' + (hasError() ? ' trx-workflow--err' : '')}
      data-testid="workflow-state-card"
    >
      <div class="trx-workflow__head">
        <Icon name={hasError() ? 'alert' : 'branch'} size={13} />
        <span>{hasError() ? 'Workflow blocker' : 'Workflow state'}</span>
      </div>
      <Show when={rows().length > 0} fallback={<p class="trx-workflow__empty">Structured state captured.</p>}>
        <dl class="trx-workflow__grid">
          <For each={rows().slice(0, 8)}>
            {(row) => (
              <div class="trx-workflow__row">
                <dt>{row.label}</dt>
                <dd>
                  <span class={'trx-workflow__status trx-workflow__status--' + row.tone}>
                    {row.status}
                  </span>
                  <Show when={row.detail}>
                    <span class="trx-workflow__detail">{row.detail}</span>
                  </Show>
                </dd>
              </div>
            )}
          </For>
        </dl>
      </Show>
      <details class="trx-workflow__raw">
        <summary>Raw state</summary>
        <pre>{prettyJson(props.raw)}</pre>
      </details>
    </section>
  );
}

interface WorkflowBlockerSummary {
  title: string;
  detail: string;
}

function TurnWorkflowBlocker(props: { summary: WorkflowBlockerSummary }) {
  return (
    <aside class="trx-turn-blocker" data-testid="turn-workflow-blocker" role="note">
      <span class="trx-turn-blocker__icon">
        <Icon name="alert" size={13} />
      </span>
      <div class="trx-turn-blocker__body">
        <div class="trx-turn-blocker__title">{props.summary.title}</div>
        <div class="trx-turn-blocker__detail">{props.summary.detail}</div>
      </div>
    </aside>
  );
}

function turnWorkflowBlocker(parts: Part[]): WorkflowBlockerSummary | null {
  for (let i = parts.length - 1; i >= 0; i--) {
    const state = workflowStateFromPart(parts[i]);
    if (!state) continue;
    const delegation = state['delegation'];
    if (!isRecord(delegation)) continue;
    if (workflowTone(String(delegation['status'] ?? ''), delegation) !== 'err') continue;
    const detail = knownWorkflowBlocker(delegation) || workflowDetail(delegation);
    if (!detail) continue;
    return {
      title: 'Workflow blocker',
      detail,
    };
  }
  return null;
}

function workflowStateFromPart(part: Part | undefined): Record<string, unknown> | null {
  const metadata = part?.metadata;
  if (!isRecord(metadata)) return null;
  const state = metadata['workflow_state'];
  if (isRecord(state)) return state;
  const partRecord: Record<string, unknown> = isRecord(part) ? part : {};

  const candidates = [
    metadata['output_summary'],
    metadata['return_output_summary'],
    metadata['local_output_summary'],
    partRecord['text'],
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const workflow = splitWorkflowState(candidate);
    if (workflow) return workflow.state;
  }
  return null;
}

interface WorkflowRow {
  label: string;
  status: string;
  tone: 'ok' | 'warn' | 'err' | 'idle';
  detail: string;
}

function workflowRows(state: Record<string, unknown>): WorkflowRow[] {
  return Object.entries(state).map(([key, value]) => {
    if (!isRecord(value)) {
      return {
        label: humanizeKey(key),
        status: shortScalar(value),
        tone: 'idle',
        detail: '',
      };
    }
    const status = String(
      value['status'] ??
        value['state'] ??
        value['kind'] ??
        value['confidence'] ??
        'recorded',
    );
    return {
      label: humanizeKey(key),
      status,
      tone: workflowTone(status, value),
      detail: workflowDetail(value),
    };
  });
}

function workflowTone(status: string, value: Record<string, unknown>): WorkflowRow['tone'] {
  const text = `${status} ${String(value['blocker'] ?? '')} ${String(value['error'] ?? '')}`.toLowerCase();
  if (/fail|error|blocked|missing|invalid/.test(text)) return 'err';
  if (/warn|partial|preliminary|metadata|scan_limited|unknown/.test(text)) return 'warn';
  if (/ready|complete|completed|staged|resolved|ranked|selected|ok|true/.test(text)) return 'ok';
  return 'idle';
}

function workflowDetail(value: Record<string, unknown>): string {
  const knownBlocker = knownWorkflowBlocker(value);
  if (knownBlocker) return knownBlocker;

  const keys = [
    'failed_child',
    'parent',
    'message',
    'path',
    'local_path',
    'metadata_path',
    'source_url',
    'region_name',
    'station_id',
    'candidate_count',
    'size_bytes',
    'blocker',
    'error',
    'warning',
    'warnings',
    'next_action',
  ];
  const bits: string[] = [];
  for (const key of keys) {
    const raw = value[key];
    if (raw == null || raw === '') continue;
    const formatted = Array.isArray(raw)
      ? raw.slice(0, 3).map(shortScalar).join(', ')
      : shortScalar(raw);
    if (formatted) bits.push(`${humanizeKey(key)}: ${formatted}`);
    if (bits.length >= 3) break;
  }
  return bits.join(' · ');
}

function knownWorkflowBlocker(value: Record<string, unknown>): string {
  const error = String(value['error'] ?? '');
  if (error !== '_UnsupportedSessionAgent') return '';

  const child = shortScalar(value['failed_child'] ?? value['message']);
  const parent = shortScalar(value['parent']);
  const bits = [
    child ? `child expert: ${child}` : '',
    parent ? `parent: ${parent}` : '',
    'reason: required tools are not available in this session',
  ].filter(Boolean);
  return bits.join(' · ');
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function shortScalar(value: unknown): string {
  if (typeof value === 'string') {
    const compact = value.replace(/\s+/g, ' ').trim();
    if (compact.length <= 90) return compact;
    return `${compact.slice(0, 87)}...`;
  }
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(4);
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (Array.isArray(value)) return value.slice(0, 4).map(shortScalar).join(', ');
  if (isRecord(value)) return 'recorded';
  return value == null ? '' : String(value);
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/** Regenerate variant menu (1.0 item 4). Plain regenerate, regenerate with
 * notes (inline textarea), and regenerate with a different model — all ride
 * clio's retry route which accepts `notes` + `provider_id`/`model_id`. */
function RegenMenu(props: {
  msg: Message;
  models?: ModelOption[];
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
}) {
  const [open, setOpen] = createSignal(false);
  const [mode, setMode] = createSignal<'menu' | 'notes' | 'models'>('menu');
  const [notes, setNotes] = createSignal('');
  let rootEl: HTMLSpanElement | undefined;

  const hasVariants = () =>
    Boolean(props.onRegenerateWithNotes || props.onRegenerateWithModel);

  function close() {
    setOpen(false);
    setMode('menu');
    setNotes('');
  }

  // Close on outside click / Escape while open.
  createEffect(() => {
    if (!open()) return;
    const onDoc = (e: MouseEvent) => {
      if (rootEl && !rootEl.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey, true);
    onCleanup(() => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey, true);
    });
  });

  return (
    <span class="trx-regen" ref={rootEl}>
      <button
        type="button"
        class="trx-msg__action"
        title="Regenerate response"
        data-testid={`msg-regen-${props.msg.id}`}
        onClick={() => {
          // Without variant callbacks (fixtures / older call sites) keep the
          // original immediate-regenerate behaviour.
          if (!hasVariants()) {
            props.onRegenerate?.(props.msg);
            return;
          }
          if (open()) close();
          else setOpen(true);
        }}
      >
        <Icon name="regenerate" size={12} />
      </button>
      <Show when={open()}>
        <div
          class="trx-regen__menu"
          role="menu"
          data-testid={`regen-menu-${props.msg.id}`}
        >
          <Show when={mode() === 'menu'}>
            <button
              type="button"
              class="trx-regen__item"
              role="menuitem"
              data-testid={`regen-plain-${props.msg.id}`}
              onClick={() => {
                close();
                props.onRegenerate?.(props.msg);
              }}
            >
              <Icon name="regenerate" size={12} />
              <span>Regenerate</span>
            </button>
            <Show when={props.onRegenerateWithNotes}>
              <button
                type="button"
                class="trx-regen__item"
                role="menuitem"
                data-testid={`regen-notes-${props.msg.id}`}
                onClick={() => setMode('notes')}
              >
                <Icon name="edit" size={12} />
                <span>Regenerate with notes…</span>
              </button>
            </Show>
            <Show
              when={props.onRegenerateWithModel && (props.models?.length ?? 0) > 0}
            >
              <button
                type="button"
                class="trx-regen__item"
                role="menuitem"
                data-testid={`regen-model-${props.msg.id}`}
                onClick={() => setMode('models')}
              >
                <Icon name="bot" size={12} />
                <span>Regenerate with model</span>
                <Icon name="chevron-right" size={10} />
              </button>
            </Show>
          </Show>
          <Show when={mode() === 'notes'}>
            <div class="trx-regen__notes">
              <textarea
                class="trx-regen__textarea"
                rows={3}
                placeholder="Guidance for the retry — e.g. “shorter”, “use Python”, “cite sources”"
                value={notes()}
                data-testid={`regen-notes-input-${props.msg.id}`}
                onInput={(e) => setNotes(e.currentTarget.value)}
              />
              <div class="trx-regen__row">
                <button
                  type="button"
                  class="trx-regen__btn"
                  onClick={() => setMode('menu')}
                >
                  Back
                </button>
                <button
                  type="button"
                  class="trx-regen__btn trx-regen__btn--primary"
                  data-testid={`regen-notes-submit-${props.msg.id}`}
                  disabled={!notes().trim()}
                  onClick={() => {
                    const n = notes().trim();
                    if (!n) return;
                    close();
                    props.onRegenerateWithNotes?.(props.msg, n);
                  }}
                >
                  Regenerate
                </button>
              </div>
            </div>
          </Show>
          <Show when={mode() === 'models'}>
            <div class="trx-regen__models">
              <button
                type="button"
                class="trx-regen__item trx-regen__item--back"
                onClick={() => setMode('menu')}
              >
                ← Back
              </button>
              <For each={props.models ?? []}>
                {(m) => (
                  <button
                    type="button"
                    class="trx-regen__item"
                    role="menuitem"
                    data-testid={`regen-pick-${m.id}-${props.msg.id}`}
                    onClick={() => {
                      close();
                      props.onRegenerateWithModel?.(props.msg, m);
                    }}
                  >
                    <span class="trx-regen__model-id">{m.modelId}</span>
                    <span class="trx-regen__model-provider">{m.providerLabel}</span>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </span>
  );
}

function MessageView(props: {
  msg: Message;
  density: TranscriptDensity;
  onOpenDiff?: (diff: FileDiff) => void;
  onCopy?: (msg: Message) => void;
  onRegenerate?: (msg: Message) => void;
  onRegenerateWithNotes?: (msg: Message, notes: string) => void;
  onRegenerateWithModel?: (msg: Message, model: ModelOption) => void;
  models?: ModelOption[];
  onEdit?: (msg: Message) => void;
  onQuote?: (msg: Message) => void;
  onDelete?: (msg: Message) => void;
  onPinFile?: (path: string) => void;
  onSpeak?: (msg: Message) => void | Promise<void>;
  onCopyPermalink?: (msg: Message) => void | Promise<void>;
  selected?: boolean;
  onSelect?: (msg: Message) => void;
  searchQuery?: string;
  currentMatchKey?: string;
  matchBaseIndex?: number;
  /** Index of the part that should show the streaming cursor (or -1). */
  streamingPartIdx?: number;
  imagePartsSupported?: boolean;
}) {
  const role = () => props.msg.role;
  const isAssistant = () => role() === 'assistant';
  const metadataDiffs = createMemo(() => metadataToolDiffs(props.msg));
  const turnBlocker = createMemo(() =>
    isAssistant() ? turnWorkflowBlocker(props.msg.parts ?? []) : null,
  );

  return (
    <article
      class={
        // anim-rise: subtle entrance motion as messages mount (W3 Tier-1);
        // collapses to instant under prefers-reduced-motion.
        'trx-msg anim-rise trx-msg--' + role() + (props.selected ? ' is-selected' : '')
      }
      id={`msg-${props.msg.id}`}
      data-testid={`msg-${props.msg.id}`}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        // Don't intercept button clicks (copy/regen/edit/diff chips).
        if (target.closest('button')) return;
        props.onSelect?.(props.msg);
      }}
    >
      <header class="trx-msg__head">
        <span class="trx-msg__avatar">
          <Icon name={ROLE_ICON[role()] ?? 'circle'} size={14} />
        </span>
        <span class="trx-msg__role">{ROLE_LABEL[role()] ?? role()}</span>
        <Show when={isAssistant() && props.msg.model?.model_id}>
          <span class="trx-msg__model">{props.msg.model?.model_id}</span>
        </Show>
        <Show when={props.msg.metadata?.['retry_attempt_id']}>
          {/* Retry lineage chip (1.0 item 3) — this message was created by
              clio's retry route; the full attempt history (notes, status,
              model override) lives in the Inspector's Attempts tab. All
              server-side state: survives reload. */}
          <span
            class="trx-msg__retry-chip"
            title="Created by a retry — see the Inspector's Attempts tab for the lineage"
            data-testid={`msg-retry-chip-${props.msg.id}`}
          >
            ↻ retry
          </span>
        </Show>
        <Show when={props.msg.created_at}>
          <span
            class="trx-msg__when"
            title={absoluteTime(props.msg.created_at!)}
          >
            {humanTime(props.msg.created_at!)}
          </span>
        </Show>
        <span class="trx-msg__actions">
          <Show when={props.onCopy}>
            <button
              type="button"
              class="trx-msg__action"
              title="Copy message"
              data-testid={`msg-copy-${props.msg.id}`}
              onClick={() => props.onCopy?.(props.msg)}
            >
              <Icon name="copy" size={12} />
            </button>
          </Show>
          <Show when={isAssistant() && props.onRegenerate}>
            <RegenMenu
              msg={props.msg}
              models={props.models}
              onRegenerate={props.onRegenerate}
              onRegenerateWithNotes={props.onRegenerateWithNotes}
              onRegenerateWithModel={props.onRegenerateWithModel}
            />
          </Show>
          <Show when={isAssistant() && props.onSpeak}>
            <button
              type="button"
              class="trx-msg__action"
              title="Speak this message"
              data-testid={`msg-speak-${props.msg.id}`}
              onClick={() => void props.onSpeak?.(props.msg)}
            >
              <Icon name="bell" size={12} />
            </button>
          </Show>
          <Show when={props.onCopyPermalink}>
            <button
              type="button"
              class="trx-msg__action"
              title="Copy link to this message"
              data-testid={`msg-link-${props.msg.id}`}
              onClick={() => void props.onCopyPermalink?.(props.msg)}
            >
              <Icon name="arrow-up-right" size={12} />
            </button>
          </Show>
          <Show when={role() === 'user' && props.onEdit}>
            <button
              type="button"
              class="trx-msg__action"
              title="Edit message"
              data-testid={`msg-edit-${props.msg.id}`}
              onClick={() => props.onEdit?.(props.msg)}
            >
              <Icon name="edit" size={12} />
            </button>
          </Show>
          <Show when={props.onQuote}>
            <button
              type="button"
              class="trx-msg__action"
              title="Quote in composer"
              data-testid={`msg-quote-${props.msg.id}`}
              onClick={() => props.onQuote?.(props.msg)}
            >
              <Icon name="branch" size={12} />
            </button>
          </Show>
          <Show when={props.onDelete}>
            <button
              type="button"
              class="trx-msg__action trx-msg__action--danger"
              title="Delete message"
              data-testid={`msg-delete-${props.msg.id}`}
              onClick={() => {
                if (
                  window.confirm(
                    'Delete this message? The rest of the conversation will be re-numbered around it.',
                  )
                ) {
                  props.onDelete?.(props.msg);
                }
              }}
            >
              <Icon name="close" size={12} />
            </button>
          </Show>
        </span>
      </header>
      <div class="trx-msg__body">
        <For each={props.msg.parts.filter((p) => shouldRenderPart(p, props.density))}>
          {(part, i) => (
            <PartView
              part={part}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              searchQuery={props.searchQuery}
              messageId={props.msg.id}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={props.matchBaseIndex}
              showCursor={i() === props.streamingPartIdx}
              imagePartsSupported={props.imagePartsSupported}
            />
          )}
        </For>
        <For each={metadataDiffs()}>
          {(diff) => (
            <PartView
              part={diff}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              searchQuery={props.searchQuery}
              messageId={props.msg.id}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={props.matchBaseIndex}
              imagePartsSupported={props.imagePartsSupported}
            />
          )}
        </For>
        <Show when={turnBlocker()}>
          {(summary) => <TurnWorkflowBlocker summary={summary()} />}
        </Show>
        {/* GAP 1: a pre_message hook block folds into message.completed
            with stop_reason "blocked" + error_info, targeting the USER
            message (no assistant message exists). Render a distinct,
            warning-toned "Turn blocked" pill — and never offer Regenerate
            on it (there's no assistant turn to regenerate). */}
        <Show when={isBlocked(props.msg)}>
          <div
            class="trx-msg__blocked"
            data-testid={`msg-blocked-${props.msg.id}`}
            role="alert"
          >
            <span class="trx-msg__blocked-icon">
              <Icon name="alert" size={14} />
            </span>
            <div class="trx-msg__blocked-body">
              <div class="trx-msg__blocked-title">
                Turn blocked
                <Show when={props.msg.error_info?.error}>
                  <span class="trx-msg__blocked-kind">
                    {props.msg.error_info!.error}
                  </span>
                </Show>
              </div>
              <Show when={props.msg.error_info?.message}>
                <div class="trx-msg__blocked-detail">
                  {props.msg.error_info!.message}
                </div>
              </Show>
            </div>
          </div>
        </Show>
        <Show when={isErrored(props.msg) && !isBlocked(props.msg)}>
          <div
            class="trx-msg__error"
            data-testid={`msg-error-${props.msg.id}`}
            role="alert"
          >
            <span class="trx-msg__error-icon">
              <Icon name="alert" size={14} />
            </span>
            <div class="trx-msg__error-body">
              <div class="trx-msg__error-title">
                {props.msg.error_info?.error ?? 'Turn failed'}
              </div>
              <Show when={props.msg.error_info?.message}>
                <div class="trx-msg__error-detail">
                  {props.msg.error_info!.message}
                </div>
              </Show>
              <Show when={props.msg.error_info?.recoverable && isAssistant() && props.onRegenerate}>
                <button
                  type="button"
                  class="trx-msg__error-retry"
                  onClick={() => props.onRegenerate?.(props.msg)}
                  data-testid={`msg-error-retry-${props.msg.id}`}
                >
                  <Icon name="regenerate" size={12} /> Retry
                </button>
              </Show>
            </div>
          </div>
        </Show>
      </div>
    </article>
  );
}

function isErrored(msg: Message): boolean {
  return msg.stop_reason === 'error' || !!msg.error_info;
}

function metadataToolDiffs(msg: Message): FileDiff[] {
  if (msg.parts.some((part) => part.type === 'file_diff')) return [];
  const metadata = msg.metadata;
  const tools = Array.isArray(metadata?.['tools_called'])
    ? metadata['tools_called']
    : [];
  const diffs: FileDiff[] = [];
  const seen = new Set<string>();
  for (const tool of tools) {
    if (!isRecord(tool)) continue;
    const name = String(tool['name'] ?? tool['tool_name'] ?? '');
    if (name !== 'fs_propose_edit') continue;
    const result = parseToolResult(tool['result']);
    if (!isRecord(result)) continue;
    const path = String(result['path'] ?? result['filepath'] ?? toolPath(tool) ?? '');
    const unifiedDiff = typeof result['unified_diff'] === 'string'
      ? result['unified_diff']
      : '';
    if (!path || !unifiedDiff) continue;
    const key = `${path}\n${unifiedDiff}`;
    if (seen.has(key)) continue;
    seen.add(key);
    diffs.push({
      id: `metadata-diff-${msg.id}-${diffs.length}`,
      type: 'file_diff',
      path,
      unified_diff: unifiedDiff,
      after: typeof result['new_content'] === 'string' ? result['new_content'] : undefined,
    });
  }
  return diffs;
}

function parseToolResult(value: unknown): unknown {
  if (isRecord(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function toolPath(tool: Record<string, unknown>): string {
  const args = tool['args'];
  if (!isRecord(args)) return '';
  return String(args['filepath'] ?? args['path'] ?? '');
}

/** GAP 1: a turn blocked by a pre_message hook arrives as
 * stop_reason "blocked" + error_info on the USER message. Distinct from a
 * normal error so the transcript can render the warning-toned "Turn
 * blocked" pill (no Regenerate). */
function isBlocked(msg: Message): boolean {
  return msg.stop_reason === 'blocked' && !!msg.error_info;
}

function absoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function humanTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const delta = Date.now() - d.getTime();
  const min = Math.round(delta / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  return `${Math.round(hr / 24)}d`;
}

export function Transcript(props: TranscriptProps) {
  // ---- Virtual windowing state (1.0 item 6) ----
  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewH, setViewH] = createSignal(900);
  const [measureTick, setMeasureTick] = createSignal(0);
  /** Measured per-message heights (px, incl. flex gap). Estimates until
   * a message has actually rendered once. */
  const measured = new Map<string, number>();
  const displayMessages = createMemo(() =>
    projectedTranscriptMessages(props.messages, props.executionEvents),
  );

  const virtual = () =>
    displayMessages().length > VIRTUAL_THRESHOLD && !!props.scrollEl;

  // Track the scroll container's position + viewport size.
  createEffect(() => {
    const el = props.scrollEl;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    onScroll();
    setViewH(el.clientHeight || 900);
    el.addEventListener('scroll', onScroll, { passive: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setViewH(el.clientHeight || 900));
      ro.observe(el);
    }
    onCleanup(() => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
    });
  });

  const heightOf = (id: string) => measured.get(id) ?? EST_HEIGHT;

  /** Visible [start, end) index range + spacer heights. */
  const vwindow = createMemo(() => {
    const msgs = displayMessages();
    if (!virtual()) {
      return { start: 0, end: msgs.length, padTop: 0, padBottom: 0 };
    }
    void measureTick();
    const top = scrollTop();
    const vh = viewH();
    // First message whose bottom edge crosses the viewport top.
    let acc = 0;
    let start = 0;
    while (start < msgs.length && acc + heightOf(msgs[start]!.id) < top) {
      acc += heightOf(msgs[start]!.id);
      start++;
    }
    // Fill the viewport (+ overscan) going forward.
    let end = start;
    let fill = 0;
    while (end < msgs.length && fill < vh + 400) {
      fill += heightOf(msgs[end]!.id);
      end++;
    }
    // Symmetric buffer rows so fast scrolling has content ready.
    const bStart = Math.max(0, start - VIRTUAL_BUFFER);
    const bEnd = Math.min(msgs.length, end + VIRTUAL_BUFFER);
    let padTop = 0;
    for (let i = 0; i < bStart; i++) padTop += heightOf(msgs[i]!.id);
    let padBottom = 0;
    for (let i = bEnd; i < msgs.length; i++) padBottom += heightOf(msgs[i]!.id);
    return { start: bStart, end: bEnd, padTop, padBottom };
  });

  const visible = createMemo(() => {
    const w = vwindow();
    const msgs = displayMessages();
    return virtual() ? msgs.slice(w.start, w.end) : msgs;
  });

  // After every windowed render, measure real heights so the spacer
  // estimates converge on reality (messages have variable heights).
  createEffect(() => {
    if (!virtual()) return;
    const slice = visible();
    requestAnimationFrame(() => {
      let changed = false;
      for (const m of slice) {
        const el = document.getElementById(`msg-${m.id}`);
        if (!el) continue;
        const h = el.offsetHeight + TRX_GAP;
        if (h > TRX_GAP && Math.abs((measured.get(m.id) ?? 0) - h) > 1) {
          measured.set(m.id, h);
          changed = true;
        }
      }
      if (changed) setMeasureTick((n) => n + 1);
    });
  });

  /** Estimated pixel offset of message #idx (for off-window jumps). */
  function offsetOfIndex(idx: number): number {
    let sum = 0;
    const msgs = displayMessages();
    for (let i = 0; i < idx && i < msgs.length; i++) {
      sum += heightOf(msgs[i]!.id);
    }
    return sum;
  }

  // Cmd+F navigation across a virtualized transcript: when the focused
  // match's message is outside the rendered window, scroll the container
  // to its estimated offset so it mounts — ChatScreen's own effect then
  // fine-scrolls to the exact <mark> element.
  createEffect(() => {
    const key = props.currentMatchKey;
    if (!key || !virtual()) return;
    const msgId = key.slice(0, key.lastIndexOf(':'));
    const idx = displayMessages().findIndex((m) => m.id === msgId);
    if (idx === -1) return;
    const w = vwindow();
    if (idx >= w.start && idx < w.end) return;
    props.scrollEl?.scrollTo({ top: offsetOfIndex(idx), behavior: 'auto' });
  });

  // Permalink navigation. When the URL hash matches a message id
  // (e.g. user pasted a clio://session/<sid>#<mid> URL into the
  // address bar), scroll the matching article into view and flash a
  // brief highlight. Re-runs after the messages list grows so a
  // late-loading transcript still picks up the hash target.
  function jumpToHash() {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const target =
      hash.startsWith('#msg-') ? hash.slice(1) : `msg-${hash.slice(1)}`;
    const el = document.getElementById(target);
    if (!el) {
      // Virtual mode: the message may exist but sit outside the rendered
      // window — scroll to its estimated offset so it mounts, then retry.
      if (virtual()) {
        const id = target.replace(/^msg-/, '');
        const idx = displayMessages().findIndex((m) => m.id === id);
        if (idx !== -1) {
          props.scrollEl?.scrollTo({ top: offsetOfIndex(idx) });
          setTimeout(jumpToHash, 150);
        }
      }
      return;
    }
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('trx-msg--flash');
    setTimeout(() => el.classList.remove('trx-msg--flash'), 1800);
  }
  onMount(() => {
    queueMicrotask(jumpToHash);
  });
  createEffect(() => {
    void displayMessages().length;
    queueMicrotask(jumpToHash);
  });

  // Pre-compute the per-message base-index for the global match
  // numbering so PartView can label each match with a stable key.
  const baseIndexFor = (msgId: string): number => {
    if (!props.searchQuery) return 0;
    const q = props.searchQuery.trim().toLowerCase();
    if (!q) return 0;
    let total = 0;
    for (const m of displayMessages()) {
      if (m.id === msgId) return total;
      for (const p of m.parts) {
        if (p.type === 'text' && p.text) {
          total += countOccurrences(p.text.toLowerCase(), q);
        }
      }
    }
    return total;
  };

  // Find the latest in-progress assistant turn (no stop_reason) and
  // its last text part — that's where the streaming cursor goes.
  const streamingTarget = (): { msgId: string; partIdx: number } | null => {
    if (!props.streaming) return null;
    const msgs = displayMessages();
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!m || m.role !== 'assistant') continue;
      if (m.stop_reason) return null; // already completed
      const visible = m.parts.filter((p) => shouldRenderPart(p, props.density));
      let lastTextIdx = -1;
      for (let j = visible.length - 1; j >= 0; j--) {
        if (visible[j]?.type === 'text') {
          lastTextIdx = j;
          break;
        }
      }
      return lastTextIdx === -1 ? null : { msgId: m.id, partIdx: lastTextIdx };
    }
    return null;
  };

  return (
    // aria-live: screen readers announce streamed content as it lands
    // (polite — queued behind the user's current reading position).
    // aria-busy flags the in-flight turn so AT can defer announcement.
    <div
      class={'trx' + (virtual() ? ' trx--virtual' : '')}
      data-density={props.density}
      data-testid="transcript"
      aria-live="polite"
      aria-busy={props.streaming ? 'true' : 'false'}
    >
      <Show when={props.loading && displayMessages().length === 0}>
        {/* Skeleton conversation while messages load on session switch
            (W3 Tier-1) — alternating user/assistant shaped bubbles. */}
        <div class="trx__skeleton" data-testid="transcript-skeleton" aria-hidden="true">
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--user" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant trx__skeleton-bubble--short" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--user trx__skeleton-bubble--short" />
          <div class="skeleton trx__skeleton-bubble trx__skeleton-bubble--assistant" />
        </div>
      </Show>
      <Show when={virtual()}>
        <div
          class="trx__spacer"
          style={{ height: `${vwindow().padTop}px` }}
          aria-hidden="true"
          data-testid="trx-spacer-top"
        />
      </Show>
      <For each={visible()}>
        {(m) => {
          const target = streamingTarget();
          const partIdx = target?.msgId === m.id ? target.partIdx : -1;
          return (
            <MessageView
              msg={m}
              density={props.density}
              onOpenDiff={props.onOpenDiff}
              onPinFile={props.onPinFile}
              onCopy={props.onCopy}
              onRegenerate={props.onRegenerate}
              onRegenerateWithNotes={props.onRegenerateWithNotes}
              onRegenerateWithModel={props.onRegenerateWithModel}
              models={props.models}
              onEdit={props.onEdit}
              onQuote={props.onQuote}
              onSpeak={props.onSpeak}
              onCopyPermalink={props.onCopyPermalink}
              onDelete={props.onDelete}
              selected={m.id === props.selectedId}
              onSelect={props.onSelect}
              searchQuery={props.searchQuery}
              currentMatchKey={props.currentMatchKey}
              matchBaseIndex={baseIndexFor(m.id)}
              streamingPartIdx={partIdx}
              imagePartsSupported={props.imagePartsSupported}
            />
          );
        }}
      </For>
      <Show when={virtual()}>
        <div
          class="trx__spacer"
          style={{ height: `${vwindow().padBottom}px` }}
          aria-hidden="true"
          data-testid="trx-spacer-bottom"
        />
      </Show>
    </div>
  );
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while ((i = haystack.indexOf(needle, i)) !== -1) {
    n += 1;
    i += needle.length;
  }
  return n;
}

/**
 * Pure-text renderer that wraps every case-insensitive match of `query`
 * in a <mark class="tx-match">, marking the currently-focused match
 * (per global index, identified by `currentMatchKey`) with an extra
 * `tx-match--current` class so the Cmd+F bar can scroll-into-view.
 */
function HighlightedText(props: {
  text: string;
  query: string;
  messageId: string;
  baseIndex: number;
  currentMatchKey: string;
}) {
  const parts = () => {
    const out: Array<{ kind: 'plain' | 'match'; text: string; idx?: number }> = [];
    const q = props.query;
    if (!q) {
      out.push({ kind: 'plain', text: props.text });
      return out;
    }
    const lower = props.text.toLowerCase();
    const needle = q.toLowerCase();
    let cursor = 0;
    let matchN = 0;
    let i = lower.indexOf(needle, cursor);
    while (i !== -1) {
      if (i > cursor) {
        out.push({ kind: 'plain', text: props.text.slice(cursor, i) });
      }
      out.push({
        kind: 'match',
        text: props.text.slice(i, i + needle.length),
        idx: props.baseIndex + matchN,
      });
      matchN += 1;
      cursor = i + needle.length;
      i = lower.indexOf(needle, cursor);
    }
    if (cursor < props.text.length) {
      out.push({ kind: 'plain', text: props.text.slice(cursor) });
    }
    return out;
  };

  return (
    <>
      <For each={parts()}>
        {(seg) =>
          seg.kind === 'plain' ? (
            <span>{seg.text}</span>
          ) : (
            <mark
              class={
                'tx-match ' +
                (`${props.messageId}:${seg.idx}` === props.currentMatchKey
                  ? 'tx-match--current'
                  : '')
              }
              data-match-key={`${props.messageId}:${seg.idx}`}
            >
              {seg.text}
            </mark>
          )
        }
      </For>
    </>
  );
}
