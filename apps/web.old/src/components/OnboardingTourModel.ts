/**
 * View-model / pure logic for Onboarding Tour: state shaping and helpers, no DOM. Key export `ONBOARDING_KEY`.
 */
export const ONBOARDING_KEY = 'clio.onboarding-done.v1';

export interface TourStep {
  id: string;
  /** CSS selector to spotlight; null renders a centered welcome card. */
  target: string | null;
  title: string;
  body: string;
  /** Callout placement relative to the target. */
  placement: 'center' | 'right' | 'top' | 'bottom';
  /** Special step kinds that render their own body instead of title+body. */
  kind?: 'provider-setup';
}

export function shouldShowOnboarding(storage: Storage | undefined = safeLocalStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(ONBOARDING_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markOnboardingDone(storage: Storage | undefined = safeLocalStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* quota - ignore */
  }
}

export function createTourSteps(brandName: string, isDesktop: boolean): TourStep[] {
  return [
    {
      id: 'welcome',
      target: null,
      placement: 'center',
      title: `Welcome to ${brandName}${isDesktop ? ' Desktop' : ''}`,
      body: `${brandName} is your agentic-coding companion — it reads your workspace, runs tools under your control, and keeps every conversation as a session on the backend. This 30-second tour shows you around.`,
    },
    {
      id: 'composer',
      target: '[data-testid="composer"]',
      placement: 'top',
      title: 'Ask anything here',
      body: 'Type a prompt and press Enter. Use @ to reference workspace files, / for backend commands, and the clip to upload real files into the conversation context.',
    },
    {
      id: 'sessions',
      target: '[data-testid="sessions-column"]',
      placement: 'right',
      title: 'Sessions live on the backend',
      body: `Every conversation is a server-side session — switch between them, fork, pin, or archive. They survive app restarts and are shared with the ${brandName} TUI.`,
    },
    {
      id: 'rail',
      target: '[data-testid="sessions-settings"]',
      placement: 'right',
      title: 'Discovery & settings',
      body: `Agents, MCP tool servers, cross-session memory, runtime metrics, and backend health live in Settings instead of taking over the chat shell.`,
    },
    {
      id: 'palette',
      target: '[data-testid="composer-command"]',
      placement: 'bottom',
      title: 'The command palette',
      body: 'Ctrl+K fuzzy-searches every command — sessions, settings, density, permissions. Ctrl+/ shows all keyboard shortcuts.',
    },
  ];
}

export const PROVIDER_STEP: TourStep = {
  id: 'provider-setup',
  target: null,
  placement: 'center',
  kind: 'provider-setup',
  title: 'Pick a model to get started',
  body: '',
};

export function buildOnboardingSteps(
  hasClient: boolean,
  baseSteps: readonly TourStep[],
): TourStep[] {
  if (!hasClient) return [...baseSteps];
  return [baseSteps[0]!, PROVIDER_STEP, ...baseSteps.slice(1)];
}

function safeLocalStorage(): Storage | undefined {
  return typeof localStorage === 'undefined' ? undefined : localStorage;
}
