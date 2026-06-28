/**
 * Overlay layer of the chat layout: modals, palettes and pending-interaction
 * cards. Exports {@link ChatLayoutOverlays}.
 */
import { Show, type Accessor, type Setter } from 'solid-js';
import { Client, type FileDiff } from '@clio/core';
import { DiffPane } from '../components/DiffPane.js';
import { CatalogBrowser } from '../components/CatalogBrowser.js';
import { ComposeModal } from '../components/ComposeModal.js';
import { SharedSessionModal } from '../components/SharedSessionModal.js';
import { KeybindCheatsheet } from '../components/KeybindCheatsheet.js';
import { ServerSearchPanel } from '../components/ServerSearchPanel.js';
import { OnboardingTour } from '../components/OnboardingTour.js';
import { SlashPalette, type SlashCommand } from '../components/SlashPalette.js';
import { SessionSemanticsModal } from './SessionSemanticsModal.js';
import type { ChatLayoutProps } from './ChatLayoutTypes.js';

export interface ChatLayoutOverlaysProps {
  props: ChatLayoutProps;
  discoveryClient: Client;
  activeDiff: Accessor<FileDiff | null>;
  setActiveDiff: Setter<FileDiff | null>;
  paletteOpen: Accessor<boolean>;
  setPaletteOpen: Setter<boolean>;
  paletteQuery: Accessor<string>;
  setPaletteQuery: Setter<string>;
  paletteItems: Accessor<SlashCommand[]>;
  handlePick: (command: SlashCommand) => void | Promise<void>;
  cheatsheetOpen: Accessor<boolean>;
  setCheatsheetOpen: Setter<boolean>;
  tourOpen: Accessor<boolean>;
  finishTour: () => void;
  sharedSessionOpen: Accessor<boolean>;
  setSharedSessionOpen: Setter<boolean>;
  sessionSemanticsOpen: Accessor<boolean>;
  setSessionSemanticsOpen: Setter<boolean>;
  composeOpen: Accessor<boolean>;
  setComposeOpen: Setter<boolean>;
  setDraftReloadTick: Setter<number>;
  catalogOpen: Accessor<boolean>;
  setCatalogOpen: Setter<boolean>;
  serverSearchOpen: Accessor<boolean>;
  setServerSearchOpen: Setter<boolean>;
  setSelectedMessageId: Setter<string>;
}

export function ChatLayoutOverlays(options: ChatLayoutOverlaysProps) {
  return (
    <>
      <Show when={options.activeDiff()}>
        <DiffPane diff={options.activeDiff()!} onClose={() => options.setActiveDiff(null)} />
      </Show>

      <SlashPalette
        open={options.paletteOpen()}
        query={options.paletteQuery()}
        commands={options.paletteItems()}
        onQueryChange={options.setPaletteQuery}
        onPick={options.handlePick}
        onClose={() => options.setPaletteOpen(false)}
      />

      <KeybindCheatsheet
        open={options.cheatsheetOpen()}
        onClose={() => options.setCheatsheetOpen(false)}
      />

      <OnboardingTour
        open={options.tourOpen()}
        onFinish={options.finishTour}
        client={options.discoveryClient}
      />

      <SharedSessionModal
        open={options.sharedSessionOpen()}
        client={options.discoveryClient}
        onClose={() => options.setSharedSessionOpen(false)}
      />

      <SessionSemanticsModal
        open={options.sessionSemanticsOpen()}
        loading={options.props.sessionSemanticsLoading}
        blueprints={options.props.sessionSemanticsOptions?.blueprints ?? []}
        expertPacks={options.props.sessionSemanticsOptions?.expertPacks ?? []}
        onClose={() => options.setSessionSemanticsOpen(false)}
        onOpenSettings={() => options.props.onOpenSettings?.('blueprints')}
        onStart={async (selection, title) => {
          await options.props.onNewSession?.(selection, title);
          options.setSessionSemanticsOpen(false);
        }}
      />

      <ComposeModal
        open={options.composeOpen()}
        draftKey={options.props.activeId || '__new'}
        onSubmit={(text) => options.props.onSubmit?.(text)}
        onClose={() => {
          options.setComposeOpen(false);
          options.setDraftReloadTick((current) => current + 1);
        }}
      />

      <CatalogBrowser
        open={options.catalogOpen()}
        client={options.discoveryClient}
        onClose={() => options.setCatalogOpen(false)}
        onPick={(target) => {
          switch (target.kind) {
            case 'agent':
              options.props.onOpenSettings?.('agents');
              return;
            case 'tool':
              options.props.onOpenSettings?.('tools');
              return;
            case 'mcp':
              options.props.onOpenSettings?.('mcp');
              return;
            case 'prompt':
              options.props.onOpenSettings?.('prompts');
              return;
            case 'workspace':
              options.props.onOpenSettings?.('workspaces');
              return;
          }
        }}
      />

      <Show when={options.props.activeId}>
        <ServerSearchPanel
          open={options.serverSearchOpen()}
          client={options.discoveryClient}
          sessionId={options.props.activeId}
          onJump={(messageId) => {
            options.setSelectedMessageId(messageId);
            queueMicrotask(() => {
              const element = document.getElementById(`msg-${messageId}`);
              if (!element) return;
              element.scrollIntoView({ behavior: 'smooth', block: 'center' });
              element.classList.add('trx-msg--flash');
              setTimeout(() => element.classList.remove('trx-msg--flash'), 1800);
            });
          }}
          onClose={() => options.setServerSearchOpen(false)}
        />
      </Show>
    </>
  );
}
