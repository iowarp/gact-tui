import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { brand } from '@brand';
import type { Client } from '@clio/core';
import { trapFocusRef } from '../focus-trap.js';
import { ProviderSetup, type LmPreset } from './ProviderSetup.js';
import './onboarding-tour.css';

/**
 * First-run onboarding tour (W3 Tier-1).
 *
 * A spotlight walkthrough of the four core surfaces — composer, sessions,
 * left rail, command palette — shown once on a fresh profile. Each step
 * dims the app and rings the real UI element it describes (no mock
 * imagery), with a callout card placed beside it. Finish/Skip persists
 * `clio.onboarding-done.v1` so the tour never auto-shows again.
 */

export const ONBOARDING_KEY = 'clio.onboarding-done.v1';

export function shouldShowOnboarding(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(ONBOARDING_KEY) !== '1';
  } catch {
    return false;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, '1');
  } catch {
    /* quota — ignore */
  }
}

interface TourStep {
  id: string;
  /** CSS selector to spotlight; null renders a centered welcome card. */
  target: string | null;
  title: string;
  body: string;
  /** Callout placement relative to the target. */
  placement: 'center' | 'right' | 'top' | 'bottom';
  /** Special step kinds that render their own body instead of title+body.
   * `provider-setup` renders the model-picker; only included when a client
   * is supplied so the prose-only tour (and existing tests) are unaffected. */
  kind?: 'provider-setup';
}

const STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: null,
    placement: 'center',
    title: `Welcome to ${brand.name} Desktop`,
    body: `${brand.name} is your agentic-coding companion — it reads your workspace, runs tools under your control, and keeps every conversation as a session on the backend. This 30-second tour shows you around.`,
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
    body: `Every conversation is a server-side session — switch between them, fork, pin, or archive. They survive app restarts and are shared with the ${brand.name} TUI.`,
  },
  {
    id: 'rail',
    target: '[data-testid="left-rail"]',
    placement: 'right',
    title: 'Discovery & settings',
    body: `Browse the agents ${brand.name} can route to, MCP tool servers, cross-session memory, runtime metrics, and backend health. Settings lives at the bottom.`,
  },
  {
    id: 'palette',
    target: '[data-testid="topbar-palette"]',
    placement: 'bottom',
    title: 'The command palette',
    body: 'Ctrl+K fuzzy-searches every command — sessions, settings, density, permissions. Ctrl+/ shows all keyboard shortcuts.',
  },
];

/** The model-picker step, inserted right after the welcome card when a client
 * is available. Surfaces clio's provider presets so a novice configures an LM
 * before the surface tour begins. */
const PROVIDER_STEP: TourStep = {
  id: 'provider-setup',
  target: null,
  placement: 'center',
  kind: 'provider-setup',
  title: 'Pick a model to get started',
  body: '',
};

/** Build the active step list. The provider-setup step is only included when a
 * client is supplied; otherwise the tour is the original prose-only walkthrough,
 * keeping existing call sites and tests behaving exactly as before. */
export function buildSteps(hasClient: boolean): TourStep[] {
  if (!hasClient) return STEPS;
  return [STEPS[0]!, PROVIDER_STEP, ...STEPS.slice(1)];
}

export interface OnboardingTourProps {
  open: boolean;
  onFinish: () => void;
  /** Optional GACT client. When provided, a provider/model-setup step is added
   * so a non-technical user can configure an LM in clicks during onboarding. */
  client?: Client;
}

export function OnboardingTour(props: OnboardingTourProps) {
  const [stepIdx, setStepIdx] = createSignal(0);
  const [targetRect, setTargetRect] = createSignal<DOMRect | null>(null);

  const steps = () => buildSteps(!!props.client);
  const step = () => steps()[stepIdx()]!;
  const isLast = () => stepIdx() === steps().length - 1;

  // Measure the current step's target. Steps whose target is missing
  // (e.g. sessions column collapsed) degrade to a centered card.
  const measure = () => {
    const s = step();
    if (!s.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(s.target);
    setTargetRect(el ? el.getBoundingClientRect() : null);
  };

  createEffect(() => {
    void stepIdx();
    if (props.open) measure();
  });

  onMount(() => {
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    onCleanup(() => window.removeEventListener('resize', onResize));
  });

  function next() {
    if (isLast()) {
      props.onFinish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }

  function back() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  // Callout position derived from the target rect + placement.
  const calloutStyle = () => {
    const r = targetRect();
    const s = step();
    if (!r || s.placement === 'center') return {};
    const pad = 16;
    switch (s.placement) {
      case 'right':
        return {
          left: `${Math.min(r.right + pad, window.innerWidth - 380)}px`,
          top: `${Math.max(24, Math.min(r.top + r.height / 2 - 110, window.innerHeight - 280))}px`,
        };
      case 'top':
        return {
          left: `${Math.max(24, r.left + r.width / 2 - 180)}px`,
          top: `${Math.max(24, r.top - 240)}px`,
        };
      case 'bottom':
        return {
          left: `${Math.max(24, Math.min(r.left + r.width / 2 - 180, window.innerWidth - 380))}px`,
          top: `${Math.min(r.bottom + pad, window.innerHeight - 280)}px`,
        };
      default:
        return {};
    }
  };

  const ringStyle = () => {
    const r = targetRect();
    if (!r) return { display: 'none' };
    return {
      left: `${r.left - 6}px`,
      top: `${r.top - 6}px`,
      width: `${r.width + 12}px`,
      height: `${r.height + 12}px`,
    };
  };

  return (
    <Show when={props.open}>
      <div class="tour" data-testid="onboarding-tour">
        <div class="tour__backdrop" />
        <div class="tour__ring" style={ringStyle()} aria-hidden="true" />
        <div
          class={
            'tour__card ' +
            (step().placement === 'center' || !targetRect() ? 'tour__card--center' : '') +
            (step().kind === 'provider-setup' ? ' tour__card--wide' : '')
          }
          style={calloutStyle()}
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding tour"
          ref={trapFocusRef}
          data-testid="onboarding-card"
        >
          <span class="eyebrow">
            {stepIdx() + 1} / {steps().length}
          </span>

          <Show
            when={step().kind === 'provider-setup' && props.client}
            fallback={
              <>
                <h2 class="tour__title" data-testid="onboarding-title">
                  {step().title}
                </h2>
                <p class="tour__body">{step().body}</p>
              </>
            }
          >
            <ProviderSetup
              client={props.client!}
              onConfigured={(_p: LmPreset) => next()}
              onSkip={() => next()}
            />
          </Show>

          <div class="tour__dots" aria-hidden="true">
            <For each={steps()}>
              {(_, i) => (
                <span class={'tour__dot ' + (i() === stepIdx() ? 'is-active' : '')} />
              )}
            </For>
          </div>

          <Show when={step().kind !== 'provider-setup'}>
            <div class="tour__actions">
              <button
                type="button"
                class="tour__skip"
                onClick={() => props.onFinish()}
                data-testid="onboarding-skip"
              >
                Skip tour
              </button>
              <div class="tour__nav">
                <Show when={stepIdx() > 0}>
                  <button
                    type="button"
                    class="btn btn--secondary"
                    onClick={back}
                    data-testid="onboarding-back"
                  >
                    Back
                  </button>
                </Show>
                <button
                  type="button"
                  class="btn btn--primary"
                  onClick={next}
                  data-testid="onboarding-next"
                >
                  {isLast() ? `Start using ${brand.name}` : 'Next'}
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
