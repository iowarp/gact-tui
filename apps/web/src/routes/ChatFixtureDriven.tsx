/**
 * Fixture-driven Chat variant: renders the chat from canned `?fixture=` data
 * for tests/screenshots. Exports {@link ChatFixtureDriven}.
 */
import { createSignal, onMount } from 'solid-js';
import { brand } from '@brand';
import type { PermissionRequest } from '@clio/core';
import type { BackendHandle } from '../App.js';
import type { ModelOption } from '../components/ComposerTypes.js';
import type { SessionRow } from '../components/SessionsColumn.js';
import type { TranscriptDensity } from '../components/Transcript.js';
import { useToast } from '../components/Toast.js';
import { fixturesForDemo } from '../fixtures/demo.js';
import { ChatLayout } from './ChatLayout.js';
import type { SettingsSection } from './SettingsShell.js';

export function ChatFixtureDriven(props: {
  backend: BackendHandle;
  fixture: string;
  onOpenSettings?: (section?: SettingsSection) => void;
  onAddRemote?: () => void;
}) {
  const fixtures = fixturesForDemo();
  const fixtureToast = useToast();
  onMount(() => {
    seedFixtureNotifications(fixtureToast.push);
  });
  const isEmpty = props.fixture === 'empty-sidebar';
  const rows: SessionRow[] = isEmpty
    ? []
    : fixtures.sessions.map((s) => ({
        id: s.id,
        title: s.title,
        status: s.status,
        workspace: s.project,
        updatedAt: s.updatedAt,
        preview: previewFromFixture(props.fixture, fixtures, s.id),
        model: s.id === 's1' ? 'opus-4.7' : undefined,
      }));
  const initialMessages = isEmpty
    ? []
    : (fixtures.byName[props.fixture] ?? fixtures.byName.normal!);

  const [sessions] = createSignal<SessionRow[]>(rows);
  const [activeId, setActiveId] = createSignal<string>(rows[0]?.id ?? '');
  const [density, setDensity] = createSignal<TranscriptDensity>('normal');
  if (props.fixture === 'verbose') setDensity('verbose');
  if (props.fixture === 'summary') setDensity('summary');

  const [messages] = createSignal(initialMessages);
  const pendingPermission = (): PermissionRequest | null =>
    props.fixture === 'permission' ? fixtures.permission : null;

  const url = new URL(window.location.href);
  const openHint = url.searchParams.get('open');
  const streaming = props.fixture === 'streaming-busy';

  return (
    <ChatLayout
      backendUrl={props.backend.url}
      voiceCapable={!!props.backend.capabilities?.capabilities?.voice}
      sessions={sessions()}
      activeId={activeId()}
      onSelect={setActiveId}
      density={density()}
      setDensity={setDensity}
      messages={messages()}
      pendingPermission={pendingPermission()}
      composerDisabled={!activeId()}
      streaming={streaming}
      preOpen={openHint}
      onOpenSettings={props.onOpenSettings}
      onAddRemote={props.onAddRemote}
      caps={props.backend.capabilities}
      onCopyMessage={() => undefined}
      onRegenerate={() => undefined}
      onRegenerateWithNotes={() => undefined}
      onRegenerateWithModel={() => undefined}
      inspectorActions={{}}
      models={FIXTURE_MODELS}
    />
  );
}

const FIXTURE_MODELS: ModelOption[] = [
  {
    id: 'anthropic:claude-opus-4',
    providerId: 'anthropic',
    modelId: 'claude-opus-4',
    providerLabel: 'Anthropic',
  },
  {
    id: 'anthropic:claude-sonnet-4',
    providerId: 'anthropic',
    modelId: 'claude-sonnet-4',
    providerLabel: 'Anthropic',
  },
  {
    id: 'argonne_metis:gpt-oss-120b',
    providerId: 'argonne_metis',
    modelId: 'gpt-oss-120b',
    providerLabel: 'ALCF Metis',
  },
];

function previewFromFixture(
  fix: string,
  fixtures: ReturnType<typeof fixturesForDemo>,
  sid: string,
): string | undefined {
  const ms = fixtures.byName[fix] ?? fixtures.byName.normal;
  if (!ms || sid !== (ms[ms.length - 1]?.id?.startsWith('m') ? 's1' : sid)) return undefined;
  const last = ms[ms.length - 1];
  const textPart = last?.parts.find((p) => p.type === 'text');
  if (textPart && textPart.type === 'text') return textPart.text;
  return undefined;
}

function seedFixtureNotifications(push: ReturnType<typeof useToast>['push']) {
  const seed: Array<{
    title: string;
    body: string;
    tone: 'info' | 'success' | 'warn' | 'error';
  }> = [
    {
      title: `${brand.name} responded`,
      body: 'refactor logger — turn completed in 12.4s',
      tone: 'success',
    },
    { title: 'Send failed', body: 'network unreachable — retry available', tone: 'error' },
    {
      title: 'Permission requested',
      body: 'WriteFile wants access to src/handlers.go',
      tone: 'warn',
    },
    { title: 'SSE reconnected', body: 'stream re-established after a drop', tone: 'info' },
    { title: 'Session exported', body: 'refactor-logger.json written to disk', tone: 'success' },
  ];
  for (const s of seed) push({ ...s, silent: true });
}
