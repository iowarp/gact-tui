/**
 * The mock must emit the REAL wire, not a plausible one.
 *
 * Every wire-field bug this rebuild hit was a guess that no fixture could
 * falsify — `routing_decision.expert` instead of `selected_agent`, `AgentDef
 * .name` instead of `title`, a slash id double-prefixed. A mock that invents
 * field names cannot catch any of them; it manufactures agreement with itself.
 *
 * Ground truth is `contract/testdata/observed-part-model-v0.3.json`, captured
 * from clio-agent 0.9.0+42522bb1 by reflecting the Part model, and
 * `observed-parts-v0.3.json`, read out of live session ledgers.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MOCK_WIRE_MESSAGE } from '../e2e/mock-backend';
import observedModel from '../../../../contract/testdata/observed-part-model-v0.3.json';
import observedParts from '../../../../contract/testdata/observed-parts-v0.3.json';

const MODEL_FIELDS = new Set(Object.keys(observedModel.part_model.fields));

describe('captured ground truth', () => {
  it('describes the Part model as a flat union', () => {
    // Not a discriminated union: every part carries every field, and absent
    // values are DEFAULTS rather than missing keys. Assuming per-kind field
    // sets is what produced the guesses above.
    expect(observedModel.part_model.shape).toMatch(/FLAT UNION/);
    expect(observedModel.part_model.field_count).toBeGreaterThanOrEqual(56);
  });

  it('records which kinds live sessions have actually produced', () => {
    expect(observedParts.observed_kinds).toEqual([
      'expert_handoff',
      'routing_decision',
      'text',
      'thinking',
      'tool_call',
      'tool_result',
    ]);
  });

  it('every observed sample uses only fields the model declares', () => {
    for (const [kind, sample] of Object.entries(observedParts.samples)) {
      for (const field of Object.keys(sample as Record<string, unknown>)) {
        expect(MODEL_FIELDS, `observed ${kind}.${field} is not in the model`).toContain(field);
      }
    }
  });
});

describe('mock wire conformance', () => {
  it('uses no field the real Part model does not declare', () => {
    const offenders: string[] = [];
    for (const part of MOCK_WIRE_MESSAGE.parts as Array<Record<string, unknown>>) {
      for (const field of Object.keys(part)) {
        if (!MODEL_FIELDS.has(field)) offenders.push(`${String(part['type'])}.${field}`);
      }
    }
    expect(offenders, `invented fields: ${offenders.join(', ')}`).toEqual([]);
  });

  it('carries tool identity in call_id / tool_name', () => {
    const call = (MOCK_WIRE_MESSAGE.parts as Array<Record<string, unknown>>).find(
      (p) => p['type'] === 'tool_call',
    );
    expect(call?.['tool_name']).toBeTruthy();
    expect(call?.['call_id']).toBeTruthy();
    expect(call).not.toHaveProperty('name');
  });

  it('puts thinking text in `text`, as the emitter does', () => {
    const think = (MOCK_WIRE_MESSAGE.parts as Array<Record<string, unknown>>).find(
      (p) => p['type'] === 'thinking',
    );
    expect(think?.['text']).toBeTruthy();
    expect(think).not.toHaveProperty('thinking');
  });

  it('models tool_result content as a list of parts, not a string', () => {
    const result = (MOCK_WIRE_MESSAGE.parts as Array<Record<string, unknown>>).find(
      (p) => p['type'] === 'tool_result',
    );
    expect(Array.isArray(result?.['content'])).toBe(true);
  });

  it('addresses an mcp_app by resource_uri and app_instance_id', () => {
    const app = (MOCK_WIRE_MESSAGE.parts as Array<Record<string, unknown>>).find(
      (p) => p['type'] === 'mcp_app',
    );
    expect(app?.['resource_uri']).toBeTruthy();
    expect(app?.['app_instance_id']).toBeTruthy();
  });

  it('covers every part kind the rebuild renders', () => {
    const kinds = (MOCK_WIRE_MESSAGE.parts as Array<Record<string, unknown>>).map((p) =>
      String(p['type']),
    );
    for (const required of [
      'expert_handoff',
      'mcp_app',
      'resource_link',
      'file_diff',
      'background_exit',
      'agent_message',
    ]) {
      expect(kinds).toContain(required);
    }
  });
});

describe('SPEC v0.3 states what was captured', () => {
  // The SPEC is prose and drifts silently. These bind its load-bearing claims
  // to the capture, so a stale document fails instead of merely misleading.
  const spec = readFileSync(resolve(__dirname, '../../../../contract/SPEC.md'), 'utf-8');

  it('is titled v0.3', () => {
    expect(spec.split('\n')[0]).toContain('GACT v0.3');
  });

  it('states the flat union rather than a discriminated one', () => {
    expect(spec).toMatch(/FLAT UNION/);
    expect(spec).toMatch(/defaults, not omitted keys|default.*not.*omitted/i);
  });

  it('quotes the captured field count', () => {
    expect(spec).toContain(String(observedModel.part_model.field_count));
  });

  it('lists exactly the kinds the capture observed', () => {
    // The captured-kinds paragraph must not drift from the capture itself.
    const section = spec.slice(spec.indexOf('#### 4.5.1'), spec.indexOf('#### 4.5.2'));
    for (const kind of observedParts.observed_kinds) {
      expect(section, `SPEC 4.5.1 omits observed kind ${kind}`).toContain(kind);
    }
  });

  it('names every model field in its field-group table', () => {
    // A field the model has and the SPEC never mentions is undocumented wire.
    const section = spec.slice(spec.indexOf('#### 4.5.2'), spec.indexOf('#### 4.5.3'));
    const missing = [...MODEL_FIELDS].filter((f) => !section.includes(`\`${f}\``));
    expect(missing, `undocumented fields: ${missing.join(', ')}`).toEqual([]);
  });

  it('never ASSERTS that thinking carries a `thinking` field', () => {
    // Quoting the old claim in the corrections table is the point of that
    // table, so the check is per-line: any line mentioning `thinking: string`
    // must also carry the correction to `text: string`.
    const asserted = spec
      .split('\n')
      .filter((line) => line.includes('`thinking: string`') && !line.includes('`text: string`'));
    expect(asserted, `uncorrected claims:\n${asserted.join('\n')}`).toEqual([]);
  });

  it('is honest that the wire still reports contract_version 0.2', () => {
    expect(spec).toMatch(/contract_version.{0,40}still.{0,20}0\.2|still `"0\.2"`/);
  });
});
