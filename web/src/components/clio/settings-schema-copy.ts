import type { RuntimeSetting } from '@clio/core/v3';
import { i18n } from '@/i18n/instance';
import { SOURCE_LOCALE } from '@/i18n/locales';
import { vocab } from '@/lib/brand-vocabulary';
import { ph, plural, t } from '@lingui/core/macro';

const { agent } = vocab;

/**
 * Interface-language copy for Settings text the agent describes in English
 * from a fixed schema: its runtime settings (clio-agent
 * `gact/runtime_settings.py`) and provider options (`providers/catalog.py`),
 * each by its stable key. A key not listed here shows the agent's own text.
 */
interface SettingCopy {
  title: string;
  description: string;
  effect: string;
  /** Choice labels by choice value. */
  choices?: Record<string, string>;
  /** Preset labels by preset value. */
  presets?: Record<number, string>;
}

const minutes = (count: number) => plural(count, { one: '# minute', other: '# minutes' });
const days = (count: number) => plural(count, { one: '# day', other: '# days' });

const NEXT_MODEL_REQUESTS = t`Applies to subsequent model requests.`;
const BROWSER_EFFECT = t`Applies at once: open pages close, and the next page opens in the chosen browser.`;

export const RUNTIME_SETTING_COPY: Readonly<Record<string, SettingCopy>> = {
  'agent_tasks.max_concurrent': {
    title: t`Concurrent subagents`,
    description: t`Maximum reserved or in-flight child model calls at each nesting level. Tools and waits release permits. Agent-specific inference limits may be lower.`,
    effect: t`Applies immediately to inference admission. Active model calls finish; waiting calls use the new limit.`,
  },
  'agent_tasks.max_depth': {
    title: t`Maximum nesting depth`,
    description: t`How many levels of subagents may be created. The first child is level 1.`,
    effect: t`Applies to new subagents immediately. Existing descendants remain visible.`,
  },
  'agent_tasks.max_forks_per_task': {
    title: t`Forks per task`,
    description: t`Most copies an agent may make of itself to try another direction, per task. Inside a workflow a fork counts as an added step instead.`,
    effect: t`Applies to forks made from now on.`,
  },
  'workflows.max_added_steps': {
    title: t`Steps editors may add`,
    description: t`Most steps a workflow's editors may add to one run. A workflow may ask for fewer.`,
    effect: t`Applies to steps proposed from now on.`,
  },
  'workflows.max_edit_rounds': {
    title: t`Editing rounds`,
    description: t`Most rounds of edits in one workflow run. A workflow may ask for fewer.`,
    effect: t`Applies to edits proposed from now on.`,
  },
  'limits.lm_call_s': {
    title: t`Model request timeout`,
    description: t`Maximum time for a model request. Provider limits may end a request sooner.`,
    effect: NEXT_MODEL_REQUESTS,
  },
  'limits.lm_inter_token_idle_s': {
    title: t`Stream idle timeout`,
    description: t`Maximum wait between pieces of a streamed response.`,
    effect: NEXT_MODEL_REQUESTS,
  },
  'tools.mcp.call_timeout_s': {
    title: t`Default tool timeout`,
    description: t`Used when a tool call has no explicit timeout. A tool can declare its own budget.`,
    effect: t`Restart the connected ${agent} service to update existing tool clients.`,
  },
  'limits.lm_transient_retries': {
    title: t`Model retries`,
    description: t`Retries a temporary provider failure before any response has streamed.`,
    effect: t`Restart the connected ${agent} service to update existing model clients.`,
  },
  'autocompact.pct': {
    title: t`Automatic compaction threshold`,
    description: t`Context fullness at which ${agent} prepares a summary. Session preferences take precedence.`,
    effect: t`Applies to sessions without their own compaction threshold.`,
  },
  'runtime.capture_reasoning': {
    title: t`Save model reasoning`,
    description: t`Keep reasoning supplied by the provider with the saved response, when available.`,
    effect: t`Applies when subsequent responses are saved.`,
  },
  'transcript.file': {
    title: t`Save transcript files`,
    description: t`Keep a separate transcript file alongside conversation storage. Existing files are retained.`,
    effect: t`Restart the connected ${agent} service for this change to take effect.`,
  },
  'memory.enabled': {
    title: t`Use memory`,
    description: t`Use saved facts and preferences in later conversations. Turning this off keeps existing memories.`,
    effect: t`Applies to sessions that start after the change.`,
  },
  'memory.background': {
    title: t`Create memories from conversations`,
    description: t`Uses background model calls, which count toward model usage. Models are set in Fleet.`,
    effect: t`Applies on the next background scheduler pass.`,
  },
  'memory.session_search': {
    title: t`Use conversation history`,
    description: t`Recall earlier messages, separate from saved memories. Retrieved text can add model usage; no background jobs.`,
    effect: t`Applies to upcoming session-recall requests.`,
  },
  'memory.sensitive': {
    title: t`Include sensitive topics`,
    description: t`Let background memory keep facts about health, finances, beliefs and similar matters.`,
    effect: t`Applies at the next idle check.`,
  },
  'memory.auto_accept': {
    title: t`Apply background changes without review`,
    description: t`Choose which new and updated memories save automatically. Retirement needs review.`,
    effect: t`Applies to proposals made after the change.`,
    choices: {
      user_stated: t`Facts I state directly`,
      all: t`All new and updated memories`,
      none: t`Review every change`,
    },
  },
  'memory.idle_minutes': {
    title: t`Create memories`,
    description: t`Runs after a completed turn or idle delay, at the next background check.`,
    effect: t`Applies on the next scheduler pass, normally checked once a minute.`,
    presets: {
      0: t`After each completed turn`,
      5: minutes(5),
      15: minutes(15),
      30: minutes(30),
      60: plural(1, { one: '# hour', other: '# hours' }),
    },
  },
  'memory.expiry_days': {
    title: t`Review unused memories after`,
    description: t`Profile and preferences are always kept. Other retirement proposals need review.`,
    effect: t`Applies at the next background pass.`,
    presets: {
      0: t`Never`,
      30: days(30),
      60: days(60),
      90: days(90),
      180: days(180),
      365: plural(1, { one: '# year', other: '# years' }),
    },
  },
  'browser.backend': {
    title: t`Which browser`,
    description: t`The browser that shows the pages the agent opens. A separate browser keeps its own sign-ins; your running Chrome or Edge has yours.`,
    effect: BROWSER_EFFECT,
    choices: { managed: t`A separate browser`, cdp: t`Your running Chrome or Edge` },
  },
  'browser.channel': {
    title: t`Separate browser`,
    description: t`Used with a separate browser: the bundled Chromium, downloaded on first use, or the Chrome or Edge installed on that computer, with a profile of its own.`,
    effect: BROWSER_EFFECT,
    choices: {
      chromium: t`Bundled Chromium`,
      chrome: t`Installed Google Chrome`,
      msedge: t`Installed Microsoft Edge`,
    },
  },
  'browser.cdp_url': {
    title: t`Running browser to connect to`,
    description: t`Used with your running Chrome or Edge: ${ph({ chrome: 'chrome' })} or ${ph({ edge: 'msedge' })} for the one on that computer, after you turn on remote debugging at ${ph({ page: 'chrome://inspect/#remote-debugging' })} (Chrome 144 or later), or a DevTools address such as ${ph({ address: 'http://127.0.0.1:9222' })}.`,
    effect: BROWSER_EFFECT,
  },
};

/** Group names, which the agent also uses as identifiers, by their English name. */
const GROUP_LABELS: Readonly<Record<string, string>> = {
  Execution: t`Execution`,
  Subagents: t`Subagents`,
  Workflows: t`Workflows`,
  'Memory & history': t`Memory & history`,
  Memory: t`Memory`,
  Browser: t`Browser`,
};

/** The agent's fixed explanations for a locked setting, by their English text. */
const REASONS: Readonly<Record<string, string>> = {
  "Set by the connected service's workspace configuration.": t`Set by the connected service's workspace configuration.`,
  'Transcript files are required while this service uses in-memory conversation history.': t`Transcript files are required while this service uses in-memory conversation history.`,
};

/**
 * The known translation, or the agent's own text. English always shows the
 * agent's text, so a copy change there reaches people without a release here.
 */
function pick(known: string | undefined, schema: string): string {
  return known !== undefined && i18n.locale !== SOURCE_LOCALE ? known : schema;
}

interface ProviderOptionCopy {
  label: string;
  description: string;
  /** Choice labels by choice value. */
  options?: Record<string, string>;
}

/** The options a provider declares it needs, by stable field id. */
export const PROVIDER_OPTION_COPY: Readonly<Record<string, ProviderOptionCopy>> = {
  api_version: { label: t`API version`, description: t`Azure OpenAI API version.` },
  vertex_project: {
    label: t`Google Cloud project`,
    description: t`Project containing the model.`,
  },
  vertex_location: { label: t`Google Cloud location`, description: t`Vertex region.` },
  aws_region_name: { label: t`AWS region`, description: t`Region containing the model.` },
  aws_profile_name: { label: t`AWS profile`, description: t`Optional shared AWS profile name.` },
  show_diffusion: {
    label: t`Show diffusion`,
    description: t`Stream each denoising step of a diffusion model (such as Mercury) in place. Only the final answer is stored.`,
    options: { off: t`Off`, on: t`On` },
  },
};

/** A provider option's words in the interface language. */
export function localizeProviderOption(field: {
  id: string;
  label: string;
  description?: string | null;
}): { label: string; description: string | undefined; option: (value: string) => string } {
  const copy = PROVIDER_OPTION_COPY[field.id];
  return {
    label: pick(copy?.label, field.label),
    description: field.description ? pick(copy?.description, field.description) : undefined,
    option: (value) => pick(copy?.options?.[value], value),
  };
}

/** The name of a settings group in the interface language. */
export function runtimeGroupLabel(group: string): string {
  return pick(GROUP_LABELS[group], group);
}

/**
 * The setting with its words in the interface language. Its key, group,
 * values and limits are unchanged, so it is still the setting the agent sent.
 */
export function localizeRuntimeSetting(setting: RuntimeSetting): RuntimeSetting {
  const copy = RUNTIME_SETTING_COPY[setting.key];
  return {
    ...setting,
    title: pick(copy?.title, setting.title),
    description: pick(copy?.description, setting.description),
    effect: pick(copy?.effect, setting.effect),
    reason: setting.reason === null ? null : pick(REASONS[setting.reason], setting.reason),
    choices: setting.choices.map((choice) => ({
      ...choice,
      label: pick(copy?.choices?.[choice.value], choice.label),
    })),
    presets: setting.presets?.map((preset) => ({
      ...preset,
      label: pick(copy?.presets?.[preset.value], preset.label),
    })),
  };
}
