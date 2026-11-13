import { t } from '@lingui/core/macro';
/** Explain settled empty data, query reduction, and selection support beside a chart. */
export function ChartDataNotice({
  note,
  empty,
  unlinkedSelection,
  param,
}: {
  note: string;
  empty: boolean;
  unlinkedSelection: boolean;
  param: string;
}) {
  return (
    <>
      {note ? <p className="py-2 text-xs text-muted-foreground">{note}</p> : null}
      {empty ? (
        <p className="py-2 text-sm text-muted-foreground">{t`No observations match this view.`}</p>
      ) : null}
      {unlinkedSelection ? (
        <p className="py-2 text-xs text-muted-foreground">
          {t`This chart has no “${param}” selection, so it neither follows nor shares the linked selection.`}
        </p>
      ) : null}
    </>
  );
}
