import { useState } from 'react';
import { brand } from '@brand';
import { APP_VERSION } from '../build-info';
import { Eyebrow, Icon, Popover } from '../kit';
import './version-update.css';

const AUTO_UPDATE_KEY = 'clio.auto-update.v1';

function loadAutoUpdate(): boolean {
  try {
    return localStorage.getItem(AUTO_UPDATE_KEY) !== 'false';
  } catch {
    return true;
  }
}

export interface VersionUpdateProps {
  backendVersion: string;
  newBuildAvailable?: boolean;
}

/** Composer footer stamp and the prototype's click-through update summary. */
export function VersionUpdate({ backendVersion, newBuildAvailable = false }: VersionUpdateProps) {
  const [open, setOpen] = useState(false);
  const [autoUpdate, setAutoUpdate] = useState(loadAutoUpdate);
  const backendLabel = brand.backendRepository?.label || 'clio-agent';

  function toggleAutoUpdate(): void {
    const next = !autoUpdate;
    setAutoUpdate(next);
    try {
      localStorage.setItem(AUTO_UPDATE_KEY, String(next));
    } catch {
      // The toggle remains useful for the current run when storage is blocked.
    }
  }

  return (
    <div className="version-update">
      <button
        type="button"
        className="version-update__stamp"
        data-testid="version-stamp"
        title="Build version — click for updates"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="version-update__visual">
          {APP_VERSION}{newBuildAvailable ? ' · update available' : ''}
        </span>
        <span className="version-update__backend-assistive">
          {`connected backend v${backendVersion}`}
        </span>
      </button>
      {newBuildAvailable ? <span className="version-update__notice" data-testid="new-build">app build</span> : null}
      <Popover open={open} label="updates" placement="up" onClose={() => setOpen(false)}>
        <div className="version-update__header"><Eyebrow strong>updates</Eyebrow></div>
        <div className="version-update__row">
          <Icon name="cloud" size={13} />
          <div><strong>clio-web</strong><span>{newBuildAvailable ? `${APP_VERSION} → latest` : APP_VERSION}</span></div>
          {newBuildAvailable ? <button type="button" data-testid="update-app" onClick={() => window.location.reload()}>UPDATE</button> : <small>up to date</small>}
        </div>
        <div className="version-update__row">
          <Icon name="bot" size={13} />
          <div><strong>{backendLabel}</strong><span>{backendVersion}</span></div>
          <small>connected</small>
        </div>
        <button type="button" className="version-update__auto" role="switch" aria-checked={autoUpdate} onClick={toggleAutoUpdate}>
          <span>auto-update on launch</span><span>{autoUpdate ? 'on' : 'off'}</span>
        </button>
      </Popover>
    </div>
  );
}
