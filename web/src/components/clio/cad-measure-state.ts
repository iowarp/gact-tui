import { ph, t } from '@lingui/core/macro';
import { useCallback, useMemo, useState } from 'react';
import {
  edgeChain,
  faceAngle,
  fitCircle,
  measureDistance,
  snapPoint,
  type CircleFit,
  type Distance,
  type SnapKind,
} from './cad-measure';
import type { Vec3 } from './cad-parts';
import type { CanvasPoint } from './cad-pointer';
import type { CadScene } from './cad-scene';
import type { MeasureShape } from './cad-scene-overlays';
import { formatAngle, formatLength, type LengthUnit } from './cad-units';

export type MeasureMode = 'distance' | 'radius' | 'angle';

export interface Measurement {
  id: string;
  mode: MeasureMode;
  points: Vec3[];
  snaps: SnapKind[];
  distance?: Distance;
  circle?: CircleFit;
  angle?: number;
}

interface Pending {
  point: Vec3;
  normal: Vec3;
  snap: SnapKind;
}

export interface MeasureHover {
  x: number;
  y: number;
  kind: SnapKind;
}

let nextId = 0;

export function snapName(kind: SnapKind): string {
  if (kind === 'vertex') return t`Vertex`;
  if (kind === 'edge') return t`Edge`;
  return t`Face`;
}

/** The measuring tool's state: picks with snapping, finished measurements and a notice. */
export function useCadMeasure(scene: CadScene | undefined) {
  const [mode, setModeState] = useState<MeasureMode>('distance');
  const [items, setItems] = useState<Measurement[]>([]);
  const [pending, setPending] = useState<Pending>();
  const [hover, setHover] = useState<MeasureHover>();
  const [notice, setNotice] = useState<string>();

  const snapAt = useCallback(
    ({ x, y, touch }: CanvasPoint) => {
      const pick = scene?.pick(x, y);
      if (!pick || !scene) return undefined;
      const snap = snapPoint({
        hit: pick.point,
        segments: pick.segments,
        project: (point) => scene.project(point),
        pointer: [x, y],
        radius: touch ? 18 : 10,
      });
      return { pick, snap };
    },
    [scene],
  );

  const onHover = useCallback(
    (point: CanvasPoint | undefined) => {
      const found = point && snapAt(point);
      if (!found || !scene) return setHover(undefined);
      const kind = mode === 'angle' ? 'face' : found.snap.kind;
      const at = kind === 'face' ? [point.x, point.y] : scene.project(found.snap.point);
      setHover(at ? { x: at[0]!, y: at[1]!, kind } : undefined);
    },
    [mode, scene, snapAt],
  );

  const onClick = useCallback(
    (point: CanvasPoint) => {
      const found = snapAt(point);
      if (!found) {
        setNotice(t`Nothing there to measure. Click on the model.`);
        return;
      }
      const { pick, snap } = found;
      setNotice(undefined);
      const id = `m${(nextId += 1)}`;
      if (mode === 'radius') {
        const circle =
          snap.kind !== 'face' && snap.segment !== undefined
            ? fitCircle(edgeChain(pick.segments, snap.segment))
            : undefined;
        if (!circle) {
          setNotice(
            snap.kind === 'face'
              ? t`Click a round edge, such as the rim of a hole.`
              : t`That edge is not round. Click a round edge, such as the rim of a hole.`,
          );
          return;
        }
        setItems((list) => [...list, { id, mode, points: [snap.point], snaps: [snap.kind], circle }]);
        return;
      }
      const next: Pending =
        mode === 'angle'
          ? { point: pick.point, normal: pick.normal, snap: 'face' }
          : { point: snap.point, normal: pick.normal, snap: snap.kind };
      if (!pending) return setPending(next);
      setPending(undefined);
      const points = [pending.point, next.point];
      const snaps = [pending.snap, next.snap];
      setItems((list) => [
        ...list,
        mode === 'angle'
          ? { id, mode, points, snaps, angle: faceAngle(pending.normal, next.normal) }
          : { id, mode, points, snaps, distance: measureDistance(pending.point, next.point) },
      ]);
    },
    [mode, pending, snapAt],
  );

  const setMode = useCallback((next: MeasureMode) => {
    setModeState(next);
    setPending(undefined);
    setNotice(undefined);
  }, []);

  /** Escape: drop a half-made measurement; returns whether there was one. */
  const cancel = useCallback(() => {
    if (!pending && !notice) return false;
    setPending(undefined);
    setNotice(undefined);
    return true;
  }, [notice, pending]);

  const remove = useCallback((id: string) => setItems((list) => list.filter((m) => m.id !== id)), []);
  const clear = useCallback(() => {
    setItems([]);
    setPending(undefined);
    setNotice(undefined);
  }, []);

  const shapes = useMemo<MeasureShape[]>(
    () => items.map(({ id, points, circle }) => ({ id, points, circle })),
    [items],
  );
  return { mode, setMode, items, pending, hover, notice, onHover, onClick, cancel, remove, clear, shapes };
}

export type CadMeasureState = ReturnType<typeof useCadMeasure>;

/** The value a measurement reads: a distance, a diameter and radius, or an angle. */
export function measurementText(item: Measurement, unit: LengthUnit): string {
  if (item.circle) {
    const diameter = formatLength(item.circle.radius * 2, unit);
    const radius = formatLength(item.circle.radius, unit);
    return t`Ø ${ph({ diameter })}, radius ${ph({ radius })}`;
  }
  if (item.angle !== undefined) return formatAngle(item.angle);
  return formatLength(item.distance?.distance ?? 0, unit);
}

