import type { PendingInteraction, PendingInteractionField } from '@clio/core/v3';

/** Relay's typed choices per ask and field: `_meta["io.iowarp.clio-relay/choice"][askId][field]`. */
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

/** The ids this ask may be filed under in relay's choice map: its request or elicitation id. */
function askIds(payload: unknown): Set<string> {
  const root = record(payload);
  const elicitation = record(record(root?.metadata)?.elicitation);
  return new Set(
    [root?.request_id, root?.elicitation_id, elicitation?.request_id, elicitation?.elicitation_id]
      .map(text)
      .filter((id): id is string => Boolean(id)),
  );
}

/**
 * A choice entry, under `[askId][field]` (one ask may hold two choices) or, from older
 * relays, `[askId]` directly.
 */
function entriesOf(ask: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(ask.options)) return [ask];
  return Object.values(ask)
    .map(record)
    .filter((entry): entry is Record<string, unknown> => Array.isArray(entry?.options));
}

function choiceFromMeta(payload: unknown, name: string): DeclaredChoice | undefined {
  const ids = askIds(payload);
  for (const meta of metaBlocks(payload)) {
    const asks = record(meta[CHOICE_META_KEY]);
    if (!asks) continue;
    // A task's merged map holds every open ask: prefer this one's own entry.
    const own = Object.entries(asks).filter(([id]) => ids.has(id));
    for (const [, value] of own.length ? own : Object.entries(asks)) {
      const ask = record(value);
      const entry = ask ? entriesOf(ask).find((item) => item.field === name) : undefined;
      if (!entry || !Array.isArray(entry.options)) continue;
      const options = entry.options
        .map(record)
        .filter((option): option is Record<string, unknown> =>
          Boolean(option && 'value' in option),
        );
      const flagged = options.find((option) => option.recommended === true)?.value;
      return {
        title: text(entry.title),
        options: options.map((option) => ({
          value: option.value,
          label: text(option.label),
          description: text(option.description),
        })),
        recommended: entry.recommended ?? flagged ?? undefined,
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
      // Marked only: a default would preselect it and close the choice as answered.
      // Relay sends its recommendation as the schema default too; that default is dropped.
      recommended: field.recommended ?? declared.recommended,
      default:
        declared.recommended !== undefined && Object.is(field.default, declared.recommended)
          ? undefined
          : field.default,
    };
  });
}
