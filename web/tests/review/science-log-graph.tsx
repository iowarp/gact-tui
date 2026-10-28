import { createRoot } from 'react-dom/client';
import { useEffect, useState } from 'react';
import '../../src/index.css';
import { ScienceLogView } from '../../src/components/clio/science-log-tab';
import { studyGraphFixture } from '../fixtures/science-log-graph';

// Render the production component without network stubs. This fixture is not
// used as a presentation screenshot or evidence of an agent's scientific work.
function Review() {
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  return (
    <main className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] bg-background p-4 text-foreground">
      <header className="flex items-center justify-between gap-3 px-3 pb-2">
        <div>
          <h1 className="text-lg font-semibold">Science log graph</h1>
          <p className="text-xs text-muted-foreground">Component review with test data</p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          Theme
          <select
            aria-label="Theme"
            className="rounded border bg-background px-2 py-1"
            value={theme}
            onChange={(event) => setTheme(event.target.value)}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </header>
      <ScienceLogView study={studyGraphFixture} sessionId="root" />
    </main>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<Review />);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
