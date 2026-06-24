import type { Capabilities, Message, Part, SemanticEventPayload, Session } from '@clio/core';

export const NOW = '2026-06-16T12:00:00Z';

export type VisualCase = 'markdown' | 'earthscope' | 'earthscope-blocked' | 'fulldata';

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
        input: { location: 'Los Angeles, CA', radius_km: 50 },
      },
      {
        type: 'tool_result',
        call_id: 'tc-geo',
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
        type: 'tool_call',
        call_id: 'tc-stations',
        tool_name: 'EarthScopeStationCatalog',
        input: { network: 'GNSS', bbox: [33.7, -118.67, 34.34, -117.9] },
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
          output_summary:
            "Child expert 'ndp_dataset_discovery' failed while delegated from 'data': _UnsupportedSessionAgent. ndp_dataset_discovery\n\n" +
            'CLIO durable typed workflow state:\n' +
            JSON.stringify({
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
            }),
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
  return earthscopeMessages;
}

export function semanticEventsForCase(visualCase: VisualCase): SemanticEventPayload[] {
  return visualCase === 'earthscope' ? earthscopeEvents : [];
}

export function sessionForCase(visualCase: VisualCase): Session {
  return {
    id:
      visualCase === 'markdown'
        ? 'mock-markdown'
        : visualCase === 'earthscope-blocked'
          ? 'mock-earthscope-blocked'
          : visualCase === 'fulldata'
            ? 'mock-fulldata'
            : 'mock-earthscope',
    title:
      visualCase === 'markdown'
        ? 'markdown release read'
        : visualCase === 'earthscope-blocked'
          ? 'earthscope ndp blocked'
          : visualCase === 'fulldata'
            ? 'full-data surfaces'
            : 'earthscope gnss los angeles',
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
    },
    transports: { events_sse: true, events_websocket: false },
    auth: { schemes: ['trust_socket'], current: 'trust_socket' },
    extensions: [],
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
