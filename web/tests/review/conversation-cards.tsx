import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Artifact, ClioRepository, PendingInteraction } from '@clio/core/v3';
import {
  MessageCircleQuestionIcon,
  ShieldQuestionIcon,
} from 'lucide-react';
import '../../src/index.css';
import { ForcedTheme } from '../../src/theme/forced-theme';
import { ArchiveConnectionProvider } from '../../src/providers/connection-provider';
import { RepositoryOverride } from '../../src/providers/repository-override-context';
import { ClioPendingInteractions } from '../../src/components/clio/pending-interactions';
import { AskAnsweredRow } from '../../src/components/clio/ask-card';
import { PlanDecision } from '../../src/components/clio/plan-decision-controls';
import { PlanExitResponse } from '../../src/components/clio/plan-exit-interaction';
import { ActivityInfoButton } from '../../src/components/clio/activity-row';
import { CopyAction } from '../../src/components/clio/tool-compact-row';
import { QuestionAnswerContext } from '../../src/components/clio/question-answer-context';
import { TooltipProvider } from '../../src/components/ui/tooltip';
import { A2uiSessionRegistryOwner } from '../../src/test-fixtures/a2ui/v0_9_1/test-harness';
import { CLIO_WORKSPACE_CATALOG_ROW } from '../../src/test-fixtures/a2ui/v0_9_1/fixtures';
import {
  ANSWERED_COMMAND,
  APPROVED_PLAN,
  CANCELLED_PLAN,
  REVIEW_SESSION,
  SCENARIOS,
  type CardScenario,
} from './conversation-cards-data';

const params = new URLSearchParams(location.search);
const stateName = params.get('state') ?? 'permission-command';
const theme = params.get('theme') === 'light' ? 'light' : 'dark';
const scenario: CardScenario | undefined = SCENARIOS[stateName];

// Only what the A2UI question surface reads; every other call is outside this review.
const repository = {
  a2uiAction: async () => ({ status: 'accepted' }),
  a2uiCatalogs: async () => ({ rows: [CLIO_WORKSPACE_CATALOG_ROW], rejected: [] }),
  a2uiCapabilities: async () => ({
    agent: { 'v0.9': { supportedCatalogIds: [CLIO_WORKSPACE_CATALOG_ROW.catalogId] } },
    client: null,
    selection: null,
  }),
} as unknown as ClioRepository;
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function markReady() {
  const root = document.documentElement.dataset;
  root.reviewStates = Object.keys(SCENARIOS).join(',');
  root.reviewSpec = scenario?.spec ?? '';
  root.reviewClosest = scenario?.closest ? 'true' : 'false';
  root.reviewOpen = scenario?.open ?? '';
  root.reviewReady = 'true';
}

/** Clicks the card's first numbered choice once, so the failed response is on screen. */
function useFailedResponse(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      tries += 1;
      const button = document.querySelector<HTMLButtonElement>(
        '[data-slot="pending-interactions"] [data-ask-keys~="1"]:not([disabled])',
      );
      if (button) button.click();
      if (button || tries > 40) {
        window.clearInterval(timer);
        window.setTimeout(markReady, 300);
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [enabled]);
}

function MockComposer() {
  return (
    <div
      className="mx-auto flex h-[110px] max-w-4xl shrink-0 flex-col justify-between rounded-2xl bg-composer p-4 text-sm text-muted-foreground shadow-sm"
      data-slot="review-composer"
    >
      <span>Ask CLIO…</span>
      <span className="text-xs">Interactive</span>
    </div>
  );
}

function Transcript() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 text-[14px] leading-6">
      <p className="ml-auto max-w-[70%] rounded-2xl bg-muted px-4 py-2">
        Regrid SMAP L3 for 2020–2023 and check the Opal sites against the field probes.
      </p>
      <p>
        I found 1,462 SMAP L3 granules for the Opal region. Before regridding I need a decision from
        you.
      </p>
    </div>
  );
}

/** The spec's hover actions on a permission or question row (S5 owns those rows live). */
function RowActions({ value }: { value: string }) {
  return (
    <>
      <CopyAction label="Copy" value={value} />
      <span className="w-[22px]" />
    </>
  );
}

const PLAN_ARTIFACT = { id: 'artifact:plan', title: 'soil-regrid.md' } as unknown as Artifact;

function AnsweredRows() {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => (value: boolean) => setOpen((all) => ({ ...all, [key]: value }));
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-0.5" data-review-capture="">
      <AskAnsweredRow
        actions={<RowActions value={ANSWERED_COMMAND} />}
        detail={ANSWERED_COMMAND}
        icon={ShieldQuestionIcon}
        info={<ActivityInfoButton label="Technical details for Allowed once" />}
        mono
        onOpenChange={toggle('allowed')}
        open={Boolean(open.allowed)}
        verb="Allowed once"
      />
      <AskAnsweredRow
        actions={<RowActions value="2020–2023" />}
        detail="2020–2023"
        icon={MessageCircleQuestionIcon}
        mono
        onOpenChange={toggle('answered')}
        open={Boolean(open.answered)}
        verb="Answered"
      />
      <PlanExitResponse
        artifact={PLAN_ARTIFACT}
        interaction={APPROVED_PLAN}
        onOpenArtifact={() => undefined}
        onResponse={async () => undefined}
        showOwner={false}
      />
      <AskAnsweredRow
        actions={<RowActions value="rm -rf out/" />}
        detail="rm -rf out/"
        icon={ShieldQuestionIcon}
        info={<ActivityInfoButton label="Technical details for Denied" />}
        mono
        onOpenChange={toggle('denied')}
        open={Boolean(open.denied)}
        outcome="you denied it"
        tone="denied"
        verb="Denied"
      />
      <PlanDecision interaction={CANCELLED_PLAN} />
    </div>
  );
}

function Dock({ scenario }: { scenario: CardScenario }) {
  const failed = useRef(false);
  const [interactions, setInteractions] = useState<PendingInteraction[]>(scenario.interactions);
  // As in the workspace: the composer can carry a written answer.
  const [answeringId, setAnsweringId] = useState<string>();
  useFailedResponse(Boolean(scenario.failFirst) && params.get('auto') !== '0');
  return (
    <QuestionAnswerContext.Provider
      value={{
        answeringId,
        interactions,
        startAnswer: setAnsweringId,
        stopAnswer: () => setAnsweringId(undefined),
      }}
    >
      <div
        className="mx-auto w-full max-w-[calc(56rem+1.5rem)] shrink-0 px-3 pb-3"
        data-review-capture=""
        style={scenario.width ? { width: scenario.width } : undefined}
      >
        <ClioPendingInteractions
          interactions={interactions}
          // As the workspace does: a script with a running call opens as a workbench tab.
          onOpenScript={() => undefined}
          // As the workspace does: a question surface opens in its own view.
          onOpenSurfaceQuestion={() => undefined}
          ownerLabels={scenario.ownerLabels}
          surfaces={scenario.surfaces}
          viewedSessionId={REVIEW_SESSION}
          onResponse={async (interaction) => {
            if (scenario.failFirst && !failed.current) {
              failed.current = true;
              throw new Error('The session did not answer. Try again.');
            }
            setInteractions((current) => current.filter((row) => row.id !== interaction.id));
          }}
        />
        <MockComposer />
      </div>
    </QuestionAnswerContext.Provider>
  );
}

function Review() {
  useEffect(() => {
    if (scenario?.failFirst && params.get('auto') !== '0') return;
    const timer = window.setTimeout(markReady, 300);
    return () => window.clearTimeout(timer);
  }, []);
  let body: ReactNode;
  if (!scenario) {
    body = (
      <p role="alert">
        Unknown state {stateName}. Known: {Object.keys(SCENARIOS).join(', ')}
      </p>
    );
  } else if (scenario.view === 'answered-rows') {
    body = <AnsweredRows />;
  } else {
    body = null;
  }
  const docked = scenario && !scenario.view;
  return (
    <main className="flex h-dvh flex-col bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-auto px-6 py-6">
        <Transcript />
        <div className="mt-4">{body}</div>
      </div>
      {docked ? <Dock scenario={scenario} /> : null}
    </main>
  );
}

const sessions = [
  ...new Set(Object.values(scenario?.surfaces ?? {}).map((surface) => surface.session_id)),
];

createRoot(document.getElementById('root')!).render(
  <ForcedTheme theme={theme}>
    <ArchiveConnectionProvider>
      <RepositoryOverride.Provider value={repository}>
        <QueryClientProvider client={queryClient}>
          <A2uiSessionRegistryOwner sessionId={sessions}>
            <TooltipProvider>
              <Review />
            </TooltipProvider>
          </A2uiSessionRegistryOwner>
        </QueryClientProvider>
      </RepositoryOverride.Provider>
    </ArchiveConnectionProvider>
  </ForcedTheme>,
);
