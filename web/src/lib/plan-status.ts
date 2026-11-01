const STATUS: Record<string, string> = {
  draft: 'Draft, in plan mode',
  approved: 'Approved, being worked on',
  done: 'Done',
  abandoned: 'Abandoned',
};

/** The plan's status in words (never only a colour). */
export function planStatusLabel(status: string): string {
  return STATUS[status] ?? status;
}
