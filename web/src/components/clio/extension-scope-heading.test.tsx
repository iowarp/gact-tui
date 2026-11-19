import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { SettingsScopeContext } from '@/lib/settings-scope-context';
import { ExtensionScopeHeading } from './extension-scope-heading';

afterEach(cleanup);

describe('Extensions heading', () => {
  it('says the list is installed for the agent and conversations add what they use', () => {
    render(
      <TooltipProvider>
        <SettingsScopeContext.Provider
          value={{
            group: 'Agent',
            line: 'CLIO local, applies to every conversation on this agent',
            place: 'CLIO local',
          }}
        >
          <ExtensionScopeHeading />
        </SettingsScopeContext.Provider>
      </TooltipProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Extensions' })).toBeVisible();
    expect(
      screen.getByText(
        'CLIO local, installed for this agent; each conversation adds what it uses',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/applies to every conversation/u)).toBeNull();
  });
});
