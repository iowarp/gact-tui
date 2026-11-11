import { brand } from '@brand';
import { vocab } from '@/lib/brand-vocabulary';
import type { TourAnchorId } from './tour-anchors';

/**
 * DRAFT step copy. The final wording is written after the RC1 interface
 * freeze; until then the card carries a visible Draft label and the tour stays
 * behind `ONBOARDING_TOUR_ENABLED`. Change text here, not in components.
 */
export const TOUR_SCRIPT_STATUS: 'draft' | 'final' = 'draft';

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
  /** A short instruction for something to try on the highlighted element. */
  tryIt?: string;
}

const PLOT_REQUEST = 'Plot the vertical displacement at station BKL1.';
const TRACKS_REQUEST = 'Show the 2017 and 2019 Atlantic hurricane tracks.';

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    title: `Welcome to ${brand.name}`,
    body: `A two-minute, hands-on look at working with ${vocab.agent}. Leave any time with Esc or Skip; replay it from Settings.`,
  },
  {
    id: 'practice',
    practice: { turns: 0 },
    anchor: 'practice-conversation',
    title: 'Conversations show here',
    body: 'This one is for practice: the replies are scripted, and nothing you do is sent or saved.',
  },
  {
    id: 'model',
    practice: { turns: 0 },
    anchor: 'model-picker',
    open: true,
    waitFor: 'change',
    title: 'Pick a model',
    body: 'Models are grouped by provider. Search, compare and choose the one that suits the task.',
    tryIt: 'Choose a different model.',
  },
  {
    id: 'reasoning',
    practice: { turns: 0 },
    anchor: 'reasoning-effort',
    open: true,
    waitFor: 'change',
    title: 'Thinking level',
    body: 'Higher levels think longer before answering. Lower ones answer faster.',
    tryIt: 'Pick a level.',
  },
  {
    id: 'permissions',
    practice: { turns: 0 },
    anchor: 'confirmation-policy',
    open: true,
    waitFor: 'change',
    title: 'Permissions',
    body: `Choose what ${vocab.agent} may do without asking: ask first, allow workspace edits, or let a reviewer approve.`,
    tryIt: 'Pick a policy.',
  },
  {
    id: 'attach',
    practice: { turns: 0 },
    anchor: 'add-context',
    open: true,
    title: 'Attach files and data',
    body: 'Upload files, or bring in data from a connected source such as cloud storage. Type @ to point at a file in the workspace.',
  },
  {
    id: 'send',
    practice: { turns: 0, draft: PLOT_REQUEST },
    anchor: 'composer',
    waitFor: 'sent',
    title: 'Send a message',
    body: 'A practice request is ready.',
    tryIt: 'Press Enter or the send button.',
  },
  {
    id: 'activity',
    practice: { turns: 1 },
    anchor: 'tool-activity',
    waitFor: 'change',
    title: 'What it did',
    body: 'Every command, file edit and search is one row.',
    tryIt: 'Open the row to see the script and its output.',
  },
  {
    id: 'artifact',
    practice: { turns: 1 },
    anchor: 'artifact-card',
    waitFor: 'artifact-opened',
    title: 'Files it makes',
    body: 'Plots, tables and reports appear as cards in the conversation.',
    tryIt: 'Open the plot.',
  },
  {
    id: 'viewer',
    practice: { turns: 1, viewer: true },
    anchor: 'practice-artifact-viewer',
    title: 'Read it in full',
    body: 'Files open beside the chat. Download keeps the original, Export to… offers other formats, and More holds the details.',
  },
  {
    id: 'ask-data',
    practice: { turns: 1, draft: TRACKS_REQUEST },
    anchor: 'composer',
    waitFor: 'sent',
    title: 'Ask for data',
    body: 'Results can be maps, charts and tables, not only text.',
    tryIt: 'Send this one too.',
  },
  {
    id: 'explore',
    practice: { turns: 2 },
    anchor: 'interactive-surface',
    waitFor: 'interact',
    title: 'Charts stay in the chat',
    body: 'Maps, charts and tables are live right where they appear. Hover for values, scroll to zoom and drag to pan.',
    tryIt: 'Zoom or pan the map.',
  },
  {
    id: 'select',
    practice: { turns: 2 },
    anchor: 'interactive-surface',
    waitFor: 'referenced',
    title: 'Point at the data',
    body: 'The map and table share one selection.',
    tryIt: 'Click a row, Shift+click another, then choose Reference this.',
  },
  {
    id: 'referenced',
    practice: { turns: 2 },
    anchor: 'composer',
    title: 'Attached to your next message',
    body: `${vocab.agent} receives exactly the data you picked, along with what you ask about it.`,
  },
  {
    id: 'navigation',
    anchor: 'workspace-navigation',
    title: 'Your conversations',
    body: 'Your conversations live in the left bar, grouped by workspace. Start a new one or return to an earlier one.',
  },
  {
    id: 'workbench',
    anchor: 'workbench-lists',
    title: 'Where things live',
    body: 'Files, artifacts and activity for a conversation open in this side panel, as tabs beside the chat.',
  },
  {
    id: 'settings',
    anchor: 'settings',
    title: 'Settings',
    body: 'Models, connections and appearance, at the foot of the left bar. Replay this tour from Settings, General.',
  },
];
