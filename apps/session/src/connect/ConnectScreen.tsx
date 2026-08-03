import { useState, type FormEvent } from 'react';
import { brand } from '@brand';
import type { ConnectFailure } from '../backend/connection';
import './connect.css';

export interface ConnectScreenProps {
  /** Pre-filled backend URL (last used, or the brand's attach default). */
  initialUrl: string;
  pending: boolean;
  failure: ConnectFailure | null;
  onConnect: (url: string) => void;
}

export function ConnectScreen({ initialUrl, pending, failure, onConnect }: ConnectScreenProps) {
  const [url, setUrl] = useState(initialUrl);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!pending) onConnect(url);
  }

  return (
    <main className="connect" data-testid="connect-screen">
      <form className="connect__card" onSubmit={submit}>
        <header className="connect__lockup">
          {brand.logoImage ? (
            <img className="connect__logo" src={brand.logoImage} alt="" />
          ) : (
            <span className="connect__mark" aria-hidden="true">
              {brand.markGlyph}
            </span>
          )}
          <h1 className="connect__wordmark">{brand.wordmark}</h1>
        </header>

        <label className="connect__label" htmlFor="connect-url">
          Backend address
        </label>
        <input
          id="connect-url"
          data-testid="connect-url"
          className="connect__input"
          value={url}
          onChange={(e) => setUrl(e.currentTarget.value)}
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

        {failure ? (
          <p className="connect__error" data-testid="connect-error" role="alert">
            <span className="connect__error-reason">{failure.reason.replace(/_/g, ' ')}</span>
            {failure.detail}
          </p>
        ) : null}
      </form>
    </main>
  );
}
