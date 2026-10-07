import { BrandIcon } from './brand-icon';
import { brand } from '@brand';
import type { ReactNode } from 'react';
import { ConversationEmptyState } from '@/components/ai-elements/conversation';
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion';

export interface ClioConversationWelcomeProps {
  children: ReactNode;
  disabled?: boolean;
  onSelectPrompt: (prompt: string) => void;
}

export function ClioConversationWelcome({
  children,
  disabled,
  onSelectPrompt,
}: ClioConversationWelcomeProps) {
  return (
    <section
      aria-label={`${brand.name} conversation welcome`}
      className="mx-auto flex w-full max-w-4xl flex-col items-center gap-6"
    >
      <ConversationEmptyState
        className="h-auto w-full gap-4 p-0"
        description={brand.workspace.description}
        icon={
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/12 text-primary shadow-sm ring-1 ring-primary/20">
            <BrandIcon className="size-9" />
          </span>
        }
        title={brand.workspace.greeting}
      />

      <div className="w-full">{children}</div>

      {brand.starterPrompts.length > 0 ? (
        <div className="w-full" role="group" aria-label="Starter prompts">
          <Suggestions className="gap-2 px-1 pb-1">
            {brand.starterPrompts.map((prompt) => (
              <Suggestion
                className="h-auto min-h-16 w-64 items-start justify-start whitespace-normal rounded-xl border-border/70 bg-card/55 px-4 py-3 text-left shadow-none transition-colors hover:border-primary/35 hover:bg-card focus-visible:border-primary sm:w-72"
                disabled={disabled}
                key={`${prompt.eyebrow}:${prompt.label}`}
                onClick={onSelectPrompt}
                suggestion={prompt.label}
              >
                <span className="min-w-0">
                  {prompt.eyebrow ? (
                    <span className="mb-1 block text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-primary">
                      {prompt.eyebrow}
                    </span>
                  ) : null}
                  <span className="line-clamp-2 block text-sm leading-5 text-foreground">
                    {prompt.label}
                  </span>
                </span>
              </Suggestion>
            ))}
          </Suggestions>
        </div>
      ) : null}
    </section>
  );
}
