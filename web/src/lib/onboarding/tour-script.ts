import { brand } from '@brand';
import { vocab } from '@/lib/brand-vocabulary';
import type { TourAnchorId } from './tour-anchors';

/**
 * DRAFT step copy. The final wording is written after the RC1 interface
 * freeze; until then the card carries a visible Draft label and the tour stays
 * behind `ONBOARDING_TOUR_ENABLED`. Change text here, not in components.
 */
export const TOUR_SCRIPT_STATUS: 'draft' | 'final' = 'draft';

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** What the step points at. Missing on screen means a centred card. */
  anchor?: TourAnchorId;
  /** `practice` steps run over the scripted conversation, never a real one. */
  stage: 'app' | 'practice';
  /** A short instruction for something to try on the highlighted element. */
  tryIt?: string;
}

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    stage: 'app',
    title: `Welcome to ${brand.name}`,
    body: `A one-minute look at how to work with ${vocab.agent}. Skip it any time with Esc; it stays in Settings.`,
  },
  {
    id: 'composer',
    stage: 'app',
    anchor: 'composer',
    title: 'Ask here',
    body: 'Describe the task, attach files or folders, and choose the model. Press Enter to send.',
  },
  {
    id: 'practice',
    stage: 'practice',
    anchor: 'practice-conversation',
    title: 'A practice conversation',
    body: 'This one is scripted. Nothing you do here is sent or saved.',
  },
  {
    id: 'artifact',
    stage: 'practice',
    anchor: 'artifact-card',
    title: 'Files it makes',
    body: `Plots, tables and reports ${vocab.agent} writes show up as cards. Open one to read it in full or download it.`,
  },
  {
    id: 'surface',
    stage: 'practice',
    anchor: 'interactive-surface',
    title: 'Results you can explore',
    body: 'Maps, charts and tables share one selection. Pan, zoom and filter like any viewer.',
    tryIt: 'Click a point on the map or a row in the table.',
  },
  {
    id: 'select',
    stage: 'practice',
    anchor: 'interactive-surface',
    title: 'Point at the data',
    body: `Select points, then use Reference this. ${vocab.agent} receives exactly the data you picked.`,
    tryIt: 'Click a row, Shift+click another, then use Reference this above the table.',
  },
  {
    id: 'activity',
    stage: 'practice',
    anchor: 'tool-activity',
    title: 'What it did',
    body: 'Every command, file edit and search is one row. Open a row to see the request and the result.',
  },
  {
    id: 'navigation',
    stage: 'app',
    anchor: 'workspace-navigation',
    title: 'Your conversations',
    body: 'Conversations are grouped by workspace. Start a new one or return to an earlier one here.',
  },
  {
    id: 'workbench',
    stage: 'app',
    anchor: 'workbench-lists',
    title: 'Where things live',
    body: 'Files, artifacts and activity for this conversation open in this side panel, as tabs beside the chat.',
  },
  {
    id: 'settings',
    stage: 'app',
    anchor: 'settings',
    title: 'Settings',
    body: 'Models, connections and appearance. Replay this tour from Settings, General.',
  },
];
