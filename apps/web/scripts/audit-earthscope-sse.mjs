import fs from 'node:fs/promises';
import path from 'node:path';

const NORMALIZED_TYPES = new Set([
  'turn.started',
  'state.updated',
  'turn.completed',
]);

const PUBLIC_LEAK_PATTERNS = [
  /\[\[\s*##/i,
  /\bworkflow_state\b/i,
  /\btyped\s+workflow[_ ]state\b/i,
  /\bstructured\s+state\b/i,
  /\bacquisition\.metadata_path\b/i,
  /\bacquisition\.analysis_ready\b/i,
  /\bmetadata_path\b/i,
  /\banalysis_ready\b/i,
];

function parseArgs(argv) {
  const opts = { outDir: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      return value;
    };
    if (arg === '--out') opts.outDir = next();
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/audit-earthscope-sse.mjs --out screenshots/<probe-dir>');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.outDir) throw new Error('--out is required');
  opts.outDir = path.resolve(opts.outDir);
  return opts;
}

async function readJsonl(file) {
  try {
    const text = await fs.readFile(file, 'utf8');
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function msBetween(leftIso, rightIso) {
  const left = Date.parse(leftIso || '');
  const right = Date.parse(rightIso || '');
  return Number.isFinite(left) && Number.isFinite(right) ? right - left : null;
}

function eventKey(row) {
  return `${row.event_id ?? ''}|${row.event_type ?? ''}|${row.event_occurred_at ?? ''}`;
}

function payloadText(row) {
  const payload = row.payload || {};
  if (typeof payload.text_append === 'string') return payload.text_append;
  if (typeof payload.text === 'string') return payload.text;
  if (typeof payload.action?.prompt === 'string') return payload.action.prompt;
  if (typeof payload.action?.summary === 'string') return payload.action.summary;
  return '';
}

function stageCounts(rows) {
  const counts = {};
  for (const row of rows) counts[row.stage || ''] = (counts[row.stage || ''] || 0) + 1;
  return counts;
}

function max(values) {
  const filtered = values.filter((value) => value != null);
  return filtered.length ? Math.max(...filtered) : null;
}

function min(values) {
  const filtered = values.filter((value) => value != null);
  return filtered.length ? Math.min(...filtered) : null;
}

function writeIso(row) {
  return row?.sse_written_at || row?.iso || '';
}

function chooseWriteForReceived(row, writesByKey) {
  const candidates = writesByKey.get(eventKey(row)) || [];
  if (candidates.length <= 1) return candidates[0];
  const receivedAt = Date.parse(row.received_at || '');
  if (!Number.isFinite(receivedAt)) return candidates[0];
  const scored = candidates
    .map((candidate) => {
      const writtenAt = Date.parse(writeIso(candidate));
      const delta = Number.isFinite(writtenAt) ? receivedAt - writtenAt : null;
      return { candidate, delta };
    })
    .filter((item) => item.delta != null);
  if (!scored.length) return candidates[0];
  const beforeReceive = scored
    .filter((item) => item.delta >= 0)
    .sort((left, right) => left.delta - right.delta);
  if (beforeReceive.length) return beforeReceive[0].candidate;
  return scored.sort((left, right) => Math.abs(left.delta) - Math.abs(right.delta))[0].candidate;
}

function orderedTiming(received, writesByKey) {
  return received
    .filter((row) => NORMALIZED_TYPES.has(row.event_type))
    .map((row) => {
      const write = chooseWriteForReceived(row, writesByKey);
      return {
        event_id: Number(row.event_id),
        event_type: row.event_type,
        action_kind: row.payload?.action?.kind || '',
        received_at: row.received_at,
        event_occurred_at: row.event_occurred_at,
        sse_written_at: writeIso(write),
        eventOccurredToReceivedMs: msBetween(row.event_occurred_at, row.received_at),
        sseWriteToReceivedMs: msBetween(writeIso(write), row.received_at),
      };
    });
}

function providerBridgeTiming(providerRows, bridgeRows, emitRows) {
  return providerRows.map((providerRow, index) => {
    const nextProvider = providerRows[index + 1];
    const bridgeAfter = bridgeRows.find(
      (row) =>
        row.ts >= providerRow.ts - 1 &&
        (!nextProvider || row.ts < nextProvider.ts) &&
        row.stage === 'bridge.contract_field',
    );
    const emitAfter = emitRows.find(
      (row) =>
        row.ts >= providerRow.ts - 1 &&
        (!nextProvider || row.ts < nextProvider.ts) &&
        row.stage === 'sse.normalized_emit',
    );
    return {
      provider_iso: providerRow.iso,
      provider_stage: providerRow.stage,
      provider_channel: providerRow.source_channel || '',
      model: providerRow.model || '',
      chunk_len: providerRow.chunk_len ?? providerRow.content_len ?? providerRow.reasoning_len ?? null,
      bridge_iso: bridgeAfter?.iso || '',
      emit_iso: emitAfter?.iso || '',
      providerToBridgeMs: bridgeAfter ? Math.round((bridgeAfter.ts - providerRow.ts) * 1000) : null,
      providerToEmitMs: emitAfter ? Math.round((emitAfter.ts - providerRow.ts) * 1000) : null,
    };
  });
}

const opts = parseArgs(process.argv.slice(2));
const receivedPath = path.join(opts.outDir, 'sse-received.jsonl');
const writesPath = path.join(opts.outDir, 'backend-sse-events.jsonl');
const auditPath = path.join(opts.outDir, 'backend-stream-audit.jsonl');
const reportPath = path.join(opts.outDir, 'semantic-sse-audit.json');

const receivedAll = await readJsonl(receivedPath);
const sessionId = receivedAll.find((row) => row.session_id)?.session_id || '';
const received = receivedAll.filter((row) => !sessionId || row.session_id === sessionId);
const writes = (await readJsonl(writesPath)).filter((row) => !sessionId || row.session_id === sessionId);
const audit = (await readJsonl(auditPath)).filter((row) => !sessionId || !row.session_id || row.session_id === sessionId);

const writesByKey = new Map();
for (const row of writes) {
  const key = eventKey(row);
  const existing = writesByKey.get(key) || [];
  existing.push(row);
  writesByKey.set(key, existing);
}
for (const row of audit.filter((item) => item.stage === 'sse.write')) {
  const key = eventKey(row);
  const existing = writesByKey.get(key) || [];
  existing.push(row);
  writesByKey.set(key, existing);
}

const missing = received.filter((row) => !(writesByKey.get(eventKey(row)) || []).length);
const duplicateWriteCandidateCount = [...writesByKey.values()].filter((items) => items.length > 1).length;
const sequenceViolations = [];
for (let i = 1; i < received.length; i += 1) {
  const prior = Number(received[i - 1].event_id);
  const current = Number(received[i].event_id);
  if (Number.isFinite(prior) && Number.isFinite(current) && current !== 0 && prior !== 0 && current < prior) {
    sequenceViolations.push({ index: i, prior, current });
  }
}

const normalized = received.filter((row) => NORMALIZED_TYPES.has(row.event_type));
const publicEvents = normalized.filter((row) => [].includes(row.event_type));
const leaks = [];
for (const row of publicEvents) {
  const text = payloadText(row);
  for (const pattern of PUBLIC_LEAK_PATTERNS) {
    if (pattern.test(text)) {
      leaks.push({
        event_id: String(row.event_id),
        event_type: row.event_type,
        field: row.payload?.field || '',
        pattern: String(pattern),
        sample: text.slice(0, 220),
      });
    }
  }
}

const providerRawRows = audit.filter((row) => row.stage === 'provider.raw_event');
const providerBatchRows = audit.filter((row) => row.stage === 'provider.batch_response');
const lowLevelRawRows = providerRawRows.filter((row) => row.provider !== 'dspy_lm');
const lowLevelBatchRows = providerBatchRows.filter((row) => row.provider !== 'dspy_lm');
const lowLevelProviderRows = (lowLevelRawRows.length ? lowLevelRawRows : lowLevelBatchRows).sort(
  (left, right) => (left.ts || 0) - (right.ts || 0),
);
const bridgeRows = audit.filter((row) => row.stage === 'bridge.contract_field');
const emitRows = audit.filter((row) => row.stage === 'sse.normalized_emit');
const normalizedTiming = orderedTiming(normalized, writesByKey);
const states = normalized
  .filter((row) => row.event_type === 'state.updated')
  .map((row) => ({
    event_id: Number(row.event_id),
    visibility: row.payload?.visibility || '',
    keys: Object.keys(row.payload?.value || {}),
  }));

const report = {
  sessionId,
  received: received.length,
  sentLogRows: writes.length,
  matched: received.length - missing.length,
  missingCount: missing.length,
  duplicateWriteCandidateCount,
  missing: missing.slice(0, 20).map((row) => ({
    event_id: row.event_id,
    event_type: row.event_type,
    event_occurred_at: row.event_occurred_at,
  })),
  sequenceViolations,
  normalizedCount: normalized.length,
  publicLeakCount: leaks.length,
  leaks,
  providerRawEventCount: providerRawRows.length,
  providerBatchResponseCount: providerBatchRows.length,
  lowLevelProviderEventCount: lowLevelRawRows.length + lowLevelBatchRows.length,
  providerTimingAnchorCount: lowLevelProviderRows.length,
  providerStages: stageCounts([...providerRawRows, ...providerBatchRows]),
  providerChannels: stageCounts([...providerRawRows, ...providerBatchRows].map((row) => ({ stage: row.source_channel || 'unknown' }))),
  lowLevelProviderSources: stageCounts(lowLevelProviderRows.map((row) => ({ stage: row.provider || 'unknown' }))),
  bridgeContractFieldCount: bridgeRows.length,
  bridgeVisibleCount: bridgeRows.filter((row) => row.visible).length,
  bridgeSuppressedCount: bridgeRows.filter((row) => row.duplicate_suppressed).length,
  normalizedEmitCount: emitRows.length,
  sseWriteAuditCount: audit.filter((row) => row.stage === 'sse.write').length,
  maxSseWriteToReceivedMs: max(normalizedTiming.map((row) => row.sseWriteToReceivedMs)),
  maxEventOccurredToReceivedMs: max(normalizedTiming.map((row) => row.eventOccurredToReceivedMs)),
  minProviderToBridgeMs: min(providerBridgeTiming(lowLevelProviderRows, bridgeRows, emitRows).map((row) => row.providerToBridgeMs)),
  maxProviderToBridgeMs: max(providerBridgeTiming(lowLevelProviderRows, bridgeRows, emitRows).map((row) => row.providerToBridgeMs)),
  states,
  normalizedTiming,
  providerBridgeTiming: providerBridgeTiming(lowLevelProviderRows, bridgeRows, emitRows),
};

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
