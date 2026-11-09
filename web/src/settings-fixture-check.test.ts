// @vitest-environment node
import { it } from 'vitest';
import { ClioRepository } from '@clio/core/v3';

const base = 'http://127.0.0.1:18877';
const transport = {
  async request(req: {
    method: string;
    path: string;
    body?: unknown;
    decode: (value: unknown) => unknown;
  }) {
    const response = await fetch(base + req.path, {
      method: req.method,
      headers: { 'content-type': 'application/json' },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
    if (!response.ok) throw new Error(`${req.method} ${req.path} -> ${response.status}`);
    const text = await response.text();
    return req.decode(text ? JSON.parse(text) : undefined);
  },
  stream() {
    throw new Error('no stream');
  },
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const repo = new ClioRepository(transport as any) as any;
const mode = process.env['CHECK_MODE'];
it('checks settings fixture', async () => {
await fetch(`${base}/__test/reset`, { method: 'POST' });
const checks: Array<[string, () => Promise<unknown>]> = [
  ['summary', () => repo.memorySummary()],
  ['documents all', () => repo.memoryDocuments('all')],
  ['documents user', () => repo.memoryDocuments('user')],
  ['documents ws', () => repo.memoryDocuments('project/ws_flat_ndp')],
  ['document one', () => repo.memoryDocument('project/ws_flat_ndp/topics/topics')],
  ['versions', () => repo.memoryVersions('user/profile/profile')],
  ['proposals', () => repo.memoryProposals('pending')],
  ['creation runs', () => repo.memoryCreationRuns()],
  ['memory stats', () => repo.memoryStatistics()],
  ['memory stats session', () => repo.memoryStatistics(undefined, 'sess_flat_ndp')],
  ['policies', () => repo.policies()],
  ['hooks', () => repo.hooks()],
  ['metrics', () => repo.runtimeMetrics()],
  ['schedules', () => repo.scheduledTurns('sess_flat_ndp')],
  ['storage providers', () => repo.storageProviders()],
  ['prompts', () => repo.prompts()],
  ['prompt one', () => repo.prompt('system', { profile: 'concise' })],
];
if (mode === 'rich') {
  await fetch(`${base}/__test/settings-rich`, { method: 'POST' });
  for (const [name, run] of checks) {
    const value = await run();
    const size = Array.isArray(value)
      ? value.length
      : JSON.stringify(value).slice(0, 110);
    console.log('OK', name, size);
  }
  const policies = await repo.policies();
  const echoed = await repo.updatePolicies(policies.slice(0, 2));
  console.log('OK put policies', echoed.length, (await repo.policies()).length);
  const accepted = await repo.acceptMemoryProposal('mp_metric_units');
  console.log('OK accept', accepted.status, accepted.id);
  const rejected = await repo.rejectMemoryProposal('mp_python_retire');
  console.log('OK reject', rejected.status, (await repo.memorySummary()).inbox);
  const prefs = await repo.memoryDocument('user/preferences/preferences');
  console.log('OK pref facts', prefs.facts.length);
  const created = await repo.createScheduledTurn('sess_flat_ndp', {
    question: 'Test',
    cron: '0 8 * * *',
    recurring: true,
    timezone: 'America/Chicago',
    overlap_policy: 'queue',
  });
  console.log('OK create', created.id);
  const patched = await repo.setScheduleEnabled('sess_flat_ndp', 'sched_regrid_soil', true);
  console.log('OK patch', patched.enabled);
  await repo.deleteScheduledTurn(created.id);
  console.log('OK delete', (await repo.scheduledTurns('sess_flat_ndp')).schedules.length);
  await fetch(`${base}/__test/reset`, { method: 'POST' });
  await fetch(`${base}/__test/settings-rich`, { method: 'POST' });
  console.log('OK after reset', (await repo.memorySummary()).inbox, (await repo.policies()).length);
  await fetch(`${base}/__test/reset`, { method: 'POST' });
} else {
  for (const [name, run] of checks) {
    try {
      const value = await run();
      console.log('OFF', name, JSON.stringify(value).slice(0, 80));
    } catch (error) {
      console.log('OFF', name, (error as Error).message.slice(0, 100));
    }
  }
}
}, 60_000);

