import {
  BotIcon,
  CheckIcon,
  ListIcon,
  MessageCircleQuestionIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from 'lucide-react';
import { plural, t } from '@lingui/core/macro';
import { RingSpinner } from '@/components/clio/primitives/ring-spinner';
import { truncate } from '@/lib/format';
import { formatLocale } from '@/lib/locale-format';
import type { RunRow } from '@/routes/runs-rows';

/** The runs page's wording: its filters, footer notes and the cancel confirmation. */

export const STATE_OPTIONS = [
  { value: 'all', label: t`All states`, icon: <ListIcon aria-hidden="true" /> },
  {
    value: 'active',
    label: t`Active`,
    icon: <RingSpinner className="size-[9px]" />,
  },
  {
    value: 'waiting_user',
    label: t`Waiting for you`,
    icon: <MessageCircleQuestionIcon aria-hidden="true" />,
  },
  { value: 'attention', label: t`Needs attention`, icon: <TriangleAlertIcon aria-hidden="true" /> },
  { value: 'completed', label: t`Completed`, icon: <CheckIcon aria-hidden="true" /> },
] as const;
/** The bar's execution-type chips; none chosen shows every type. */
export const SOURCE_CHIPS = [
  { value: 'agent_task', label: t`Agents`, icon: <BotIcon aria-hidden="true" /> },
  { value: 'mcp_task', label: t`Tools`, icon: <WrenchIcon aria-hidden="true" /> },
];

export function totalNote(total: number): string {
  return t`${total} in total. Search covers loaded runs.`;
}

/** "40 of 120 sessions indexed, 2 sessions could not be indexed", as one sentence. */
export function flowFooterNote(
  partial: boolean,
  indexed: number,
  total: number,
  failures: number,
): string | undefined {
  const progress = plural(total, {
    one: `${indexed} of # session indexed`,
    other: `${indexed} of # sessions indexed`,
  });
  const failed = plural(failures, {
    one: '# session could not be indexed',
    other: '# sessions could not be indexed',
  });
  const notes = [partial ? progress : '', failures > 0 ? failed : ''].filter(Boolean);
  return notes.length
    ? new Intl.ListFormat(formatLocale(), { style: 'short', type: 'unit' }).format(notes)
    : undefined;
}

export function cancelDescription(row: RunRow): string {
  const task = truncate(row.assignment || row.label, 240);
  return row.source === 'agent_task'
    ? t`${task}. This also cancels all descendant agents, downloads and shell processes.`
    : t`${task}. The owner will settle cancellation after required cleanup.`;
}
