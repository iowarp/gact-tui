import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { createElement } from 'react';
import { z } from 'zod';
import { ClioNumberSlider } from './number-slider';

export const numberSliderSchema = z
  .object({
    label: CommonSchemas.DynamicString,
    value: CommonSchemas.DynamicNumber,
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
    unit: z.string().optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

/** Protocol adapter for `clio.slider.v1`; `setValue` writes the bound `value` path. */
export const ClioSliderCatalogComponent = createComponentImplementation(
  { name: 'clio.slider.v1', schema: numberSliderSchema },
  ({ props }) =>
    createElement(ClioNumberSlider, {
      accessibility: props.accessibility,
      label: props.label,
      max: props.max,
      min: props.min,
      setValue: props.setValue,
      step: props.step,
      unit: props.unit,
      value: props.value,
      weight: props.weight,
    }),
);
