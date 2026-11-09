import type { CommandDefinition, SummonTargets } from '@clio/core/v3';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { matchingSummons, summonReferences, typedSummons } from '@/lib/composer-reference-domain';
import { commandForName, commandGroups } from '@/lib/command-table';
import { ClioComposerCommandMenu, CommandStatus } from './composer-command-menu';
import { ConversationSummonedWork } from './conversation-summoned-work';
import { summonServerLabel } from './injection-presentation';

afterEach(cleanup);

function row(partial: Partial<CommandDefinition> & { id: string }): CommandDefinition {
  return {
    kind: 'command',
    name: partial.id,
    qualified_id: partial.id,
    title: partial.id,
    source: 'plugin',
    plugin: '',
    label: '',
    status: 'available',
    enabled: true,
    unsupported_fields: [],
    aliases: [],
    arguments: [],
    metadata: {},
    ...partial,
  };
}

const targets: SummonTargets = {
  subagents: [{ id: 'explore', plugin: 'review', description: 'Finds where things are.' }],
  servers: [
    { name: 'fixture_docs', plugin: 'docs', description: 'Docs.', deferred: true, tools: null },
    { name: 'hdf5', plugin: 'data', description: 'HDF5.', deferred: false, tools: 14 },
  ],
  workflows: [
    {
      id: 'draft-review',
      plugin: 'wtfp',
      description: 'Draft a section, then review it.',
      inputs: [{ name: 'section', description: 'The section', required: true }],
    },
  ],
  flows: [
    { id: 'council', plugin: 'flows', description: 'Several models answer; one synthesizes.' },
  ],
};

describe('the / menu', () => {
  it('groups commands, then skills, then each server’s prompts', () => {
    const groups = commandGroups([
      row({ id: '/mcp__hdf5__summarize', kind: 'mcp_prompt', label: 'hdf5' }),
      row({ id: '/run-a-study', kind: 'skill' }),
      row({ id: '/goal', kind: 'builtin', plugin: 'core' }),
      row({ id: '/hello', kind: 'command', source: 'clio_workspace' }),
    ]);
    expect(groups.map((group) => group.heading)).toEqual(['Commands', 'Skills', 'hdf5 prompts']);
    expect(groups[0]?.rows.map((command) => command.id)).toEqual(['/goal', '/hello']);
  });

  it('runs a bare name, a qualified name or an alias, and names the choices when ambiguous', () => {
    const commands = [
      row({ id: '/a:notes', name: '/notes', qualified_id: '/a:notes', ambiguous: true }),
      row({ id: '/b:notes', name: '/notes', qualified_id: '/b:notes', ambiguous: true }),
      row({ id: '/cron', kind: 'builtin', aliases: ['/schedule'] }),
      row({
        id: '/hello',
        enabled: false,
        disabled_reason: 'command_shadowed',
        disabled_detail: 'shadowed by .clio/commands/hello.md',
      }),
    ];
    expect(commandForName(commands, '/notes')).toEqual({ qualified: ['/a:notes', '/b:notes'] });
    expect(commandForName(commands, '/b:notes').command?.qualified_id).toBe('/b:notes');
    expect(commandForName(commands, '/schedule').command?.id).toBe('/cron');
    // A shadowed file never runs: the name belongs to the file that wins.
    expect(commandForName(commands, '/hello').command).toBeUndefined();
  });

  it('says a row’s state in words, never only with an icon', () => {
    render(
      <>
        <CommandStatus
          command={row({ id: '/x', enabled: false, disabled_reason: 'command_name_reserved' })}
        />
        <CommandStatus
          command={row({ id: '/y', unsupported_fields: ['model', 'allowed-tools'] })}
        />
      </>,
    );
    expect(screen.getByText('Reserved name')).toBeVisible();
    expect(screen.getByText('Some fields ignored')).toBeVisible();
  });
});

describe('the @ popover', () => {
  it('offers the session’s subagents, workflows, flows and servers', () => {
    const rows = summonReferences(targets);
    expect(rows.map((reference) => [reference.kind, reference.id, reference.detail])).toEqual([
      ['subagent', 'explore', 'Finds where things are.'],
      ['workflow', 'draft-review', 'Draft a section, then review it. — takes section'],
      ['flow', 'council', 'Several models answer; one synthesizes.'],
      ['server', 'fixture_docs', 'Docs. — tools load when used'],
      ['server', 'hdf5', 'HDF5. — 14 tools'],
    ]);
  });

  it('offers a name that matches before a description that mentions the query', () => {
    const rows = summonReferences({
      subagents: [
        { id: 'explore', plugin: 'delegation', description: 'Finds things; no review.' },
        { id: 'review', plugin: 'delegation', description: 'Checks work.' },
        { id: 'peer-review', plugin: 'delegation', description: 'A second reader.' },
      ],
      servers: [],
    });
    expect(matchingSummons(rows, 'rev').map((row) => row.id)).toEqual([
      'review',
      'peer-review',
      'explore',
    ]);
    expect(matchingSummons(rows, 'zzz')).toEqual([]);
    expect(matchingSummons(rows, '')).toHaveLength(3);
  });

  it('turns an exact @name typed in full into a summons and leaves prose alone', () => {
    expect(typedSummons('Email bob@example.org about @explore', targets, [])).toEqual([
      { type: 'summon', target_kind: 'subagent', target: 'explore' },
    ]);
    expect(typedSummons('ask @explorer and @hdf5.', targets, [])).toEqual([
      { type: 'summon', target_kind: 'server', target: 'hdf5' },
    ]);
    expect(typedSummons('run @draft-review, then @council', targets, [])).toEqual([
      { type: 'summon', target_kind: 'workflow', target: 'draft-review' },
      { type: 'summon', target_kind: 'flow', target: 'council' },
    ]);
    // A chip the person picked is not sent twice.
    expect(
      typedSummons('@explore again', targets, [
        { type: 'summon', target_kind: 'subagent', target: 'explore' },
      ]),
    ).toEqual([]);
  });
});

describe('the transcript', () => {
  it('shows what the person summoned and what their command loaded', () => {
    render(
      <ConversationSummonedWork
        metadata={{
          summons: {
            subagents: ['explore'],
            workflows: ['draft-review'],
            flows: [],
            servers: ['hdf5'],
            failed: [],
          },
          loaded_skill: 'run-a-study',
        }}
      />,
    );
    expect(screen.getByText('You asked for explore on this message')).toBeVisible();
    expect(
      screen.getByText('You asked for the workflow draft-review on this message'),
    ).toBeVisible();
    expect(screen.getByText('You pointed this message at the hdf5 tools')).toBeVisible();
    expect(screen.getByText('Loaded skill run-a-study')).toBeVisible();
  });

  it('says on the answer which summoned targets started and which did not', () => {
    render(
      <ConversationSummonedWork
        metadata={{
          summons_outcome: {
            started: [{ kind: 'subagent', target: 'explore' }],
            not_started: [
              { kind: 'workflow', target: 'draft-review', reason: 'not_called' },
              { kind: 'flow', target: 'council', reason: 'flow_not_resolved' },
            ],
          },
        }}
      />,
    );
    expect(screen.getByText('Started explore as you asked')).toBeVisible();
    expect(screen.getByText('The workflow draft-review was not started')).toBeVisible();
    expect(screen.getByText('The flow council was not started: flow_not_resolved')).toBeVisible();
  });

  it('names the tools a server summons loaded', () => {
    const text =
      'The person pointed this message at the hdf5 tools.\n\nLoaded 2 tools; call them.\n\n' +
      '## hdf5_list  (hdf5)\nList.\n\n## hdf5_read  (hdf5)\nRead.';
    expect(summonServerLabel({ source: 'summon_server', text })).toBe('Loaded 2 tools from hdf5');
  });
});

describe('the / menu surface', () => {
  const commands = [
    row({ id: '/goal', kind: 'builtin', plugin: 'core', title: 'Set a goal' }),
    row({ id: '/hello', kind: 'command', source: 'clio_workspace' }),
    row({ id: '/off', enabled: false, disabled_reason: 'unavailable' }),
  ];

  function renderMenu(query: string) {
    const onPick = vi.fn();
    const view = render(
      <>
        <div
          aria-controls="cmds"
          contentEditable
          data-testid="editor"
          role="textbox"
          tabIndex={0}
        />
        <ClioComposerCommandMenu
          commands={commands}
          onPick={onPick}
          popoverId="cmds"
          query={query}
        />
      </>,
    );
    return { onPick, view, editor: screen.getByTestId('editor') };
  }

  it('moves over usable commands, uses the highlighted one on Enter and closes on Escape', () => {
    const { editor, onPick } = renderMenu('/');
    const enter = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Enter' });
    editor.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(false);
    expect(onPick).not.toHaveBeenCalled();

    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    fireEvent.keyDown(editor, { key: 'ArrowDown' });
    const selected = screen.getByRole('option', { selected: true });
    expect(selected).toHaveAccessibleName(/\/goal/u);

    fireEvent.keyDown(editor, { key: 'Enter' });
    expect(onPick).toHaveBeenCalledWith(commands[0]);

    fireEvent.keyDown(editor, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Suggestions' })).toBeNull();
  });
});
