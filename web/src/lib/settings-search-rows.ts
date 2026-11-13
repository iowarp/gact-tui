import { RESPONSE_SETTING_LABELS } from '@/components/clio/settings-models-form';
import { vocab } from './brand-vocabulary';
import { ONBOARDING_TOUR_ENABLED } from './onboarding/tour-flag';
import { t } from '@lingui/core/macro';

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
 * title on `section`'s page, so the arrival can mark that row: both are the same
 * message, translated alike. `keywords` stay English search terms.
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
  const { agent } = vocab;
  return [
    {
      label: t`Paste as source after`,
      section: 'general',
      keywords: 'paste attachment characters text',
    },
    {
      label: t`Transcript preview lines`,
      section: 'general',
      keywords: 'preview lines transcript',
    },
    { label: t`Hide dot files and folders`, section: 'general', keywords: 'hidden dotfiles files' },
    ...(ONBOARDING_TOUR_ENABLED
      ? [
          {
            label: t`Replay tutorial`,
            section: 'general',
            keywords: 'tour onboarding introduction help',
          },
        ]
      : []),
    {
      label: t`Language`,
      section: 'appearance',
      // Findable from any interface language, including one the reader can't read.
      // i18n-ignore: search terms in every language, never translated
      keywords: 'language locale translation english español 日本語 ελληνικά',
    },
    { label: t`Theme`, section: 'appearance', keywords: 'dark light colour color', value: 'theme' },
    {
      label: t`Interface size`,
      section: 'appearance',
      keywords: 'zoom scale text font size',
      value: 'interface-size',
    },
    {
      label: t`Conversation width`,
      section: 'appearance',
      keywords: 'focused wide column',
      value: 'conversation-width',
    },
    { label: t`Motion`, section: 'appearance', keywords: 'animation reduce', value: 'motion' },
    { label: t`Email`, section: 'profile', keywords: 'address contact' },
    { label: t`Name`, section: 'profile', keywords: 'display name your name' },
    { label: t`About you`, section: 'profile', keywords: 'personal description' },
    { label: t`Sound`, section: 'notifications', keywords: 'attention chime audio' },
    { label: t`Desktop alerts`, section: 'notifications', keywords: 'alerts notify' },
    {
      label: t`Finished work`,
      section: 'notifications',
      keywords: 'done stopped run notify alert',
    },
    { label: t`Beta updates`, section: 'general', keywords: 'channel prerelease update' },
    { label: t`Use account memory`, section: 'memory', keywords: 'remember facts account' },
    { label: t`Address`, section: 'connections', keywords: 'endpoint url server' },
    { label: t`Transport`, section: 'connections', keywords: 'protocol websocket http' },
    {
      label: t`Default model`,
      section: 'models',
      keywords: 'model provider llm',
      value: 'default-model',
    },
    {
      label: t`Reasoning effort`,
      section: 'models',
      keywords: 'thinking reasoning level',
      value: 'reasoning-effort',
    },
    {
      label: t`Fast model`,
      section: 'models',
      keywords: 'small helper titles summaries cheap quick haiku trivial model',
    },
    {
      label: t`Show diffusion`,
      section: 'models',
      keywords: 'diffusion redraw stream reply live',
    },
    { label: t`Request timeout`, section: 'models', keywords: 'timeout seconds model call' },
    {
      label: t`Context size`,
      section: 'models',
      keywords: 'context window working context tokens length',
    },
    // The selected model's response settings, as the Models page names them.
    ...(Object.entries(RESPONSE_SETTING_LABELS) as [string, string][])
      .filter(([name]) => name !== 'context_length')
      .map(([name, label]) => ({
        label,
        section: 'models',
        // i18n-ignore: English search terms, never translated
        keywords: `response sampling ${name.replaceAll('_', ' ')}`,
      })),
    { label: t`${agent} Search`, section: 'fleet', keywords: 'search helper model' },
    { label: t`SPOTTER review`, section: 'fleet', keywords: 'spotter judge review model' },
    { label: t`Suggest Explore while searching`, section: 'fleet', keywords: 'explore nudge' },
    {
      label: t`Reads before the suggestion`,
      section: 'fleet',
      keywords: 'explore nudge reads threshold',
    },
    {
      label: t`Delegation`,
      section: 'fleet',
      keywords: 'delegate delegated work accounts providers allowed spending',
    },
    {
      label: t`Model servers`,
      section: 'providers',
      keywords: 'local server ollama running',
      list: true,
    },
    { label: t`Keys and sign-ins`, section: 'providers', keywords: 'api key login sign in' },
    { label: t`Model`, section: 'session-defaults', keywords: 'new session model' },
    { label: t`Agent`, section: 'session-defaults', keywords: 'new session agent' },
    { label: t`Work mode`, section: 'session-defaults', keywords: 'mode plan autopilot' },
    { label: t`Confirmations`, section: 'session-defaults', keywords: 'approve confirm' },
    { label: t`Configuration file`, section: 'runtime', keywords: 'config file path' },
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
