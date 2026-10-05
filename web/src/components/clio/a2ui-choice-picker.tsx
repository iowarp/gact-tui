import { ChoicePicker as BasicChoicePicker, createComponentImplementation } from '@a2ui/react/v0_9';
import { ChoicePickerApi } from '@a2ui/web_core/v0_9/basic_catalog';
import { useState } from 'react';
import { CheckIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from '@/components/ui/command';

/** Keep small choice groups familiar; large groups become searchable dropdowns. */
export const ClioChoicePicker = createComponentImplementation(
  ChoicePickerApi,
  ({ props, context, buildChild }) => {
    const [open, setOpen] = useState(false);
    const options = (props.options ?? []).map((option) => ({
      ...option,
      label: context.dataContext.resolveDynamicValue<string>(option.label),
    }));
    if (options.length <= 12) {
      const Original = BasicChoicePicker.render;
      return <Original context={context} buildChild={buildChild} />;
    }
    const values = Array.isArray(props.value)
      ? props.value
      : typeof props.value === 'string'
        ? [props.value]
        : [];
    const selected = options.filter((option) => values.includes(option.value));
    const caption =
      selected.length > 2
        ? `${selected.length} selected`
        : selected.map((option) => option.label).join(', ') || 'Choose…';
    return (
      <div className="min-w-0 space-y-2" data-slot="a2ui-searchable-choice">
        {props.label ? <p className="text-sm font-medium">{props.label}</p> : null}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              aria-label={props.label || 'Choose options'}
              aria-expanded={open}
              role="combobox"
              variant="outline"
              className="w-full justify-between"
            >
              <span className="truncate">{caption}</span>
              <ChevronsUpDownIcon aria-hidden="true" className="size-4 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-(--radix-popover-trigger-width) min-w-64 max-w-[90vw] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder={`Search ${props.label || 'options'}…`} />
              <CommandList className="max-h-72">
                <CommandEmpty>No matching options.</CommandEmpty>
                {options.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    keywords={[option.label]}
                    onSelect={() => {
                      const exclusive = props.variant === 'mutuallyExclusive';
                      props.setValue(
                        exclusive
                          ? [option.value]
                          : values.includes(option.value)
                            ? values.filter((value) => value !== option.value)
                            : [...values, option.value],
                      );
                      if (exclusive) setOpen(false);
                    }}
                  >
                    <CheckIcon
                      aria-hidden="true"
                      className={values.includes(option.value) ? 'size-4' : 'size-4 opacity-0'}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {props.validationErrors?.length ? (
          <p role="alert" className="text-xs text-destructive">
            {props.validationErrors.join(' ')}
          </p>
        ) : null}
      </div>
    );
  },
);
