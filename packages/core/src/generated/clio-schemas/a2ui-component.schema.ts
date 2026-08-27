/**
 * Generated from clio-schemas JSON Schema. Do not edit by hand.
 * Source: a2_u_i_component.json
 */
import { z } from 'zod';
import type { A2UIComponent } from './_models.js';

export const a2uiComponentGeneratedSchema: z.ZodType<A2UIComponent> = z
  .any()
  .superRefine((x, ctx) => {
    const schemas = [
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('Text').default('Text'),
          id: z.string(),
          text: z.any(),
          variant: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('Icon').default('Icon'),
          id: z.string(),
          name: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('Image').default('Image'),
          description: z.union([z.any(), z.null()]).default(null),
          fit: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          url: z.any(),
          variant: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          align: z.union([z.any(), z.null()]).default(null),
          children: z.any(),
          component: z.literal('Row').default('Row'),
          id: z.string(),
          justify: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          align: z.union([z.any(), z.null()]).default(null),
          children: z.any(),
          component: z.literal('Column').default('Column'),
          id: z.string(),
          justify: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          children: z.any(),
          columns: z.any(),
          component: z.literal('Grid').default('Grid'),
          gap: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          align: z.union([z.any(), z.null()]).default(null),
          children: z.any(),
          component: z.literal('List').default('List'),
          direction: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          listStyle: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          child: z.any(),
          component: z.literal('Frame').default('Frame'),
          description: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          title: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('Tabs').default('Tabs'),
          id: z.string(),
          tabs: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('Modal').default('Modal'),
          content: z.any(),
          id: z.string(),
          trigger: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          axis: z.union([z.any(), z.null()]).default(null),
          component: z.literal('Divider').default('Divider'),
          id: z.string(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          action: z.union([z.any(), z.null()]).default(null),
          checks: z.union([z.any(), z.null()]).default(null),
          child: z.any(),
          component: z.literal('Button').default('Button'),
          id: z.string(),
          isValid: z.union([z.any(), z.null()]).default(null),
          validationErrors: z.union([z.any(), z.null()]).default(null),
          variant: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          checks: z.union([z.any(), z.null()]).default(null),
          component: z.literal('CheckBox').default('CheckBox'),
          id: z.string(),
          isValid: z.union([z.any(), z.null()]).default(null),
          label: z.any(),
          validationErrors: z.union([z.any(), z.null()]).default(null),
          value: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          checks: z.union([z.any(), z.null()]).default(null),
          component: z.literal('TextField').default('TextField'),
          id: z.string(),
          isValid: z.union([z.any(), z.null()]).default(null),
          label: z.any(),
          validationErrors: z.union([z.any(), z.null()]).default(null),
          validationRegexp: z.union([z.any(), z.null()]).default(null),
          value: z.any(),
          variant: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          checks: z.union([z.any(), z.null()]).default(null),
          component: z.literal('ChoicePicker').default('ChoicePicker'),
          displayStyle: z.union([z.any(), z.null()]).default(null),
          filterable: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          isValid: z.union([z.any(), z.null()]).default(null),
          label: z.any(),
          options: z.any(),
          validationErrors: z.union([z.any(), z.null()]).default(null),
          value: z.any(),
          variant: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          checks: z.union([z.any(), z.null()]).default(null),
          component: z.literal('Slider').default('Slider'),
          id: z.string(),
          isValid: z.union([z.any(), z.null()]).default(null),
          label: z.any(),
          max: z.any(),
          min: z.any(),
          validationErrors: z.union([z.any(), z.null()]).default(null),
          value: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.status.v1').default('clio.status.v1'),
          detail: z.union([z.any(), z.null()]).default(null),
          elapsedMs: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          label: z.any(),
          state: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.metric.v1').default('clio.metric.v1'),
          detail: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          label: z.any(),
          trend: z.union([z.any(), z.null()]).default(null),
          unit: z.union([z.any(), z.null()]).default(null),
          value: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.progress.v1').default('clio.progress.v1'),
          detail: z.union([z.any(), z.null()]).default(null),
          id: z.string(),
          label: z.any(),
          max: z.union([z.any(), z.null()]).default(null),
          state: z.union([z.any(), z.null()]).default(null),
          value: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          action: z.union([z.any(), z.null()]).default(null),
          body: z.any(),
          component: z.literal('clio.callout.v1').default('clio.callout.v1'),
          id: z.string(),
          severity: z.any(),
          title: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          action: z.union([z.any(), z.null()]).default(null),
          columns: z.any(),
          component: z.literal('clio.data-table.v1').default('clio.data-table.v1'),
          id: z.string(),
          rows: z.any(),
          selection: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.time-series.v1').default('clio.time-series.v1'),
          dataUri: z
            .union([z.string().regex(new RegExp('^artifact://artifact_[A-Za-z0-9_-]+$')), z.null()])
            .default(null),
          id: z.string(),
          series: z
            .union([
              z
                .array(z.record(z.union([z.string(), z.number(), z.number().int(), z.null()])))
                .min(1)
                .max(10000),
              z.null(),
            ])
            .default(null),
          title: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.number(), z.null()]).default(null),
          xKey: z.string().min(1),
          yKeys: z.array(z.string().min(1)).min(1).max(5),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.mermaid.v1').default('clio.mermaid.v1'),
          id: z.string(),
          source: z.any(),
          title: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          action: z.union([z.any(), z.null()]).default(null),
          actionLabel: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.map.v1').default('clio.map.v1'),
          id: z.string(),
          points: z
            .array(
              z
                .object({
                  category: z.union([z.string().max(120), z.null()]).default(null),
                  detail: z.union([z.string().max(2000), z.null()]).default(null),
                  id: z.string().min(1).max(128),
                  label: z.string().min(1).max(240),
                  latitude: z.number().gte(-90).lte(90),
                  longitude: z.number().gte(-180).lte(180),
                })
                .strict(),
            )
            .min(1)
            .max(500),
          selected: z.union([z.string().max(128), z.null()]).default(null),
          title: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.number(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          action: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.workflow.v1').default('clio.workflow.v1'),
          edges: z
            .array(
              z
                .object({
                  label: z.union([z.string(), z.null()]).default(null),
                  source: z.string(),
                  target: z.string(),
                })
                .strict(),
            )
            .max(256),
          id: z.string(),
          nodes: z
            .array(
              z
                .object({
                  detail: z.union([z.string(), z.null()]).default(null),
                  id: z.string(),
                  label: z.string(),
                  state: z.union([z.string(), z.null()]).default(null),
                })
                .strict(),
            )
            .min(1)
            .max(128),
          selected: z.union([z.string(), z.null()]).default(null),
          weight: z.union([z.number(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          action: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.artifact.v1').default('clio.artifact.v1'),
          id: z.string(),
          mediaType: z.any(),
          name: z.any(),
          size: z.union([z.any(), z.null()]).default(null),
          uri: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          code: z.any(),
          component: z.literal('clio.code.v1').default('clio.code.v1'),
          id: z.string(),
          language: z.any(),
          title: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          action: z.union([z.any(), z.null()]).default(null),
          component: z.literal('clio.diff.v1').default('clio.diff.v1'),
          diff: z.any(),
          id: z.string(),
          path: z.any(),
          status: z.union([z.any(), z.null()]).default(null),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          actions: z.any(),
          body: z.any(),
          component: z.literal('clio.action-card.v1').default('clio.action-card.v1'),
          id: z.string(),
          severity: z.any(),
          title: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
      z
        .object({
          accessibility: z.union([z.any(), z.null()]).default(null),
          actions: z.any(),
          component: z.literal('clio.approval.v1').default('clio.approval.v1'),
          id: z.string(),
          reason: z.any(),
          risk: z.any(),
          title: z.any(),
          weight: z.union([z.any(), z.null()]).default(null),
        })
        .strict(),
    ];
    const errors = schemas.reduce<z.ZodError[]>(
      (errors, schema) =>
        ((result) => (result.error ? [...errors, result.error] : errors))(schema.safeParse(x)),
      [],
    );
    if (schemas.length - errors.length !== 1) {
      ctx.addIssue({
        path: ctx.path,
        code: 'invalid_union',
        unionErrors: errors,
        message: 'Invalid input: Should pass single schema',
      });
    }
  });
