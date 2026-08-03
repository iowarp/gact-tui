import { useState } from 'react';
import { MasterDetail } from '../kit';
import { AppearancePage } from './AppearancePage';
import { AboutPage } from './AboutPage';
import { SETTINGS_PAGES, backedPages, type SettingsPage } from './pages';
import './settings.css';

/**
 * Settings — a MasterDetail over the backed page inventory.
 *
 * Unbacked pages never reach the nav (see pages.ts). Backed-but-unbuilt pages
 * say so instead of rendering an empty pane, which would read as a load
 * failure rather than as work not yet done.
 */
export function Settings() {
  const pages = backedPages();
  const [active, setActive] = useState(pages[0]?.id ?? 'backends');
  const page = SETTINGS_PAGES.find((p) => p.id === active);

  return (
    <section className="settings" aria-label="Settings pane">
      {/* The heading and close control are the Layer's — see kit/Layer.tsx. */}
      <div className="settings__body">
        <MasterDetail
          label="Settings"
          activeId={active}
          onSelect={setActive}
          items={pages.map((p) => ({ id: p.id, label: p.label }))}
          detail={<PageBody page={page} />}
        />
      </div>
    </section>
  );
}

function PageBody({ page }: { page: SettingsPage | undefined }) {
  if (!page) return null;

  if (page.id === 'appearance') {
    return (
      <div data-testid="settings-page">
        <AppearancePage />
      </div>
    );
  }
  if (page.id === 'about') {
    return (
      <div data-testid="settings-page">
        <AboutPage />
      </div>
    );
  }

  return (
    <div data-testid="settings-page">
      <h2 className="settings__title">{page.label}</h2>
      <p className="settings__unbuilt" data-testid="settings-unbuilt">
        This page is backed
        {page.method ? (
          <>
            {' '}
            by <code>{page.method}</code>
          </>
        ) : null}{' '}
        but its interface has not been built yet.
      </p>
    </div>
  );
}
