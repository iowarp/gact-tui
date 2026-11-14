import { brand } from '@brand';
import { vocab } from '@/lib/brand-vocabulary';
import type { TourAnchorId } from './tour-anchors';
import { t, ph } from '@lingui/core/macro';

/**
 * The tour's step copy. Each step names what is on screen at that moment, so
 * when a control is renamed or moved, update its step here, not in components.
 * `draft` puts a visible Draft label on the card while copy is being rewritten.
 */
export const TOUR_SCRIPT_STATUS: 'draft' | 'final' = 'final';

/** Something the practice conversation reports when the learner does it. */
export type TourPracticeEvent = 'sent' | 'artifact-opened' | 'referenced';

/**
 * What finishes a step before Next is pressed:
 * - a practice event;
 * - `change`: the anchor's label or content changes (a model, level or
 *   policy was picked, a row was opened);
 * - `interact`: the learner zooms, pans or clicks inside the anchor. This
 *   marks the step done without moving on, so they can keep exploring.
 */
export type TourWait = TourPracticeEvent | 'change' | 'interact';

/** How the practice conversation looks when a step starts. */
export interface TourPracticeScene {
  /** Scripted exchanges already in the conversation. */
  turns: 0 | 1 | 2;
  /** A message waiting in the composer, ready to send. */
  draft?: string;
  /** The opened plot shows beside the conversation. */
  viewer?: boolean;
}

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** What the step points at. Missing on screen means a centred card. */
  anchor?: TourAnchorId;
  /** Steps with a scene run over the scripted conversation, never a real one. */
  practice?: TourPracticeScene;
  /** The tour opens the anchor's menu or picker itself. */
  open?: boolean;
  waitFor?: TourWait;
  /** Once done, the step stays up so the learner can read what opened, until Next. */
  stay?: boolean;
  /**
   * The part of the anchor the step asks you to use, as a selector inside it.
   * When the card must overlap the spotlight, it keeps off this part first.
   */
  focus?: string;
  /** A short instruction for something to try on the highlighted element. */
  tryIt?: string;
}

const PLOT_REQUEST = t`Plot the vertical displacement at station BKL1.`;
const TRACKS_REQUEST = t`Show the 2017 and 2019 Atlantic hurricane tracks.`;

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: t`Welcome to ${ph({ name: brand.name })}`,
    body: t`This two-minute tour uses a practice conversation, so nothing you do in it is sent or saved. Press Esc to leave at any time.`,
  },
  {
    id: 'practice',
    practice: { turns: 0 },
    anchor: 'practice-conversation',
    title: t`Practice conversation`,
    body: t`Its replies are scripted. Your real conversations open in this same space.`,
  },
  {
    id: 'model',
    practice: { turns: 0 },
    anchor: 'model-picker',
    open: true,
    waitFor: 'change',
    title: t`Choose a model`,
    body: t`Providers are on the left and their models on the right. Type to search all of them.`,
    tryIt: t`Choose another model.`,
  },
  {
    id: 'reasoning',
    practice: { turns: 0 },
    anchor: 'reasoning-effort',
    open: true,
    waitFor: 'change',
    title: t`Reasoning effort`,
    body: t`Higher effort takes longer and suits harder problems. Lower effort answers sooner.`,
    tryIt: t`Pick a level.`,
  },
  {
    id: 'permissions',
    practice: { turns: 0 },
    anchor: 'confirmation-policy',
    open: true,
    waitFor: 'change',
    title: t`Confirmation policy`,
    body: t`Decide what ${ph({ agent: vocab.agent })} may do without asking you first. Ask first is the safest choice.`,
    tryIt: t`Pick a policy.`,
  },
  {
    id: 'attach',
    practice: { turns: 0 },
    anchor: 'add-context',
    open: true,
    title: t`Add files and data`,
    body: t`Upload files from this computer or add data from a connected source. To mention a workspace file, type @ in your message.`,
  },
  {
    id: 'send',
    practice: { turns: 0, draft: PLOT_REQUEST },
    anchor: 'composer',
    waitFor: 'sent',
    title: t`Send a message`,
    body: t`A practice request is already typed in.`,
    tryIt: t`Press Enter or the send button.`,
  },
  {
    id: 'activity',
    practice: { turns: 1 },
    anchor: 'tool-activity',
    waitFor: 'change',
    stay: true,
    title: t`See each step`,
    body: t`Every command, file edit and search gets its own row.`,
    tryIt: t`Open the row to see the script and its output.`,
  },
  {
    id: 'artifact',
    practice: { turns: 1 },
    anchor: 'artifact-card',
    waitFor: 'artifact-opened',
    title: t`Files it creates`,
    body: t`Plots, tables and reports show up as file cards in the conversation.`,
    tryIt: t`Open the plot.`,
  },
  {
    id: 'viewer',
    practice: { turns: 1, viewer: true },
    anchor: 'practice-artifact-viewer',
    title: t`Files open beside the conversation`,
    body: t`Zoom, comment and download from the toolbar. More has the rest.`,
  },
  {
    id: 'ask-data',
    practice: { turns: 1, draft: TRACKS_REQUEST },
    anchor: 'composer',
    waitFor: 'sent',
    title: t`Ask for data`,
    body: t`Answers can include maps, charts and tables.`,
    tryIt: t`Send this request too.`,
  },
  {
    id: 'explore',
    practice: { turns: 2 },
    anchor: 'interactive-surface',
    waitFor: 'interact',
    focus: 'canvas',
    title: t`Explore the results`,
    body: t`Maps, charts and tables work right in the conversation. Hover for values, scroll to zoom and drag to pan.`,
    tryIt: t`Zoom or pan the map.`,
  },
  {
    id: 'select',
    practice: { turns: 2 },
    anchor: 'interactive-surface',
    waitFor: 'referenced',
    focus: '[role="grid"], [role="table"], table',
    title: t`Select data`,
    body: t`The map and the table share one selection.`,
    tryIt: t`Click a table row, Shift+click another, then choose Reference this.`,
  },
  {
    id: 'referenced',
    practice: { turns: 2 },
    anchor: 'composer',
    title: t`Ask about your selection`,
    body: t`The points you selected go with your next message, so ${ph({ agent: vocab.agent })} works with exactly those.`,
  },
  {
    id: 'navigation',
    anchor: 'workspace-navigation',
    title: t`Workspaces and conversations`,
    body: t`The left bar lists your workspaces and conversations. Start a new conversation or search from the top.`,
  },
  {
    id: 'workbench',
    anchor: 'workbench-lists',
    title: t`Side panel`,
    body: t`Files, artifacts and activity open as tabs in a panel on the right. The button at the top right shows or hides it.`,
  },
  {
    id: 'settings',
    anchor: 'settings',
    title: t`Settings`,
    body: t`Models, connections and appearance are in Settings. To take this tour again, open Settings, then General.`,
  },
];
