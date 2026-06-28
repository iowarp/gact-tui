/**
 * Controller for Onboarding Tour: imperative glue/effects wiring the component to its model.
 */
import { createEffect, createSignal, type Accessor } from 'solid-js';
import { registerWindowEvent } from '../domListeners.js';
import type { TourStep } from './OnboardingTourModel.js';

export interface TourRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TourViewport {
  width: number;
  height: number;
}

export type TourStyle = Record<string, string>;

export function buildTourCalloutStyle(
  rect: TourRect | null,
  placement: TourStep['placement'],
  viewport: TourViewport,
): TourStyle {
  if (!rect || placement === 'center') return {};
  const pad = 16;
  switch (placement) {
    case 'right':
      return {
        left: `${Math.min(rect.right + pad, viewport.width - 380)}px`,
        top: `${Math.max(24, Math.min(rect.top + rect.height / 2 - 110, viewport.height - 280))}px`,
      };
    case 'top':
      return {
        left: `${Math.max(24, rect.left + rect.width / 2 - 180)}px`,
        top: `${Math.max(24, rect.top - 240)}px`,
      };
    case 'bottom':
      return {
        left: `${Math.max(24, Math.min(rect.left + rect.width / 2 - 180, viewport.width - 380))}px`,
        top: `${Math.min(rect.bottom + pad, viewport.height - 280)}px`,
      };
    default:
      return {};
  }
}

export function buildTourRingStyle(rect: TourRect | null): TourStyle {
  if (!rect) return { display: 'none' };
  return {
    left: `${rect.left - 6}px`,
    top: `${rect.top - 6}px`,
    width: `${rect.width + 12}px`,
    height: `${rect.height + 12}px`,
  };
}

export interface OnboardingTourControllerOptions {
  open: Accessor<boolean>;
  steps: Accessor<TourStep[]>;
  onFinish: () => void;
}

export function createOnboardingTourController(options: OnboardingTourControllerOptions) {
  const [stepIdx, setStepIdx] = createSignal(0);
  const [targetRect, setTargetRect] = createSignal<DOMRect | null>(null);

  const step = () => options.steps()[stepIdx()]!;
  const isLast = () => stepIdx() === options.steps().length - 1;

  const measure = () => {
    const current = step();
    if (!current.target) {
      setTargetRect(null);
      return;
    }
    const el = document.querySelector(current.target);
    setTargetRect(el ? el.getBoundingClientRect() : null);
  };

  createEffect(() => {
    void stepIdx();
    if (options.open()) measure();
  });

  registerWindowEvent('resize', () => measure());

  function next() {
    if (isLast()) {
      options.onFinish();
    } else {
      setStepIdx((i) => i + 1);
    }
  }

  function back() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  const calloutStyle = () =>
    buildTourCalloutStyle(targetRect(), step().placement, {
      width: window.innerWidth,
      height: window.innerHeight,
    });

  const ringStyle = () => buildTourRingStyle(targetRect());

  return {
    stepIdx,
    targetRect,
    step,
    isLast,
    next,
    back,
    calloutStyle,
    ringStyle,
  };
}
