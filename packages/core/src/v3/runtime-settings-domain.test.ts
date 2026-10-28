import { expect, it } from 'vitest';
import { runtimeSettingsSchema } from './runtime-settings-domain';

const base = {
  revision: 'r1',
  config_path: '/config.yaml',
  settings: [
    {
      key: 'memory.expiry_days',
      title: 'Expire unused memories after',
      description: 'Expiry threshold.',
      group: 'Memory',
      value: 60,
      default_value: 60,
      kind: 'integer' as const,
      minimum: 0,
      maximum: null,
      unit: 'days',
      effect: 'Applies later.',
      source: 'default' as const,
      has_user_value: false,
      editable: true,
      reason: null,
      choices: [],
    },
  ],
};

it('accepts older runtime snapshots without numeric presets', () => {
  expect(runtimeSettingsSchema.parse(base).settings[0]?.presets).toBeUndefined();
});

it('preserves numeric preset labels and finite wire values', () => {
  const parsed = runtimeSettingsSchema.parse({
    ...base,
    settings: [
      {
        ...base.settings[0],
        presets: [
          { value: 0, label: 'Never' },
          { value: 30, label: '30 days' },
        ],
      },
    ],
  });
  expect(parsed.settings[0]?.presets).toEqual([
    { value: 0, label: 'Never' },
    { value: 30, label: '30 days' },
  ]);
  expect(
    runtimeSettingsSchema.safeParse({
      ...base,
      settings: [{ ...base.settings[0], presets: [{ value: Infinity, label: 'Never' }] }],
    }).success,
  ).toBe(false);
});
