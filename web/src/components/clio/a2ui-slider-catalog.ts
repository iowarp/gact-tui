import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement } from 'react';
import { z } from 'zod';
import { ClioNumberSlider } from './number-slider';

const numberSliderShape = {
    label: CommonSchemas.DynamicString,
    value: CommonSchemas.DynamicValue,
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
    unit: z.string().optional(),
    range: z.boolean().optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
};
export const numberSliderSchema = z.object(numberSliderShape).strict();
const refinedNumberSliderSchema = z.object(numberSliderShape).strict().superRefine((value, context) => {
  if (typeof value.value === 'object' && value.value !== null && 'path' in value.value) return;
  if (!value.range && typeof value.value === 'object' && value.value !== null && 'functionCall' in value.value) return;
  const valid = value.range
    ? Array.isArray(value.value) && value.value.length === 2 && value.value.every((item) => typeof item === 'number' && Number.isFinite(item))
    : typeof value.value === 'number' && Number.isFinite(value.value);
  if (!valid) context.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: value.range ? 'range mode requires two numeric values' : 'single mode requires one numeric value' });
});
Object.defineProperty(numberSliderSchema, '_parse', {
  value: (input: z.ParseInput) => refinedNumberSliderSchema._parse(input),
});

/** Protocol adapter for `clio.slider.v1`; `setValue` writes the bound `value` path. */
export const ClioSliderCatalogComponent = createComponentImplementation(
  { name: 'clio.slider.v1', schema: numberSliderSchema },
  ({ props }) =>
    createElement(ClioNumberSlider, {
      accessibility: props.accessibility,
      label: props.label,
      max: props.max,
      min: props.min,
      rangeMode: props.range,
      setValue: props.setValue,
      step: props.step,
      unit: props.unit,
      value: props.value as number | [number, number],
      weight: props.weight,
    }),
);
