import type { PendingInteraction, PendingInteractionField } from '@clio/core/v3';

/** Relay's typed choices per ask: `_meta["io.iowarp.clio-relay/choice"][askId]`. */
export const CHOICE_META_KEY = 'io.iowarp.clio-relay/choice';

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

interface DeclaredChoice {
  title?: string;
  options: { value: unknown; label?: string; description?: string }[];
  recommended?: unknown;
}

/** The meta blocks an ask's producer may carry, in the order a job is read from. */
function metaBlocks(payload: unknown): Record<string, unknown>[] {
  const root = record(payload);
  const metadata = record(root?.metadata);
  const elicitation = record(metadata?.elicitation);
  return [
    elicitation?.meta,
    elicitation?._meta,
    root?.meta,
    root?._meta,
    metadata?.meta,
    metadata?._meta,
  ]
    .map(record)
    .filter((block): block is Record<string, unknown> => Boolean(block));
}

function choiceFromMeta(payload: unknown, name: string): DeclaredChoice | undefined {
  for (const meta of metaBlocks(payload)) {
    const asks = record(meta[CHOICE_META_KEY]);
    if (!asks) continue;
    for (const ask of Object.values(asks).map(record)) {
      if (!ask || ask.field !== name || !Array.isArray(ask.options)) continue;
      const options = ask.options
        .map(record)
        .filter((option): option is Record<string, unknown> =>
          Boolean(option && 'value' in option),
        );
      const flagged = options.find((option) => option.recommended === true)?.value;
      return {
        title: text(ask.title),
        options: options.map((option) => ({
          value: option.value,
          label: text(option.label),
          description: text(option.description),
        })),
        recommended: ask.recommended ?? flagged ?? undefined,
      };
    }
  }
  return undefined;
}

/** A JSON-Schema `oneOf` of titled constants, if the raw property reached the payload. */
function choiceFromSchema(payload: unknown, name: string): DeclaredChoice | undefined {
  const root = record(payload);
  const schema =
    record(root?.requested_schema) ??
    record(root?.requestedSchema) ??
    record(record(record(root?.metadata)?.elicitation)?.requested_schema);
  const property = record(record(schema?.properties)?.[name]);
  if (!property || !Array.isArray(property.oneOf)) return undefined;
  const options = property.oneOf
    .map(record)
    .filter((option): option is Record<string, unknown> => Boolean(option && 'const' in option))
    .map((option) => ({
      value: option.const,
      label: text(option.title),
      description: text(option.description),
    }));
  return options.length
    ? { title: text(property.title), options, recommended: property.default }
    : undefined;
}

/**
 * The ask's fields with every option its producer declared: labels, meanings and the
 * recommendation, from relay's typed `_meta` or a titled `oneOf`. A field the backend
 * projected without them (raw enum ids, or no enum at all) gains them here.
 */
export function withDeclaredChoices(
  interaction: Pick<PendingInteraction, 'payload'>,
  fields: readonly PendingInteractionField[],
): PendingInteractionField[] {
  return fields.map((field) => {
    const declared =
      choiceFromMeta(interaction.payload, field.name) ??
      choiceFromSchema(interaction.payload, field.name);
    if (!declared?.options.length) return field;
    const known = field.enum?.length
      ? declared.options.filter((option) =>
          field.enum!.some((value) => Object.is(value, option.value)),
        )
      : declared.options;
    if (known.length < 2) return field;
    return {
      ...field,
      title:
        field.title && field.title !== field.name ? field.title : (declared.title ?? field.title),
      enum: known.map((option) => option.value),
      enum_names: known.map((option) => {
        const original = field.enum?.findIndex((value) => Object.is(value, option.value)) ?? -1;
        return option.label ?? (original >= 0 ? field.enum_names?.[original] : undefined) ?? '';
      }),
      enum_descriptions: known.map((option) => option.description ?? ''),
      default:
        field.default !== undefined && field.default !== null
          ? field.default
          : declared.recommended,
    };
  });
}
