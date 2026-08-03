/**
 * UI component: Onboarding Tour.
 */
import { For, Show } from 'solid-js';
import { brand } from '@brand';
import type { Client } from '@clio/core';
import { trapFocusRef } from '../focus-trap.js';
import { inTauri } from '../tauri.js';
import { ProviderSetup } from './ProviderSetup.js';
import { createOnboardingTourController } from './OnboardingTourController.js';
import {
  buildOnboardingSteps,
  createTourSteps,
  markOnboardingDone,
  ONBOARDING_KEY,
  shouldShowOnboarding,
  type TourStep,
} from './OnboardingTourModel.js';
import './onboarding-tour.css';

export { markOnboardingDone, ONBOARDING_KEY, shouldShowOnboarding };

/**
 * First-run onboarding tour (W3 Tier-1).
 *
 * A spotlight walkthrough of the core surfaces — composer, sessions,
 * settings, command palette — shown once on a fresh profile. Each step
 * dims the app and rings the real UI element it describes (no mock
 * imagery), with a callout card placed beside it. Finish/Skip persists
 * `clio.onboarding-done.v1` so the tour never auto-shows again.
 */

/** Build the active step list. The provider-setup step is only included when a
 * client is supplied; otherwise the tour is the original prose-only walkthrough,
 * keeping existing call sites and tests behaving exactly as before. */
export function buildSteps(hasClient: boolean): TourStep[] {
  return buildOnboardingSteps(hasClient, createTourSteps(brand.name, inTauri()));
}

export interface OnboardingTourProps {
  open: boolean;
  onFinish: () => void;
  /** Optional GACT client. When provided, a provider/model-setup step is added
   * so a non-technical user can configure an LM in clicks during onboarding. */
  client?: Client;
}

export function OnboardingTour(props: OnboardingTourProps) {
  const steps = () => buildSteps(!!props.client);
  const tour = createOnboardingTourController({
    open: () => props.open,
    steps,
    onFinish: props.onFinish,
  });

  return (
    <Show when={props.open}>
      <div class="tour" data-testid="onboarding-tour">
        <div class="tour__backdrop" />
        <div class="tour__ring" style={tour.ringStyle()} aria-hidden="true" />
        <div
          class={
            'tour__card ' +
            (tour.step().placement === 'center' || !tour.targetRect()
              ? 'tour__card--center'
              : '') +
            (tour.step().kind === 'provider-setup' ? ' tour__card--wide' : '')
          }
          style={tour.calloutStyle()}
          role="dialog"
          aria-modal="true"
          aria-label="Onboarding tour"
          ref={trapFocusRef}
          data-testid="onboarding-card"
        >
          <span class="eyebrow">
            {tour.stepIdx() + 1} / {steps().length}
          </span>

          <Show
            when={tour.step().kind === 'provider-setup' && props.client}
            fallback={
              <>
                <h2 class="tour__title" data-testid="onboarding-title">
                  {tour.step().title}
                </h2>
                <p class="tour__body">{tour.step().body}</p>
              </>
            }
          >
            <ProviderSetup
              client={props.client!}
              onConfigured={() => tour.next()}
              onSkip={() => tour.next()}
            />
          </Show>

          <div class="tour__dots" aria-hidden="true">
            <For each={steps()}>
              {(_, i) => (
                <span class={'tour__dot ' + (i() === tour.stepIdx() ? 'is-active' : '')} />
              )}
            </For>
          </div>

          <Show when={tour.step().kind !== 'provider-setup'}>
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
                <Show when={tour.stepIdx() > 0}>
                  <button
                    type="button"
                    class="btn btn--secondary"
                    onClick={tour.back}
                    data-testid="onboarding-back"
                  >
                    Back
                  </button>
                </Show>
                <button
                  type="button"
                  class="btn btn--primary"
                  onClick={tour.next}
                  data-testid="onboarding-next"
                >
                  {tour.isLast() ? `Start using ${brand.name}` : 'Next'}
                </button>
              </div>
            </div>
          </Show>
        </div>
      </div>
    </Show>
  );
}
