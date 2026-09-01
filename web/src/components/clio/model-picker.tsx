import { CheckIcon } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import type { ClioModelOption } from '@/lib/model-options';
import { providerLogoId } from '@/lib/provider-presentation';

interface ClioModelPickerProps {
  model?: string;
  onChange: (choice: ClioModelOption) => void;
  options: readonly ClioModelOption[];
  provider?: string;
  title?: string;
  trigger: ReactNode;
}

/** Searchable AI Elements model picker shared by session and agent surfaces. */
export function ClioModelPicker({
  model,
  onChange,
  options,
  provider,
  title = 'Choose a model',
  trigger,
}: ClioModelPickerProps) {
  const [open, setOpen] = useState(false);
  const groupedModels = useMemo(
    () =>
      Object.entries(
        options.reduce<Record<string, ClioModelOption[]>>((groups, option) => {
          (groups[option.providerName] ??= []).push(option);
          return groups;
        }, {}),
      ),
    [options],
  );

  return (
    <ModelSelector onOpenChange={setOpen} open={open}>
      <ModelSelectorTrigger asChild>{trigger}</ModelSelectorTrigger>
      <ModelSelectorContent title={title}>
        <ModelSelectorInput placeholder="Search providers and models" />
        <ModelSelectorList>
          <ModelSelectorEmpty>No available models match your search.</ModelSelectorEmpty>
          {groupedModels.map(([providerName, choices]) => (
            <ModelSelectorGroup heading={providerName} key={providerName}>
              {choices.map((choice) => (
                <ModelSelectorItem
                  disabled={!choice.available}
                  key={`${choice.providerId}:${choice.id}`}
                  onSelect={() => {
                    onChange(choice);
                    setOpen(false);
                  }}
                  value={`${choice.providerName} ${choice.label} ${choice.id}`}
                >
                  <ModelSelectorLogo provider={providerLogoId(choice.providerId)} />
                  <ModelSelectorName>
                    <span className="block truncate">{choice.label}</span>
                    {choice.description || choice.availabilityDetail ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {choice.availabilityDetail ?? choice.description}
                      </span>
                    ) : null}
                  </ModelSelectorName>
                  {provider === choice.providerId && model === choice.id ? (
                    <CheckIcon aria-hidden="true" className="size-4 text-primary" />
                  ) : null}
                </ModelSelectorItem>
              ))}
            </ModelSelectorGroup>
          ))}
        </ModelSelectorList>
      </ModelSelectorContent>
    </ModelSelector>
  );
}
