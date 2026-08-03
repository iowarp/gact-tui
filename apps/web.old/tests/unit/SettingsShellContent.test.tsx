import { render, screen, cleanup } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastProvider } from '../../src/components/Toast.js';
import { SettingsShellContent } from '../../src/routes/SettingsShellContent.js';

afterEach(cleanup);

function renderContent(section: Parameters<typeof SettingsShellContent>[0]['section']) {
  return render(() => (
    <ToastProvider>
      <SettingsShellContent
        section={section}
        client={null}
        onAddRemote={() => undefined}
        onBack={() => undefined}
      />
    </ToastProvider>
  ));
}

describe('SettingsShellContent', () => {
  it('renders backend-independent sections without a client', () => {
    renderContent('appearance');
    expect(screen.getByTestId('settings-appearance')).toBeTruthy();
  });

  it('renders the no-backend fallback for client-backed sections', () => {
    renderContent('workspaces');
    expect(screen.getByTestId('settings-no-backend')).toBeTruthy();
  });
});
