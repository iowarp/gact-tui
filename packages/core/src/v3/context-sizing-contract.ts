import { z } from 'zod';

/**
 * The context control CLIO hands a client: a number, a Max button and a
 * Fit-to-GPU selector. One wire shape serves both semantics:
 *
 * - `deployment`: a CLIO-managed model server; the value becomes its launch
 *   setting (vLLM `--max-model-len`, llama.cpp `--ctx-size`, Ollama `num_ctx`);
 * - `model`: a model CLIO binds but does not run; the value is CLIO's working
 *   context for it, bounded by the model's reported maximum.
 *
 * Fit to GPU is offered only when `fit_to_gpu.available`; otherwise a client
 * hides it (`reason` says why, for diagnostics only).
 */
export const contextChoiceSchema = z.enum(['number', 'max', 'fit_to_gpu']);

export const contextStrategyInfoSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().default(''),
});

export const fitToGpuSchema = z.object({
  available: z.boolean(),
  reason: z.string().default(''),
  strategy: z.string().default(''),
  strategies: z.array(contextStrategyInfoSchema).default([]),
  value: z
    .number()
    .nullish()
    .transform((value) => value ?? undefined),
});

const optionalNumber = z
  .number()
  .nullish()
  .transform((value) => value ?? undefined);

export const contextControlsSchema = z.object({
  semantics: z.enum(['deployment', 'model']),
  /** The model's own maximum (trained or reported); absent when unknown. */
  maximum: optionalNumber,
  maximum_reason: z.string().default(''),
  minimum: z.number().default(256),
  /** The context in force (or that will be), and how it was chosen. */
  current: optionalNumber,
  current_choice: contextChoiceSchema
    .nullish()
    .catch(undefined)
    .transform((value) => value ?? undefined),
  current_reason: z.string().default(''),
  fit_to_gpu: fitToGpuSchema,
});

/**
 * The context parameter's control as the catalog declares it for one engine on
 * one host (attached to that `ServerParameter` as `context_sizing`). The typed
 * number travels in the parameter itself (`param.<id>`); the choice, strategy
 * and GPU share under the configuration keys named here.
 */
export const contextSizingSpecSchema = z.object({
  choice_key: z.string().default('context.choice'),
  strategy_key: z.string().default('context.strategy'),
  share_key: z.string().default('context.gpu_share'),
  choices: z.array(contextChoiceSchema.catch('number')).default(['number', 'max', 'fit_to_gpu']),
  default_choice: contextChoiceSchema.catch('fit_to_gpu').default('fit_to_gpu'),
  default_strategy: z.string().default(''),
  strategies: z.array(contextStrategyInfoSchema).default([]),
  fit_to_gpu_available: z.boolean().default(false),
  fit_to_gpu_reason: z.string().default(''),
  preview_path: z.string().default(''),
});

/** Settled-configuration keys recording the context a deployment launched with. */
export const EFFECTIVE_CONTEXT_LENGTH_KEY = 'effective.context_length';
export const EFFECTIVE_CONTEXT_REASON_KEY = 'effective.context_reason';
export const EFFECTIVE_CONTEXT_CHOICE_KEY = 'effective.context_choice';

export type ContextChoice = z.infer<typeof contextChoiceSchema>;
export type ContextStrategyInfo = z.infer<typeof contextStrategyInfoSchema>;
export type FitToGpu = z.infer<typeof fitToGpuSchema>;
export type ContextControls = z.infer<typeof contextControlsSchema>;
export type ContextSizingSpec = z.infer<typeof contextSizingSpecSchema>;

/** Body of `POST /v1/infrastructure/services/{service}/context-sizing`. */
export interface ContextSizingPreviewInput {
  target_id: string;
  /** Empty: the installed deployment's variant. */
  variant_id?: string;
  configuration: Record<string, string>;
}

/** Body of `PUT /v1/providers/{provider}/working-context`. */
export interface WorkingContextInput {
  model: string;
  choice: 'max' | 'number';
  tokens?: number;
  api_base?: string;
}
