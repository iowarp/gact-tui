import { useState, type FormEvent } from 'react';
import { brand } from '@brand';
import type { BackendEntry } from '@clio/core';
import type { ConnectFailure } from '../backend/connection';
import { Lockup } from '../shell/Lockup';
import './connect.css';

export interface ConnectScreenProps {
  /** Previously-connected backends, from the client-owned registry. */
  saved?: BackendEntry[];
  /** Drop a saved backend without connecting to it. */
  onForget?: (url: string) => void;
  /** Clears a stale failure when the user edits the address. */
  onEdit?: () => void;
  /** Pre-filled backend URL (last used, or the brand's attach default). */
  initialUrl: string;
  pending: boolean;
  failure: ConnectFailure | null;
  onConnect: (url: string) => void;
}

export function ConnectScreen({
  initialUrl,
  pending,
  failure,
  onConnect,
  onEdit,
  saved = [],
  onForget,
}: ConnectScreenProps) {
  const [url, setUrl] = useState(initialUrl);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending) onConnect(url);
  }

  return (
    <main className="connect" data-testid="connect-screen" aria-busy={pending || undefined}>
      <form className="connect__card" onSubmit={submit}>
        <Lockup brand={brand} />

        <label className="connect__label" htmlFor="connect-url">
          Backend address
        </label>
        <input
          id="connect-url"
          data-testid="connect-url"
          className="connect__input"
          value={url}
          onChange={(e) => {
            setUrl(e.currentTarget.value);
            onEdit?.();
          }}
          placeholder="127.0.0.1:17800"
          autoComplete="off"
          spellCheck={false}
          disabled={pending}
        />

        <button
          type="submit"
          data-testid="connect-submit"
          className="connect__submit"
          disabled={pending || url.trim().length === 0}
        >
          {pending ? 'Connecting…' : 'Connect'}
        </button>

        {/* A disabled button reading "Connecting…" is not feedback that
            anything is still happening — it reads as a freeze. The bar is
            live, and the status line is announced. */}
        {pending ? (
          <div className="connect__progress" data-testid="connect-progress" aria-hidden="true">
            <span className="connect__progressbar" />
          </div>
        ) : null}
        <p className="connect__status" role="status">
          {pending ? `Connecting to ${url}…` : ''}
        </p>

        {failure ? (
          <p className="connect__error" data-testid="connect-error" role="alert">
            <span className="connect__error-reason">{failure.reason.replace(/_/g, ' ')}</span>
            {failure.detail}
          </p>
        ) : null}
        {saved.length > 0 ? (
          <ul className="connect__saved" aria-label="Saved backends">
            {saved.map((entry) => (
              <li className="connect__savedrow" key={entry.url}>
                <button
                  type="button"
                  className="connect__savedconnect"
                  aria-label={`Connect to ${entry.label}`}
                  disabled={pending}
                  onClick={() => onConnect(entry.url)}
                >
                  <span className="connect__savedlabel">{entry.label}</span>
                  <span className="connect__savedurl">{entry.url}</span>
                </button>
                <button
                  type="button"
                  className="connect__savedforget"
                  aria-label={`Forget ${entry.label}`}
                  disabled={pending}
                  onClick={() => onForget?.(entry.url)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
    </main>
  );
}
