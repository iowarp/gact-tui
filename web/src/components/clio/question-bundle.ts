import type { PendingInteraction } from '@clio/core/v3';

export interface BundleQuestion {
  id: string;
  question: string;
  allow_freeform: boolean;
  options: { label: string; value: string; description?: string }[];
}
const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/** Read native bundle metadata without changing MCP form semantics. */
export function bundleQuestions(interaction: PendingInteraction): BundleQuestion[] {
  const metadata = interaction.payload?.metadata;
  const bundle = record(metadata) ? metadata['question_bundle'] : undefined;
  if (!record(bundle) || !Array.isArray(bundle['questions'])) return [];
  return bundle['questions'].flatMap((question: unknown) => {
    if (
      !record(question) ||
      typeof question['id'] !== 'string' ||
      typeof question['question'] !== 'string'
    )
      return [];
    const options = Array.isArray(question['options'])
      ? question['options'].flatMap((option: unknown) => {
          if (
            !record(option) ||
            typeof option['label'] !== 'string' ||
            typeof option['value'] !== 'string'
          )
            return [];
          return [
            {
              label: option['label'],
              value: option['value'],
              description:
                typeof option['description'] === 'string' ? option['description'] : undefined,
            },
          ];
        })
      : [];
    return [
      {
        id: question['id'],
        question: question['question'],
        allow_freeform: question['allow_freeform'] === true,
        options,
      },
    ];
  });
}
