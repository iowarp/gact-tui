import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { t, ph, plural } from '@lingui/core/macro';
import { Button } from '@/components/ui/button';
import { readThemeColor } from '@/theme/runtime';
import { categoryColor } from './category-colors';
import { axisTicks } from './field-contours';
import { useCanvasSize } from './use-canvas-size';
import { LoadingFailure, LoadingFeedback } from './loading-feedback';
import {
  excludedList,
  groupProfiles,
  nearestProfile,
  profileExtents,
  profileRuns,
  type Profile,
} from './profile-stack-model';
import { parseSelectionState, type SelectionWriter } from './selection-state';
import { useTableQueryRows, type QueryRow, type TableDataQuery } from './table-query-rows';

export interface ProfileStackProps {
  componentId: string;
  title?: string;
  data?: QueryRow[];
  dataUri?: string;
  dataQuery?: TableDataQuery;
  profileField: string;
  verticalField: string;
  valueField: string;
  variables?: string[];
  overlayField?: string;
  labelField?: string;
  categoryField?: string;
  invertVertical: boolean;
  unit?: string;
  verticalUnit?: string;
  selection?: unknown;
  selectionField?: string;
  setSelection?: SelectionWriter;
  excluded?: unknown;
  writeExcluded?: (ids: string[]) => void;
  action?: () => void;
  actionLabel?: string;
  height?: number;
}

const MARGIN = { left: 52, right: 12, top: 12, bottom: 30 };

function drawProfiles(
  canvas: HTMLCanvasElement,
  profiles: readonly Profile[],
  options: {
    selected: ReadonlySet<string>;
    excluded: ReadonlySet<string>;
    down: boolean;
    extents: NonNullable<ReturnType<typeof profileExtents>>;
  },
): void {
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 360;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const context = canvas.getContext('2d');
  if (!context) return;
  context.scale(ratio, ratio);
  context.clearRect(0, 0, width, height);
  const plotW = width - MARGIN.left - MARGIN.right;
  const plotH = height - MARGIN.top - MARGIN.bottom;
  const [v0, v1] = options.extents.value;
  const [z0, z1] = options.extents.vertical;
  const x = (value: number) => MARGIN.left + ((value - v0) / (v1 - v0)) * plotW;
  const y = (z: number) =>
    options.down
      ? MARGIN.top + ((z - z0) / (z1 - z0)) * plotH
      : MARGIN.top + plotH - ((z - z0) / (z1 - z0)) * plotH;
  const muted = readThemeColor('muted-foreground');
  const primary = readThemeColor('primary');
  const line = (profile: Profile, values: (number | null)[], dashed: boolean) => {
    context.setLineDash(dashed ? [4, 3] : []);
    context.beginPath();
    for (const run of profileRuns(profile.vertical, values)) {
      run.forEach(([z, value], index) => {
        if (index) context.lineTo(x(value), y(z));
        else context.moveTo(x(value), y(z));
      });
      if (run.length === 1) context.lineTo(x(run[0]![1]) + 0.5, y(run[0]![0]));
    }
    context.stroke();
  };
  const order = [...profiles].sort(
    (a, b) => Number(options.selected.has(a.id)) - Number(options.selected.has(b.id)),
  );
  for (const profile of order) {
    const excluded = options.excluded.has(profile.id);
    const selected = options.selected.has(profile.id);
    context.globalAlpha = excluded ? 0.12 : selected ? 1 : profiles.length > 200 ? 0.25 : 0.6;
    context.strokeStyle = selected
      ? primary
      : profile.category
        ? categoryColor(profile.category)
        : muted;
    context.lineWidth = selected ? 2.5 : 1;
    line(profile, profile.value, false);
    if (profile.overlay.some((value) => value !== null)) line(profile, profile.overlay, true);
  }
  context.globalAlpha = 1;
  context.setLineDash([]);
  context.fillStyle = muted;
  context.font = '11px sans-serif';
  context.textAlign = 'center';
  for (const tick of axisTicks(v0, v1))
    context.fillText(
      tick.label,
      MARGIN.left + (plotW * (tick.value - v0)) / (v1 - v0),
      height - MARGIN.bottom + 14,
    );
  context.textAlign = 'right';
  for (const tick of axisTicks(z0, z1))
    context.fillText(tick.label, MARGIN.left - 6, y(tick.value) + 4);
}

/** How many excluded profiles are listed as chips before the rest are counted. */
const EXCLUDED_CHIPS = 12;

/**
 * `clio.profile-stack.v1`: many vertical profiles. Work on the curves: point to name one,
 * click to pick it, exclude or keep the picked one; find one by name; the excluded ones
 * are listed as chips to restore.
 */
export function ClioProfileStack(props: ProfileStackProps) {
  const [variable, setVariable] = useState(props.valueField);
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<string>();
  const [hover, setHover] = useState<Profile>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columns = useMemo(
    () =>
      [
        props.profileField,
        props.verticalField,
        variable,
        props.overlayField,
        props.labelField,
        props.categoryField,
      ].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index),
    [
      props.categoryField,
      props.labelField,
      props.overlayField,
      props.profileField,
      props.verticalField,
      variable,
    ],
  );
  const loaded = useTableQueryRows({
    columns,
    data: props.data,
    dataQuery: props.dataQuery,
    dataUri: props.dataUri,
  });
  const profiles = useMemo(
    () =>
      groupProfiles(loaded.rows ?? [], {
        profile: props.profileField,
        vertical: props.verticalField,
        value: variable,
        overlay: props.overlayField,
        label: props.labelField,
        category: props.categoryField,
      }),
    [
      loaded.rows,
      props.categoryField,
      props.labelField,
      props.overlayField,
      props.profileField,
      props.verticalField,
      variable,
    ],
  );
  const [localExcluded, setLocalExcluded] = useState<string[]>([]);
  const excluded = useMemo(
    () => new Set(props.writeExcluded ? excludedList(props.excluded) : localExcluded),
    [localExcluded, props.excluded, props.writeExcluded],
  );
  const bound = Boolean(props.setSelection && props.selectionField);
  const selected = useMemo(() => {
    if (!bound) return new Set(picked ? [picked] : []);
    const state = parseSelectionState(props.selection);
    return new Set(state ? state.values.map(String) : []);
  }, [bound, picked, props.selection]);
  const extents = useMemo(
    () =>
      profileExtents(profiles.filter((profile) => !excluded.has(profile.id))) ??
      profileExtents(profiles),
    [excluded, profiles],
  );
  const size = useCanvasSize(canvasRef, Boolean(extents && profiles.length));
  useEffect(() => {
    if (canvasRef.current && extents && size.width > 0)
      drawProfiles(canvasRef.current, profiles, {
        selected,
        excluded,
        down: props.invertVertical,
        extents,
      });
  }, [excluded, extents, profiles, props.invertVertical, selected, size]);

  const setExcluded = (next: string[]) =>
    props.writeExcluded ? props.writeExcluded(next) : setLocalExcluded(next);
  const select = (profile: Profile | undefined) => {
    setPicked(profile?.id);
    if (props.setSelection && props.selectionField)
      props.setSelection({
        field: props.selectionField,
        values: profile ? [profile.id] : [],
        source: props.componentId,
      } as never);
  };
  const locate = (event: MouseEvent<HTMLCanvasElement>) => {
    if (!extents) return undefined;
    const box = event.currentTarget.getBoundingClientRect();
    const fx = (event.clientX - box.left - MARGIN.left) / (box.width - MARGIN.left - MARGIN.right);
    const fyRaw =
      (event.clientY - box.top - MARGIN.top) / (box.height - MARGIN.top - MARGIN.bottom);
    const fy = props.invertVertical ? fyRaw : 1 - fyRaw;
    const value = extents.value[0] + fx * (extents.value[1] - extents.value[0]);
    const vertical = extents.vertical[0] + fy * (extents.vertical[1] - extents.vertical[0]);
    return nearestProfile(
      profiles.filter((profile) => !excluded.has(profile.id)),
      value,
      vertical,
      (extents.value[1] - extents.value[0]) * 0.03,
    );
  };
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  const focus = [...selected].map((id) => byId.get(id)).filter(Boolean) as Profile[];
  const excludedProfiles = [...excluded].map((id) => byId.get(id)).filter(Boolean) as Profile[];
  const find = (text: string) => {
    setFilter(text);
    const wanted = text.trim().toLowerCase();
    const match = wanted
      ? profiles.find((profile) => profile.label.toLowerCase() === wanted)
      : undefined;
    if (match) select(match);
  };
  const listId = `${props.componentId}-profiles`;
  const variables = props.variables ?? [];
  const heading = props.title ?? t`Profiles`;

  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-card p-3" aria-label={heading}>
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-medium">{heading}</h3>
        {variables.length > 1 ? (
          <label className="flex items-center gap-1 text-xs">
            {t`Variable`}
            <select
              className="rounded border bg-background px-1 py-0.5"
              value={variable}
              onChange={(event) => setVariable(event.target.value)}
            >
              {variables.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {props.action ? (
          <Button size="sm" onClick={props.action}>
            {props.actionLabel ?? t`Send to agent`}
          </Button>
        ) : null}
      </header>
      {loaded.loading ? <LoadingFeedback label={t`Reading profiles`} variant="skeleton" /> : null}
      {loaded.error ? (
        <LoadingFailure
          title={t`The profiles could not be read`}
          detail={loaded.error}
          onRetry={loaded.retry}
        />
      ) : null}
      {!loaded.loading && !loaded.error && !profiles.length ? (
        <p className="text-xs text-muted-foreground">{t`No profiles in this table.`}</p>
      ) : null}
      {profiles.length && extents ? (
        <div className="flex flex-col gap-2">
          <div className="relative min-w-0" style={{ height: props.height ?? 360 }}>
            <canvas
              ref={canvasRef}
              role="img"
              aria-label={t`${ph({ count: profiles.length })} profiles of ${ph({ variable })} against ${ph({ vertical: props.verticalField })}, ${ph({ excluded: excluded.size })} excluded`}
              className="absolute inset-0 size-full cursor-pointer"
              onPointerMove={(event) => setHover(locate(event))}
              onPointerLeave={() => setHover(undefined)}
              onClick={(event) => select(locate(event))}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t`${ph({ variable })} ${ph({ unit: props.unit ?? '' })} against ${ph({ vertical: props.verticalField })} ${ph({ verticalUnit: props.verticalUnit ?? '' })}`}
            {props.overlayField ? t`; dashed: ${ph({ overlay: props.overlayField })}` : ''}
            {hover ? (
              <span role="status" className="ml-2 text-foreground">
                {hover.label}
              </span>
            ) : null}
          </p>
          {loaded.note ? <p className="text-xs text-muted-foreground">{loaded.note}</p> : null}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="search"
              list={listId}
              className="w-44 rounded border bg-background px-2 py-1"
              placeholder={t`Find a profile`}
              aria-label={t`Find a profile`}
              value={filter}
              onChange={(event) => find(event.target.value)}
            />
            <datalist id={listId}>
              {profiles.slice(0, 2000).map((profile) => (
                <option key={profile.id} value={profile.label} />
              ))}
            </datalist>
            {focus.length === 1 ? (
              <span className="flex items-center gap-1" role="group" aria-label={t`Picked profile`}>
                <span className="font-medium text-primary">{focus[0]!.label}</span>
                {excluded.has(focus[0]!.id) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setExcluded([...excluded].filter((id) => id !== focus[0]!.id))}
                  >
                    {t`Keep`}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setExcluded([...new Set([...excluded, focus[0]!.id])].sort());
                      select(undefined);
                    }}
                  >
                    {t`Exclude`}
                  </Button>
                )}
              </span>
            ) : focus.length > 1 ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setExcluded([...new Set([...excluded, ...selected])].sort())}
              >
                {plural(focus.length, {
                  one: 'Exclude # picked profile',
                  other: 'Exclude # picked profiles',
                })}
              </Button>
            ) : (
              <span className="text-muted-foreground">{t`Click a curve to pick it.`}</span>
            )}
            <span className="ml-auto text-muted-foreground">
              {excluded.size
                ? t`${ph({ count: profiles.length })} profiles, ${ph({ excluded: excluded.size })} excluded`
                : plural(profiles.length, { one: '# profile', other: '# profiles' })}
            </span>
          </div>
          {excludedProfiles.length ? (
            <ul
              className="flex flex-wrap items-center gap-1 text-xs"
              aria-label={t`Excluded profiles`}
            >
              {excludedProfiles.slice(0, EXCLUDED_CHIPS).map((profile) => (
                <li key={profile.id}>
                  <button
                    type="button"
                    className="rounded-full border px-2 py-0.5 text-muted-foreground line-through hover:text-foreground hover:no-underline"
                    aria-label={t`Keep ${ph({ profile: profile.label })}`}
                    onClick={() => setExcluded([...excluded].filter((id) => id !== profile.id))}
                  >
                    {profile.label}
                  </button>
                </li>
              ))}
              {excludedProfiles.length > EXCLUDED_CHIPS ? (
                <li className="text-muted-foreground">
                  {t`and ${ph({ more: excludedProfiles.length - EXCLUDED_CHIPS })} more`}
                </li>
              ) : null}
              <li>
                <Button size="sm" variant="ghost" onClick={() => setExcluded([])}>
                  {t`Include all`}
                </Button>
              </li>
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
