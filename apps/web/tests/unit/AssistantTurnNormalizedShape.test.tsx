import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { AssistantTurnView } from '../../src/components/AssistantTurnView.js';
import type { TurnRow } from '../../src/components/transcriptDelegationModel.js';

afterEach(cleanup);

describe('AssistantTurnView normalized stream shape', () => {
  it('renders the canonical flat agent/tool/return log with optional thinking counts', () => {
    const rows: TurnRow[] = [
      {
        kind: 'text',
        id: 'main-thought',
        agent: 'main',
        depth: 0,
        text: 'The user asks for a complete GNSS workflow.',
        providerThinking: {
          text: 'provider auxiliary output',
          source: 'claude_code_sdk',
          chars: 25,
        },
      },
      {
        kind: 'delegation',
        id: 'call-geo',
        parent: 'main',
        agent: 'geospatial',
        depth: 0,
        status: 'running',
        task: 'Resolve Los Angeles to geographic coordinates and a search region.',
      },
      {
        kind: 'text',
        id: 'geo-thought',
        agent: 'geospatial',
        depth: 1,
        text: 'The request gives a place name.',
      },
      {
        kind: 'tool',
        id: 'tool-geo',
        agent: 'geospatial',
        depth: 1,
        name: 'geo_geocode',
        argsSummary: 'query: Los Angeles',
        thought: 'I must call `geo_geocode` to resolve the place.',
        ok: true,
        result: 'display_name: Los Angeles\nlat: 34.0536909\nlon: -118.242766',
        preview: 'display_name: Los Angeles\nlat: 34.0536909\nlon: -118.242766',
        content: {
          kind: 'text',
          text: 'display_name: Los Angeles\nlat: 34.0536909\nlon: -118.242766',
        },
      },
      {
        kind: 'return',
        id: 'return-geo',
        agent: 'geospatial',
        parent: 'main',
        depth: 1,
        text: 'Resolved region: Los Angeles.',
        raw: 'Resolved region: Los Angeles.\ncenter: 34.05, -118.24; radius_km: 50',
      },
    ];

    render(() => <AssistantTurnView rows={rows} density="normal" />);

    expect(screen.getByTestId('assistant-turn-provider-thinking').textContent).toContain(
      'thinking(25 chars)',
    );
    expect(screen.getByLabelText('Toggle provider thinking')).toBeTruthy();
    expect(screen.getByTestId('assistant-turn-step').textContent).toContain('call(geospatial)');
    expect(screen.getByTestId('assistant-turn-task').textContent).toContain(
      'Resolve Los Angeles',
    );
    expect(screen.getByTestId('assistant-turn-tool').textContent).toContain('geo_geocode');
    expect(screen.getByTestId('assistant-turn-tool-thought').textContent).toContain(
      'geo_geocode',
    );
    expect(screen.getByTestId('assistant-turn-tool').textContent).toContain(
      'display_name: Los Angeles',
    );

    // raw carries MORE than the rendered body, so the "details" disclosure is
    // offered and reveals the raw payload (when raw only repeats text, it's hidden).
    const toggle = screen.getByTestId('assistant-turn-return-toggle');
    expect(toggle.textContent).toContain('details');
    fireEvent.click(toggle);
    expect(screen.getByTestId('assistant-turn-return-raw').textContent).toContain('radius_km: 50');

    expect(screen.queryByText('workflow_state')).toBeNull();
    expect(screen.queryByText('[[ ##')).toBeNull();
  });

  it('uses the same prose style for tool thoughts and normal text', () => {
    const rows: TurnRow[] = [
      {
        kind: 'text',
        id: 'text',
        agent: 'geospatial',
        depth: 0,
        text: 'I must call `geo_geocode` to resolve the place.',
      },
      {
        kind: 'tool',
        id: 'tool',
        agent: 'geospatial',
        depth: 0,
        name: 'geo_geocode',
        argsSummary: 'query: Los Angeles',
        thought: 'I must call `geo_geocode` to resolve the place.',
        ok: true,
        result: '',
        preview: '',
        content: { kind: 'text', text: '' },
      },
    ];

    render(() => <AssistantTurnView rows={rows} density="normal" />);

    const textBody = screen.getByTestId('assistant-turn-result');
    const toolThought = screen.getByTestId('assistant-turn-tool-thought');
    const textStyle = getComputedStyle(textBody);
    const toolStyle = getComputedStyle(toolThought);
    expect(toolStyle.fontSize).toBe(textStyle.fontSize);
    expect(toolStyle.lineHeight).toBe(textStyle.lineHeight);
    expect(toolStyle.color).toBe(textStyle.color);
    expect(toolStyle.fontFamily).toBe(textStyle.fontFamily);
  });
});
