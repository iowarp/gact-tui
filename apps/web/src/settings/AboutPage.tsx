import { brand } from '@brand';
import { KvGrid } from '../kit';
import { APP_DIRTY, APP_VERSION } from '../build-info';
import { unbackedPages } from './pages';

/**
 * About — build identity, plus the recorded settings gaps.
 *
 * Surfacing the unbacked pages here is deliberate: they are hidden from the
 * nav so nobody clicks a dead control, but hidden is not the same as
 * forgotten, and a reader deserves to know what this build does not do.
 */
export function AboutPage() {
  const gaps = unbackedPages();

  return (
    <div className="settings__section">
      <h2 className="settings__title">About</h2>

      <KvGrid
        label="Build"
        rows={[
          { key: 'product', value: brand.name },
          { key: 'version', value: APP_VERSION, ...(APP_DIRTY ? { trailing: 'dirty' } : {}) },
        ]}
      />

      <h3 className="settings__subtitle">Not available in this build</h3>
      <ul className="settings__gaps">
        {gaps.map((page) => (
          <li key={page.id}>
            <span className="settings__gapname">{page.label}</span>
            <span className="settings__gapwhy">{page.gap}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
