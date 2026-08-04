import { useEffect, useState } from 'react';
import type { Client, ProviderDef } from '@clio/core';
import { ErrorNote, LoadingNote, PageHeader } from './common';

/**
 * Providers — the same catalog the composer picker uses (client.providers()).
 * The prototype's per-provider "saved configurations" list has no backend
 * analog (ProviderDef carries one default_model/api_base, not a named
 * configs[] array) — the single real config derived from the catalog entry
 * renders instead of a fabricated list, and "+ new configuration" is
 * disabled with that reason rather than pretending to add one.
 */
export function ProvidersPage({ client }: { client: Client }) {
  const [providers, setProviders] = useState<ProviderDef[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void client
      .providers()
      .then(({ providers: list }) => {
        if (cancelled) return;
        setProviders(list);
        setSelectedId((current) => current ?? list[0]?.id ?? null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client]);

  const header = (
    <PageHeader
      title="Providers"
      subtitle="Same catalog and saved configurations as the composer picker."
    />
  );

  if (error) return (<>{header}<ErrorNote message={error} /></>);
  if (!providers) return (<>{header}<LoadingNote /></>);

  const selected = providers.find((p) => p.id === selectedId) ?? providers[0] ?? null;

  return (
    <>
      {header}
      <div className="settings__providers">
        <div className="settings__providerlist">
          {providers.map((p) => (
            <button
              key={p.id}
              type="button"
              className="settings__providerrow"
              aria-current={p.id === selected?.id ? 'true' : undefined}
              onClick={() => setSelectedId(p.id)}
            >
              <span
                className="settings__dot"
                style={{
                  width: 6,
                  height: 6,
                  background: p.is_authenticated ? 'var(--t-ok)' : 'var(--t-mu)',
                }}
              />
              <span className="settings__providerlabel">{p.name || p.id}</span>
            </button>
          ))}
        </div>
        <div className="settings__providerdetail">
          {selected ? (
            <>
              <div className="settings__providerdetailhead">
                <span className="settings__providerdetailname">{selected.name || selected.id}</span>
                <span
                  className="settings__providerstatus"
                  style={{ color: selected.is_authenticated ? 'var(--t-ok)' : 'var(--t-mu)' }}
                >
                  {selected.is_authenticated ? 'ready' : 'not configured'}
                </span>
                <span className="settings__spacer" />
                <button
                  type="button"
                  className="settings__textlink"
                  disabled
                  title="Providers carry one configuration on this backend — there is no multi-config route to add another."
                >
                  + new configuration
                </button>
              </div>
              <div className="settings__card">
                <div className="settings__cardhead" style={{ cursor: 'default' }}>
                  <span style={{ color: 'var(--t-cy)' }}>✓ default</span>
                  <span style={{ fontWeight: 600, color: 'var(--t-hd)' }}>{selected.name || selected.id}</span>
                  <span
                    style={{
                      fontFamily: 'var(--f-mono)',
                      fontSize: 'calc(11.5px * var(--ts))',
                      color: 'var(--t-mu)',
                    }}
                  >
                    {selected.api_base || '—'}
                  </span>
                </div>
                <div className="settings__cardbody">
                  <div className="settings__field">
                    <span className="settings__fieldlabel">default model</span>
                    <span className="settings__rowsub">{selected.default_model || '—'}</span>
                  </div>
                  {selected.is_authenticated ? (
                    <div className="settings__field" style={{ marginTop: 8 }}>
                      <span className="settings__fieldlabel">auth</span>
                      <span style={{ color: 'var(--t-ok)', fontFamily: 'var(--f-prose)' }}>authenticated</span>
                    </div>
                  ) : selected.env_keys?.length ? (
                    <div className="settings__field" style={{ marginTop: 8 }}>
                      <span className="settings__fieldlabel">api key</span>
                      <span className="settings__rowsub">
                        set the {selected.env_keys.join(' or ')} environment variable on the backend
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <p className="settings__note">No providers configured on this backend.</p>
          )}
        </div>
      </div>
    </>
  );
}
