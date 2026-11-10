import { cn } from '@/lib/utils';
import type { ComponentProps } from 'react';
import { GENERIC_PROVIDER_LOGO_ID, providerLogoUrls } from './provider-logo-svgs';

export type ModelSelectorLogoProps = Omit<ComponentProps<'span'>, 'children'> & {
  provider:
    | 'moonshotai-cn'
    | 'lucidquery'
    | 'moonshotai'
    | 'zai-coding-plan'
    | 'alibaba'
    | 'xai'
    | 'vultr'
    | 'nvidia'
    | 'upstage'
    | 'groq'
    | 'github-copilot'
    | 'mistral'
    | 'vercel'
    | 'nebius'
    | 'deepseek'
    | 'alibaba-cn'
    | 'google-vertex-anthropic'
    | 'venice'
    | 'chutes'
    | 'cortecs'
    | 'github-models'
    | 'togetherai'
    | 'azure'
    | 'baseten'
    | 'huggingface'
    | 'opencode'
    | 'fastrouter'
    | 'google'
    | 'google-vertex'
    | 'cloudflare-workers-ai'
    | 'inception'
    | 'wandb'
    | 'openai'
    | 'zhipuai-coding-plan'
    | 'perplexity'
    | 'openrouter'
    | 'zenmux'
    | 'v0'
    | 'iflowcn'
    | 'synthetic'
    | 'deepinfra'
    | 'zhipuai'
    | 'submodel'
    | 'zai'
    | 'inference'
    | 'requesty'
    | 'morph'
    | 'lmstudio'
    | 'anthropic'
    | 'aihubmix'
    | 'fireworks-ai'
    | 'modelscope'
    | 'llama'
    | 'scaleway'
    | 'amazon-bedrock'
    | 'cerebras'
    // oxlint-disable-next-line typescript-eslint(ban-types) -- intentional pattern for autocomplete-friendly string union
    | (string & {});
};

export const ModelSelectorLogo = ({ provider, className, ...props }: ModelSelectorLogoProps) => {
  // Object.hasOwn guards this lookup against an arbitrary provider string
  // ("constructor", "toString", "__proto__", ...) resolving to an inherited
  // Object.prototype member instead of falling back to the generic mark.
  const logoUrl = Object.hasOwn(providerLogoUrls, provider)
    ? providerLogoUrls[provider]
    : providerLogoUrls[GENERIC_PROVIDER_LOGO_ID];

  return (
    <span
      {...props}
      aria-label={`${provider} logo`}
      className={cn(
        'inline-grid size-5 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground',
        className,
      )}
      data-provider-logo=""
      role="img"
      title={`${provider} provider`}
    >
      <span
        aria-hidden="true"
        className="size-3.5 bg-current"
        data-provider-logo-mask={logoUrl}
        style={{
          maskImage: `url(${logoUrl})`,
          maskPosition: 'center',
          maskRepeat: 'no-repeat',
          maskSize: 'contain',
        }}
      />
    </span>
  );
};
