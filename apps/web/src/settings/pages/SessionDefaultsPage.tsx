import { useEffect, useState } from 'react';
import type { Client } from '@clio/core';
import { Select, type SelectOption } from '../../kit';
import { PageHeader } from './common';

const BP_KEY = 'clio.settings.default-blueprint.v1';
const EP_KEY = 'clio.settings.default-expert-pack.v1';

function readPref(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writePref(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the picker still works for this tab session.
  }
}

/**
 * Session defaults — the blueprint/expert-pack applied to new sessions.
 * Client-backed: the two catalogs come from real GET calls, but "which one
 * is the default for future sessions" is a local preference (no backend
 * concept of a workspace-level default binding exists).
 */
export function SessionDefaultsPage({ client }: { client: Client }) {
  const [blueprints, setBlueprints] = useState<SelectOption[]>([]);
  const [packs, setPacks] = useState<SelectOption[]>([]);
  const [blueprintId, setBlueprintId] = useState(() => readPref(BP_KEY));
  const [packId, setPackId] = useState(() => readPref(EP_KEY));

  useEffect(() => {
    let cancelled = false;
    void Promise.allSettled([client.agentBlueprints(), client.expertPacks()]).then(
      ([bp, ep]) => {
        if (cancelled) return;
        if (bp.status === 'fulfilled') {
          const options = bp.value.blueprints.map((b) => ({
            id: b.id,
            label: b.version ? `${b.name || b.id} @${b.version}` : b.name || b.id,
          }));
          setBlueprints(options);
          // No stored preference yet: show the first real catalog entry
          // rather than an empty trigger with no readable label. Not
          // persisted — only an explicit pick writes the preference.
          setBlueprintId((current) => current || options[0]?.id || '');
        }
        if (ep.status === 'fulfilled') {
          const options = ep.value.packs.map((p) => ({ id: p.id, label: p.name || p.id }));
          setPacks(options);
          setPackId((current) => current || options[0]?.id || '');
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [client]);

  return (
    <>
      <PageHeader
        title="Session defaults"
        subtitle="Choose the default semantics applied to new sessions."
      />
      <div className="settings__grid2">
        <div className="settings__field">
          <span className="settings__fieldlabel">Agent blueprint</span>
          <Select
            label="Agent blueprint"
            value={blueprintId}
            options={blueprints}
            onChange={(id) => {
              setBlueprintId(id);
              writePref(BP_KEY, id);
            }}
          />
        </div>
        <div className="settings__field">
          <span className="settings__fieldlabel">Expert pack</span>
          <Select
            label="Expert pack"
            value={packId}
            options={packs}
            onChange={(id) => {
              setPackId(id);
              writePref(EP_KEY, id);
            }}
          />
        </div>
      </div>
    </>
  );
}
