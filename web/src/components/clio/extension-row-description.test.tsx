import { connectorSchema, pluginEntrySchema } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { connectorRow } from '@/lib/extension-library-entries';
import { ExtensionRow } from './extension-parts';

afterEach(cleanup);

const LONG =
  'See molecular structures from the Protein Data Bank, and draw or edit molecules, in a viewer you can turn and zoom';

const molecules = connectorSchema.parse({
  id: 'molecules',
  name: 'Molecule viewer',
  description: LONG,
  enabled: false,
  state: { status: 'ready', needs: [] },
});
const hub = connectorSchema.parse({
  id: 'hub',
  name: 'Home hub',
  description: 'The catalog line for the hub',
  enabled: false,
  plugin: 'hub',
  plugin_ref: 'clio/hub',
  state: { status: 'needs', needs: ['url'] },
  needs: [{ key: 'url', kind: 'address', label: 'Hub address', required: true }],
});
const hubPlugin = pluginEntrySchema.parse({
  id: 'hub',
  ref: 'clio/hub',
  marketplace: 'clio',
  trusted: true,
  description: 'Read and control the home hub, with its best practices',
  skills: ['hub-practices'],
  mcp_servers: ['hub'],
  follows: 'hub',
});

function show(entry: ReturnType<typeof connectorRow>) {
  render(
    <TooltipProvider>
      <ExtensionRow
        description={entry.description}
        icon={<span />}
        meta={entry.meta}
        name={entry.title}
        needs={entry.needs}
        status={entry.status}
      />
    </TooltipProvider>,
  );
}

describe('a catalog row says what the entry is (DOCS-D5)', () => {
  it("shows a connector's catalog description as one truncated line under its kind", () => {
    const row = connectorRow(molecules);
    expect(row.description).toBe(LONG);
    show(row);
    const line = screen.getByText(LONG);
    expect(line).toHaveAttribute('data-slot', 'extension-description');
    expect(line).toHaveClass('truncate');
    expect(line).toHaveAttribute('title', LONG);
    expect(screen.getByText('Connector')).toBeVisible();
  });

  it("shows a plugin's own description, and keeps what it needs on a line of its own", () => {
    const row = connectorRow(hub, undefined, hubPlugin);
    expect(row.description).toBe('Read and control the home hub, with its best practices');
    show(row);
    expect(screen.getByText('Plugin')).toBeVisible();
    expect(
      screen.getByText('Read and control the home hub, with its best practices'),
    ).toHaveAttribute('data-slot', 'extension-description');
    expect(screen.queryByText('The catalog line for the hub')).toBeNull();
    expect(screen.getByText('Needs hub address')).toHaveAttribute('data-slot', 'extension-needs');
  });
});
