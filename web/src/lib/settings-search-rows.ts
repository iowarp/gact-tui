import { RESPONSE_SETTING_LABELS } from '@/components/clio/settings-models-form';
import { vocab } from './brand-vocabulary';
import { ONBOARDING_TOUR_ENABLED } from './onboarding/tour-flag';

/** A current value that global search can show at the right of a setting's row. */
export type SettingsSearchValue =
  | 'default-model'
  | 'reasoning-effort'
  | 'theme'
  | 'interface-size'
  | 'conversation-width'
  | 'motion';

/**
 * One setting that global search lists by name. `label` is the `SettingsRow`
 * title on `section`'s page, so the arrival can mark that row.
 */
export interface SettingsSearchRow {
  label: string;
  /** The settings destination id the row lives on. */
  section: string;
  keywords?: string;
  value?: SettingsSearchValue;
  /**
   * A list on the page rather than one setting: the filtered window shows it as
   * one row that opens its section.
   */
  list?: boolean;
}

export function settingsSearchRows(): readonly SettingsSearchRow[] {
  return [
    {
      label: 'Paste as source after',
      section: 'general',
      keywords: 'paste attachment characters text',
    },
    { label: 'Transcript preview lines', section: 'general', keywords: 'preview lines transcript' },
    { label: 'Hide dot files and folders', section: 'general', keywords: 'hidden dotfiles files' },
    ...(ONBOARDING_TOUR_ENABLED
      ? [
          {
            label: 'Replay tutorial',
            section: 'general',
            keywords: 'tour onboarding introduction help',
          },
        ]
      : []),
    { label: 'Theme', section: 'appearance', keywords: 'dark light colour color', value: 'theme' },
    {
      label: 'Interface size',
      section: 'appearance',
      keywords: 'zoom scale text font size',
      value: 'interface-size',
    },
    {
      label: 'Conversation width',
      section: 'appearance',
      keywords: 'focused wide column',
      value: 'conversation-width',
    },
    { label: 'Motion', section: 'appearance', keywords: 'animation reduce', value: 'motion' },
    { label: 'Email', section: 'profile', keywords: 'address contact' },
    { label: 'Name', section: 'profile', keywords: 'display name your name' },
    { label: 'About you', section: 'profile', keywords: 'personal description' },
    { label: 'Sound', section: 'notifications', keywords: 'attention chime audio' },
    { label: 'Desktop alerts', section: 'notifications', keywords: 'alerts notify' },
    {
      label: 'Finished work',
      section: 'notifications',
      keywords: 'done stopped run notify alert',
    },
    { label: 'Beta updates', section: 'general', keywords: 'channel prerelease update' },
    { label: 'Use account memory', section: 'memory', keywords: 'remember facts account' },
    { label: 'Address', section: 'connections', keywords: 'endpoint url server' },
    { label: 'Transport', section: 'connections', keywords: 'protocol websocket http' },
    {
      label: 'Default model',
      section: 'models',
      keywords: 'model provider llm',
      value: 'default-model',
    },
    {
      label: 'Reasoning effort',
      section: 'models',
      keywords: 'thinking reasoning level',
      value: 'reasoning-effort',
    },
    { label: 'Fast model', section: 'models', keywords: 'small helper titles summaries model' },
    {
      label: 'Show diffusion',
      section: 'models',
      keywords: 'diffusion redraw stream reply live',
    },
    { label: 'Request timeout', section: 'models', keywords: 'timeout seconds model call' },
    {
      label: 'Context size',
      section: 'models',
      keywords: 'context window working context tokens length',
    },
    // The selected model's response settings, as the Models page names them.
    ...(Object.entries(RESPONSE_SETTING_LABELS) as [string, string][])
      .filter(([, label]) => label !== 'Context size')
      .map(([name, label]) => ({
        label,
        section: 'models',
        keywords: `response sampling ${name.replaceAll('_', ' ')}`,
      })),
    { label: `${vocab.agent} Search`, section: 'fleet', keywords: 'search helper model' },
    { label: 'SPOTTER review', section: 'fleet', keywords: 'spotter judge review model' },
    { label: 'Suggest Explore while searching', section: 'fleet', keywords: 'explore nudge' },
    {
      label: 'Reads before the suggestion',
      section: 'fleet',
      keywords: 'explore nudge reads threshold',
    },
    {
      label: 'Model servers',
      section: 'providers',
      keywords: 'local server ollama running',
      list: true,
    },
    { label: 'Keys and sign-ins', section: 'providers', keywords: 'api key login sign in' },
    { label: 'Model', section: 'session-defaults', keywords: 'new session model' },
    { label: 'Agent', section: 'session-defaults', keywords: 'new session agent' },
    { label: 'Work mode', section: 'session-defaults', keywords: 'mode plan autopilot' },
    { label: 'Confirmations', section: 'session-defaults', keywords: 'approve confirm' },
    { label: 'Configuration file', section: 'runtime', keywords: 'config file path' },
  ];
}

/** The route fragment that marks one setting's row on arrival. */
export function settingsRowHash(label: string): string {
  return `#setting=${encodeURIComponent(label)}`;
}

/** The setting a `#setting=` fragment names, if any. */
export function settingFromHash(hash: string): string | undefined {
  const match = /^#setting=(.+)$/u.exec(hash);
  if (!match?.[1]) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}
