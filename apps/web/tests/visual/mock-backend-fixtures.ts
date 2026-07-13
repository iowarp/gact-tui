import type {
  AgentsResult,
  Capabilities,
  ContextState,
  Message,
  Part,
  SemanticEventPayload,
  Session,
} from '@clio/core';

import earthscopeRealTrace from './fixtures/earthscope-real-trace.json' with { type: 'json' };
import samplePlot from './fixtures/sample-plot.json' with { type: 'json' };

export const NOW = '2026-06-16T12:00:00Z';

export type VisualCase =
  | 'markdown'
  | 'earthscope'
  | 'earthscope-blocked'
  | 'fulldata'
  | 'earthscope-real'
  | 'nested-depth'
  | 'transcript-artifacts';

/** The saved real clio run (GET /messages, session sess_f81710c00d95, captured
 *  from the post-#880/#881 server — the clean presentation-model wire). One user
 *  msg + one assistant msg with 135 ordered parts: provider `thinking` (SDK CoT),
 *  agent `text` (`reasoning`/`next_thought`), 10 delegate.started + 10
 *  delegate.completed handoffs (each delegation minted ONCE, no dedup), 10
 *  structural `parent.resumed` twins, `routing_decision` plumbing, and the
 *  tool_call/tool_result pairs of the LA GNSS pipeline
 *  (geospatial → data → {ndp_dataset_discovery, earthscope_station_catalog,
 *  ndp_resource_resolver} → analysis → {gnss_timeseries_analysis,
 *  station_network_analysis} → visualization → synthesis). Copied VERBATIM from
 *  the live capture — never hand-edited. Sorted oldest-first so the transcript
 *  shows the user prompt before the assistant turn. */
const earthscopeRealMessages: Message[] = (
  earthscopeRealTrace as { messages: Message[] }
).messages
  .slice()
  .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));

/**
 * A 2-level delegation chain: main → data → ndp_dataset_discovery, in the
 * post-#880 clean-wire shape — each delegation is a typed `delegate.started`
 * EDGE (parent_agent/child_agent/stage), so the render mints one delegation step
 * per edge. main → data sits at depth 0; data → ndp_dataset_discovery sits at
 * depth 1 (a child of `data`). Proves the depth indentation: the child edge sits
 * one visible level deeper than its parent edge.
 */
const nestedDepthMessages: Message[] = [
  {
    id: 'm-nested-user',
    session_id: 'mock-nested',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [
      {
        type: 'text',
        text: 'Discover an EarthScope GNSS dataset for Los Angeles and stage it for analysis.',
      },
    ],
  },
  {
    id: 'm-nested-asst',
    session_id: 'mock-nested',
    role: 'assistant',
    created_at: '2026-06-16T12:00:05Z',
    parts: [
      {
        // A delegation EDGE in the post-#880 shape (metadata-borne typed fields,
        // the shape the wire fixture carries; the model reads delegate_to/parent_id/
        // stage from metadata). main → data, at depth 0.
        type: 'expert_handoff',
        text: 'main -> data',
        metadata: {
          parent_id: 'main',
          agent_id: 'data',
          delegate_to: 'data',
          status: 'running',
          stage: 'delegate.started',
          question:
            'Take ownership of data acquisition for the Los Angeles GNSS request: discover a ' +
            'concrete EarthScope dataset, stage a real time-series CSV, and record its provenance.',
        },
      },
      {
        // data → ndp_dataset_discovery: a child of `data`, so this edge sits one
        // level deeper (depth 1).
        type: 'expert_handoff',
        text: 'data -> ndp_dataset_discovery',
        metadata: {
          parent_id: 'data',
          agent_id: 'ndp_dataset_discovery',
          delegate_to: 'ndp_dataset_discovery',
          status: 'running',
          stage: 'delegate.started',
          question:
            'Search the National Data Platform catalog for EarthScope GNSS stations within the ' +
            'resolved Los Angeles bounding box, rank candidates by distance-to-center and data ' +
            'freshness, and return the top station with its download URL and metadata reference.',
        },
      },
      {
        type: 'text',
        metadata: { stream_source: 'main', agent_id: 'main' },
        text:
          '## Dataset staged\n\n' +
          'I discovered and staged **MTA1**, the closest high-quality EarthScope GNSS station to ' +
          'Los Angeles (0.3 km from center), with recent December 2024 data. The CSV is staged ' +
          'locally and ready for displacement/uncertainty profiling.',
      },
    ],
  },
];

/**
 * One assistant turn carrying an inline IMAGE part, a long MARKDOWN text part,
 * and a FILE_DIFF part — each must render a TOP PREVIEW + expand, the same
 * compaction semantics as tool returns.
 */
const transcriptArtifactsMessages: Message[] = [
  {
    id: 'm-artifacts-user',
    session_id: 'mock-artifacts',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [{ type: 'text', text: 'Plot the station displacement and write the analysis script.' }],
  },
  {
    id: 'm-artifacts-asst',
    session_id: 'mock-artifacts',
    role: 'assistant',
    created_at: '2026-06-16T12:00:06Z',
    parts: [
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'main',
          agent_id: 'visualization',
          delegate_to: 'visualization',
          status: 'completed',
          stage: 'delegate.completed',
        },
        text:
          'main -> visualization | completed | delegate.completed | Rendered the MTA1 displacement time-series. ' +
          'The plot below shows north/east/up components over the staged window; the script and a ' +
          'long methodology note follow.',
      },
      {
        type: 'image',
        // A 600x300 PNG — renders as a real <img> capped to a thumbnail, then
        // enlarges on click.
        source: {
          kind: 'base64',
          media_type: samplePlot.media_type,
          data: samplePlot.data,
        },
        metadata: { title: 'MTA1 displacement plot' },
      },
      {
        type: 'text',
        text:
          '## Methodology (long)\n\n' +
          Array.from({ length: 20 }, (_, i) => `- Step ${i + 1}: processed component band ${i + 1} and removed outliers beyond 3σ.`).join('\n'),
      },
      {
        type: 'file_diff',
        path: 'analysis/mta1_plot.py',
        edit_mode: 'whole',
        lines_added: 24,
        lines_removed: 0,
        unified_diff: [
          '--- a/analysis/mta1_plot.py',
          '+++ b/analysis/mta1_plot.py',
          '@@ -0,0 +1,24 @@',
          ...Array.from({ length: 24 }, (_, i) => `+line ${i + 1} of the generated plotting script`),
        ].join('\n'),
      },
    ],
  },
];

const markdownMessages: Message[] = [
  {
    id: 'm-md-user',
    session_id: 'mock-markdown',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [{ type: 'text', text: 'Read docs/release.md and summarize the readiness checklist.' }],
  },
  {
    id: 'm-md-asst',
    session_id: 'mock-markdown',
    role: 'assistant',
    created_at: '2026-06-16T12:00:03Z',
    parts: [
      {
        type: 'tool_call',
        call_id: 'tc-read-md',
        tool_name: 'ReadFile',
        input: { path: 'docs/release.md' },
      },
      {
        type: 'text',
        text:
          '# Release Readiness\n\n' +
          '| Area | Status | Owner |\n' +
          '| --- | --- | --- |\n' +
          '| Rendering pipeline | Ready | TUI |\n' +
          '| Markdown preview | Ready | Web |\n' +
          '| CLIO live benchmark | Waiting on backend | CLIO |\n\n' +
          '- The rendering rewrite is in place.\n' +
          '- Diffs open in the review rail instead of a raw blob.\n' +
          '- Streaming proof still depends on the live provider path.\n\n' +
          '```bash\n' +
          'pnpm test:visual -- tests/visual/screenshots.spec.ts\n' +
          '```',
      },
    ],
  },
];

const earthscopeMessages: Message[] = [
  {
    id: 'm-earth-user',
    session_id: 'mock-earthscope',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [
      {
        type: 'text',
        text: "What recent ground-motion is EarthScope's GNSS network showing around Los Angeles? Pull a real station's time series, plot it, and tell me how much to trust the data.",
      },
    ],
  },
  {
    id: 'm-earth-asst',
    session_id: 'mock-earthscope',
    role: 'assistant',
    created_at: '2026-06-16T12:00:04Z',
    parts: [
      {
        type: 'tool_call',
        call_id: 'tc-geo',
        tool_name: 'ResolveRegion',
        metadata: { agent_id: 'geospatial' },
        input: { location: 'Los Angeles, CA', radius_km: 50 },
      },
      {
        type: 'tool_result',
        call_id: 'tc-geo',
        metadata: { agent_id: 'geospatial' },
        output:
          'Resolved Los Angeles, CA; center 34.0522, -118.2437; radius 50 km; confidence high.',
        duration_ms: 2025,
      },
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'main',
          agent_id: 'geospatial',
          status: 'completed',
          output_summary:
            JSON.stringify({
              REGION_LABEL: 'Los Angeles',
              CENTER_LAT: 34.0522,
              CENTER_LON: -118.2437,
              RADIUS_KM: 50,
              CONFIDENCE: 'high',
            }) +
            '\n\nCLIO durable typed workflow state:\n' +
            JSON.stringify({
              workflow_state: {
                geospatial: {
                  status: 'resolved',
                  region_name: 'Los Angeles',
                  confidence: 'high',
                },
              },
            }),
        },
      },
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'main',
          agent_id: 'data',
          status: 'completed',
          output_summary:
            'Data needs a ranked EarthScope station before staging a CSV, so it delegated catalog discovery.',
        },
      },
      {
        type: 'tool_call',
        call_id: 'tc-stations',
        tool_name: 'EarthScopeStationCatalog',
        metadata: { agent_id: 'earthscope_catalog' },
        input: { network: 'GNSS', bbox: [33.7, -118.67, 34.34, -117.9] },
      },
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'data',
          agent_id: 'earthscope_catalog',
          status: 'completed',
          output_summary:
            'Ranked nearby GNSS stations and selected MTA1 with PKRD and ELSC as corroborating stations.',
        },
      },
      {
        type: 'text',
        text:
          'The workflow selected **MTA1** as the nearest station and kept nearby stations as context.\n\n' +
          'Ranked EarthScope GNSS stations | Rank | Station | Distance km | Note | | ---: | --- | ---: | --- | | 1 | MTA1 | 0.37 | selected | | 2 | PKRD | 2.37 | corroboration | | 3 | ELSC | 4.10 | corroboration |\n\n' +
          'Trust is **moderate** until the time-series plot and station health metadata are both present.\n\n' +
          'CLIO typed workflow state:\n' +
          JSON.stringify({
            workflow_state: {
              geospatial: {
                status: 'resolved',
                region_name: 'Los Angeles',
                confidence: 'high',
              },
              station_catalog: {
                status: 'ranked',
                candidate_count: 72,
              },
              artifact: {
                status: 'ready',
                path: '/tmp/grind-es-demo/MTA1_plot.png',
              },
            },
          }),
      },
    ],
  },
];

const earthscopeBlockedMessages: Message[] = [
  {
    id: 'm-earth-blocked-user',
    session_id: 'mock-earthscope-blocked',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [
      {
        type: 'text',
        text: 'Explore recent seismic/geodetic activity around the San Diego area and stage EarthScope/NDP GNSS evidence.',
      },
    ],
  },
  {
    id: 'm-earth-blocked-asst',
    session_id: 'mock-earthscope-blocked',
    role: 'assistant',
    created_at: '2026-06-16T12:00:04Z',
    stop_reason: 'end_turn',
    parts: [
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'main',
          agent_id: 'geospatial',
          status: 'completed',
          output_summary:
            JSON.stringify({
              REGION_LABEL: 'San Diego area',
              CENTER_LAT: 32.7157,
              CENTER_LON: -117.1611,
              RADIUS_KM: 50,
              CONFIDENCE: 'high',
            }) +
            '\n\nCLIO durable typed workflow state:\n' +
            JSON.stringify({
              workflow_state: {
                geospatial: {
                  status: 'resolved',
                  region_name: 'San Diego area',
                  confidence: 'high',
                },
              },
            }),
        },
      },
      {
        type: 'expert_handoff',
        metadata: {
          parent_id: 'data',
          agent_id: 'ndp_dataset_discovery',
          status: 'failed',
          // Post-#880 wire: the durable typed workflow-state dict rides on the
          // handoff metadata as a first-class field — it is NOT embedded in
          // `output_summary` prose (that retired format is no longer scraped by
          // the render). The failed delegation entry carries a structural
          // `error`, which the render surfaces as a user-facing workflow blocker.
          workflow_state: {
            geospatial: {
              status: 'resolved',
              region_name: 'San Diego area',
              confidence: 'high',
            },
            delegation: {
              status: 'failed',
              failed_child: 'ndp_dataset_discovery',
              parent: 'data',
              error: '_UnsupportedSessionAgent',
              message: 'ndp_dataset_discovery',
            },
            acquisition: {
              analysis_ready: false,
            },
          },
          output_summary:
            "Child expert 'ndp_dataset_discovery' failed while delegated from 'data': _UnsupportedSessionAgent.",
        },
      },
      {
        type: 'text',
        text: 'The San Diego region was resolved, but the downstream NDP discovery expert could not start because the required tools were not available in this session. No station time-series, CSV profile, or PNG artifact was produced.',
      },
    ],
  },
];

// earthscopeEvents drive the projected, hierarchical execution tree shown in
// the conversation (cf. ExecutionTree). They carry structured `payload`/`actor`
// fields (not just a `summary`) so the projection produces real agent names, a
// delegation question, a react step with a tool call + an expandable
// observation, and an expert report — i.e. an honest multi-agent turn:
//   main → geospatial (thought + geocode tool call + collapsed observation),
//   geospatial returns, then data → earthscope_catalog ranks stations.
const earthscopeEvents: SemanticEventPayload[] = [
  {
    event_id: 'se-1',
    event_type: 'agent.invocation.started',
    status: 'running',
    summary: 'main started the EarthScope GNSS workflow.',
    turn_id: 'm-earth-user',
    occurred_at: '2026-06-16T12:00:01Z',
  },
  {
    event_id: 'se-2',
    event_type: 'blueprint.delegation.started',
    status: 'running',
    summary: 'main handed region resolution to geospatial.',
    turn_id: 'm-earth-user',
    actor: { agent_id: 'main' },
    subject: { agent_id: 'geospatial' },
    payload: {
      parent_id: 'main',
      delegate_to: 'geospatial',
      question: 'Resolve the bounding box for Los Angeles.',
    },
    occurred_at: '2026-06-16T12:00:02Z',
  },
  {
    event_id: 'se-2b',
    event_type: 'react.step.completed',
    status: 'completed',
    turn_id: 'm-earth-user',
    actor: { agent_id: 'geospatial' },
    payload: {
      expert_id: 'geospatial',
      thought: 'Need the city centre and bounds before staging GNSS stations.',
      reasoning: 'Geocoding Los Angeles returns the canonical centroid for the radius query.',
      tool_name: 'geocode_location',
      tool_args: { query: 'Los Angeles, CA' },
      observation: JSON.stringify({
        display_name: 'Los Angeles, California, USA',
        lat: 34.0522,
        lon: -118.2437,
        boundingbox: ['33.70', '34.34', '-118.67', '-118.16'],
        place_rank: 16,
        importance: 0.97,
        osm_type: 'relation',
      }),
      is_finish: false,
    },
    occurred_at: '2026-06-16T12:00:03Z',
  },
  {
    event_id: 'se-2c',
    event_type: 'expert.extract.completed',
    status: 'completed',
    turn_id: 'm-earth-user',
    actor: { agent_id: 'geospatial' },
    payload: {
      expert_id: 'geospatial',
      output: 'Los Angeles resolved.',
      structured: {
        region_name: 'Los Angeles',
        center_lat: 34.0522,
        center_lon: -118.2437,
        radius_km: 100,
        confidence: 0.97,
      },
    },
    occurred_at: '2026-06-16T12:00:04Z',
  },
  {
    event_id: 'se-3',
    event_type: 'blueprint.delegation.completed',
    status: 'completed',
    summary: 'geospatial returned Los Angeles bounds.',
    turn_id: 'm-earth-user',
    actor: { agent_id: 'geospatial' },
    subject: { agent_id: 'main' },
    payload: { delegate_to: 'geospatial', return_to: 'main' },
    occurred_at: '2026-06-16T12:00:04Z',
  },
  {
    event_id: 'se-4',
    event_type: 'blueprint.delegation.started',
    status: 'running',
    summary: 'data handed station discovery to earthscope_catalog.',
    turn_id: 'm-earth-user',
    actor: { agent_id: 'data' },
    subject: { agent_id: 'earthscope_catalog' },
    payload: {
      parent_id: 'data',
      delegate_to: 'earthscope_catalog',
      question: 'Rank GNSS stations within 100 km of the centroid.',
    },
    occurred_at: '2026-06-16T12:00:05Z',
  },
  {
    event_id: 'se-5',
    event_type: 'blueprint.delegation.completed',
    status: 'completed',
    summary: 'earthscope_catalog ranked nearby GNSS stations.',
    turn_id: 'm-earth-user',
    actor: { agent_id: 'earthscope_catalog' },
    subject: { agent_id: 'data' },
    payload: { delegate_to: 'earthscope_catalog', return_to: 'data' },
    occurred_at: '2026-06-16T12:00:10Z',
  },
];

// fullDataMessages exercises every full-data surface added in the v0.2 cut so a
// single screenshot proves they render: routing detail (confidence +
// execution_path + heuristic/LM), tool telemetry (cached + duration_ms), the 8
// new part types, and an unrecognised type that must hit the forward-compat
// fallback rather than vanish (SPEC §2/§8.3).
const unknownPart = {
  type: 'crystal_ball_prediction',
  prophecy: 'a part type this client release does not know yet',
} as unknown as Part;

const fullDataMessages: Message[] = [
  {
    id: 'm-fd-user',
    session_id: 'mock-fulldata',
    role: 'user',
    created_at: '2026-06-16T12:00:01Z',
    parts: [{ type: 'text', text: 'Find the nearest GNSS stations and cite the data policy.' }],
  },
  {
    id: 'm-fd-asst',
    session_id: 'mock-fulldata',
    role: 'assistant',
    created_at: '2026-06-16T12:00:03Z',
    model: { provider_id: 'argonne_sophia', model_id: 'openai/gpt-oss-120b' },
    parts: [
      {
        type: 'routing_decision',
        selected_agent: 'geo-specialist',
        rationale: 'Query matches the geospatial keyword set; delegating to the GNSS expert.',
        confidence: 0.92,
        heuristic: false,
        execution_path: 'expert_loop',
      },
      {
        type: 'tool_call',
        call_id: 'tc-stations',
        tool_name: 'any_mcp_filter_points',
        input: { region: 'Los Angeles', radius_km: 100 },
      },
      {
        type: 'tool_result',
        call_id: 'tc-stations',
        output: JSON.stringify({ matched: 72, nearest: 'MTA1', distance_km: 0.37 }),
        cached: true,
        duration_ms: 1840,
      },
      {
        type: 'subagent_call',
        subsession_id: 'sub-1',
        agent_id: 'gnss-analyst',
        prompt: 'Rank the 72 matched stations by data completeness.',
      },
      {
        type: 'subagent_result',
        subsession_id: 'sub-1',
        summary: 'Ranked 72 stations; the top 5 exceed 98% completeness over the last 30 days.',
        final_message_id: 'm-sub-final',
      },
      {
        type: 'resource_link',
        uri: 'mcp://earthscope/stations/MTA1',
        name: 'MTA1 station metadata',
        description: 'GNSS station record for MTA1 (Los Angeles).',
        mime_type: 'application/json',
      },
      {
        type: 'resource',
        uri: 'mcp://earthscope/readme',
        mime_type: 'text/markdown',
        content: [{ type: 'text', text: 'EarthScope GNSS network — 1,100+ continuous stations.' }],
      },
      {
        type: 'document',
        title: 'EarthScope Data Policy',
        context: 'Section 3 — attribution requirements for derived products.',
        source: { kind: 'url', url: 'https://www.earthscope.org/data/policy', media_type: 'text/html' },
        citations: { enabled: true },
      },
      {
        type: 'text',
        text: 'The nearest station is **MTA1** at 0.37 km. Derived products require attribution.',
      },
      {
        type: 'citation',
        text: 'attribution required for derived products',
        source: { type: 'document', reference: 'EarthScope Data Policy §3' },
        text_range: { start: 0, end: 41 },
      },
      {
        type: 'agent_question',
        question: {
          id: 'q-1',
          prompt: 'Export the ranked stations as CSV or GeoJSON?',
          status: 'pending',
          kind: 'choice',
          choices: ['CSV', 'GeoJSON'],
        },
      },
      {
        type: 'retry_attempt',
        retry_attempt: { attempt: 2, max_attempts: 3, reason: 'provider timeout on attempt 1' },
      },
      unknownPart,
    ],
  },
];

export function messagesForCase(visualCase: VisualCase): Message[] {
  if (visualCase === 'markdown') return markdownMessages;
  if (visualCase === 'earthscope-blocked') return earthscopeBlockedMessages;
  if (visualCase === 'fulldata') return fullDataMessages;
  if (visualCase === 'earthscope-real') return earthscopeRealMessages;
  if (visualCase === 'nested-depth') return nestedDepthMessages;
  if (visualCase === 'transcript-artifacts') return transcriptArtifactsMessages;
  return earthscopeMessages;
}

/** Session id + title per case (the mock backend routes on the session id). */
const SESSION_META: Record<VisualCase, { id: string; title: string }> = {
  markdown: { id: 'mock-markdown', title: 'markdown release read' },
  'earthscope-blocked': { id: 'mock-earthscope-blocked', title: 'earthscope ndp blocked' },
  fulldata: { id: 'mock-fulldata', title: 'full-data surfaces' },
  'earthscope-real': { id: 'sess_f81710c00d95', title: 'earthscope real trace' },
  'nested-depth': { id: 'mock-nested', title: 'nested delegation depth' },
  'transcript-artifacts': { id: 'mock-artifacts', title: 'transcript artifacts' },
  earthscope: { id: 'mock-earthscope', title: 'earthscope gnss los angeles' },
};

export function semanticEventsForCase(visualCase: VisualCase): SemanticEventPayload[] {
  return visualCase === 'earthscope' ? earthscopeEvents : [];
}

export function sessionForCase(visualCase: VisualCase): Session {
  const meta = SESSION_META[visualCase];
  return {
    id: meta.id,
    title: meta.title,
    status: 'finished',
    workspace_id: 'ws-demo',
    created_at: NOW,
    updated_at: NOW,
    message_count: 2,
    mode: 'chat',
    edit_mode: 'diff',
    routing_mode: 'auto',
  };
}

export function capabilities(): Capabilities {
  return {
    contract_version: '0.2',
    backend: { name: 'mock-clio', version: '0.0.0', vendor: 'gact-tui' },
    capabilities: {
      workspaces: true,
      sessions: true,
      files: true,
      diffs: true,
      permissions: true,
      providers: true,
      commands: true,
      metrics: true,
      agent_routing: true,
      thinking_blocks: true,
      structured_errors: true,
      tool_telemetry: true,
      x_clio_semantic_events: true,
      x_clio_context_state: true,
    },
    transports: { events_sse: true, events_websocket: false },
    auth: { schemes: ['trust_socket'], current: 'trust_socket' },
    extensions: [],
  };
}

// --- Per-expert context observer (x_clio_context_state) fixtures -----------
//
// The ContextPanel sources its expert roster from `client.agents()` and the
// segmented bar from `getContextState(sessionId, scope?)`. These fixtures feed
// a realistic, FULL-ish ContextStateResponse so the bar shows multiple colored
// blocks, and vary by scope so switching the expert visibly re-shapes the bar.

/** The expert roster the ContextPanel selector lists (GET /v1/agents). */
export function contextAgentRoster(): AgentsResult {
  return {
    agents: [
      { id: 'main', source: 'builtin', title: 'Main orchestrator', tier: 0 },
      { id: 'geospatial', source: 'builtin', title: 'Geospatial expert', tier: 1 },
      { id: 'data', source: 'builtin', title: 'Data acquisition', tier: 1 },
      {
        id: 'earthscope_catalog',
        source: 'builtin',
        title: 'EarthScope catalog',
        tier: 2,
      },
    ],
  };
}

/**
 * Per-scope category shapes. The session default ("active expert", no scope)
 * is a heavy, near-autocompact working set; named experts are lighter and
 * differently weighted so the bar re-segments when the selector changes.
 */
const CONTEXT_CATEGORY_SHAPES: Record<string, Record<string, number>> = {
  // session default / active expert — a full, late-turn working set
  __default__: {
    system: 18000,
    messages: 64000,
    tools: 12000,
    reasoning: 9000,
    tool_calls: 7000,
    observations: 6000,
    summary: 2000,
    io: 1500,
    framing: 4000,
  },
  geospatial: {
    system: 14000,
    messages: 28000,
    tools: 9000,
    reasoning: 16000,
    tool_calls: 11000,
    observations: 8000,
    summary: 1200,
    io: 900,
    framing: 2600,
  },
  data: {
    system: 12000,
    messages: 41000,
    tools: 6000,
    reasoning: 4000,
    tool_calls: 9000,
    observations: 14000,
    summary: 3200,
    io: 2400,
    framing: 1800,
  },
  earthscope_catalog: {
    system: 9000,
    messages: 16000,
    tools: 21000,
    reasoning: 3000,
    tool_calls: 15000,
    observations: 5000,
    summary: 800,
    io: 600,
    framing: 1500,
  },
};

const CONTEXT_WINDOW_TOKENS = 200000;

/** Build a full ContextState for a (session, scope) pair. */
export function contextStateForScope(
  sessionId: string,
  scope?: string,
): ContextState {
  const key = scope && CONTEXT_CATEGORY_SHAPES[scope] ? scope : '__default__';
  const categories = CONTEXT_CATEGORY_SHAPES[key]!;
  const live = Object.entries(categories)
    .filter(([k]) => k !== 'framing')
    .reduce((sum, [, v]) => sum + v, 0);
  const framing = categories['framing'] ?? 0;
  const used = live + framing;
  const liveBlockCount = Object.values(categories).filter((v) => v > 0).length * 6;
  // tokens_by_kind mirrors the categories at the SegmentKind granularity the
  // backend reports (a 1:1 reflection is fine for the visual proof).
  const tokensByKind: Record<string, number> = {
    SystemPrompt: categories['system'] ?? 0,
    UserMessage: Math.round((categories['messages'] ?? 0) * 0.55),
    AssistantMessage: Math.round((categories['messages'] ?? 0) * 0.45),
    ToolSchema: categories['tools'] ?? 0,
    ToolCall: categories['tool_calls'] ?? 0,
    ToolResult: categories['observations'] ?? 0,
    Reasoning: categories['reasoning'] ?? 0,
    Summary: categories['summary'] ?? 0,
    Attachment: categories['io'] ?? 0,
  };
  return {
    session_id: sessionId,
    scope: scope ?? 'main',
    as_of: Date.parse(NOW),
    window_tokens: CONTEXT_WINDOW_TOKENS,
    live_tokens: live,
    pct_used: live / CONTEXT_WINDOW_TOKENS,
    used_tokens: used,
    used_pct: used / CONTEXT_WINDOW_TOKENS,
    autocompact_pct: 0.85,
    live_block_count: liveBlockCount,
    tokens_by_kind: tokensByKind,
    categories,
    segments: [],
    render_text: '',
    render_keys: {},
  };
}

/**
 * Compacted state after "Compact now": the live working set collapses into a
 * single dominant `summary` bucket (one live block), well under threshold.
 */
export function compactedContextState(
  sessionId: string,
  scope?: string,
): ContextState {
  const categories = { system: 18000, summary: 9000, framing: 1500 };
  const live = categories.system + categories.summary;
  const used = live + categories.framing;
  return {
    session_id: sessionId,
    scope: scope ?? 'main',
    as_of: Date.parse(NOW),
    window_tokens: CONTEXT_WINDOW_TOKENS,
    live_tokens: live,
    pct_used: live / CONTEXT_WINDOW_TOKENS,
    used_tokens: used,
    used_pct: used / CONTEXT_WINDOW_TOKENS,
    autocompact_pct: 0.85,
    live_block_count: 1,
    tokens_by_kind: {
      SystemPrompt: categories.system,
      Summary: categories.summary,
    },
    categories,
    segments: [],
    render_text: '',
    render_keys: {},
  };
}

export function provider() {
  return {
    id: 'argonne_sophia',
    name: 'ALCF Sophia',
    is_authenticated: true,
    default_model: 'openai/gpt-oss-120b',
    api_base: 'https://inference-api.alcf.anl.gov/resource_server/sophia/vllm/v1',
    description: 'Mocked ALCF provider for visual proof.',
  };
}
