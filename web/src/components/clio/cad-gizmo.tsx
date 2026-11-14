import { ph, t } from '@lingui/core/macro';
import * as THREE from 'three';
import { useEffect, useState } from 'react';
import type { CadScene } from './cad-scene';

const SIZE = 76;
const RADIUS = 26;
const NAMES = ['X', 'Y', 'Z'] as const;

interface AxisEnd {
  axis: number;
  sign: 1 | -1;
  x: number;
  y: number;
  depth: number;
}

/** Where each axis end of the gizmo sits for the camera's orientation, back to front. */
function axisEnds(view: THREE.Quaternion): AxisEnd[] {
  const toView = view.clone().invert();
  const ends: AxisEnd[] = [];
  for (let axis = 0; axis < 3; axis += 1)
    for (const sign of [1, -1] as const) {
      const v = new THREE.Vector3().setComponent(axis, sign).applyQuaternion(toView);
      ends.push({
        axis,
        sign,
        x: Math.round((SIZE / 2 + v.x * RADIUS) * 10) / 10,
        y: Math.round((SIZE / 2 - v.y * RADIUS) * 10) / 10,
        depth: v.z,
      });
    }
  return ends.sort((a, b) => a.depth - b.depth);
}

/**
 * The axis gizmo: the model's axes as the camera sees them. Each end is a button that
 * looks at the model from that side, so +Z is the top view of a Z-up part.
 */
export function CadAxisGizmo({
  scene,
  onLook,
}: {
  scene: CadScene;
  onLook: (axis: number, sign: 1 | -1) => void;
}) {
  const [ends, setEnds] = useState(() => axisEnds(scene.viewQuaternion()));
  useEffect(() => {
    let last = '';
    return scene.subscribe(() => {
      const next = axisEnds(scene.viewQuaternion());
      const key = next.map((end) => `${end.x},${end.y}`).join(';');
      if (key !== last) {
        last = key;
        setEnds(next);
      }
    });
  }, [scene]);
  const center = SIZE / 2;
  return (
    <div
      aria-label={t`View from an axis`}
      className="absolute right-2 bottom-2 rounded-full bg-background/60 @max-2xl:top-2 @max-2xl:bottom-auto"
      data-slot="cad-gizmo"
      role="group"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg aria-hidden="true" className="absolute inset-0 text-muted-foreground" height={SIZE} width={SIZE}>
        {ends
          .filter((end) => end.sign === 1)
          .map((end) => (
            <line
              key={end.axis}
              stroke="currentColor"
              strokeWidth={1.5}
              x1={center}
              x2={end.x}
              y1={center}
              y2={end.y}
            />
          ))}
      </svg>
      {ends.map((end) => {
        const name = `${end.sign > 0 ? '+' : '−'}${NAMES[end.axis]}`;
        return (
          <button
            aria-label={t`View from ${ph({ axis: name })}`}
            className={
              end.sign > 0
                ? 'absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-foreground/40 bg-background text-[0.625rem] font-semibold text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
                : 'absolute flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-dashed border-muted-foreground/60 bg-background/80 text-[0.5rem] text-muted-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none'
            }
            key={name}
            onClick={() => onLook(end.axis, end.sign)}
            style={{ left: end.x, top: end.y }}
            title={t`View from ${ph({ axis: name })}`}
            type="button"
          >
            {end.sign > 0 ? NAMES[end.axis] : name}
          </button>
        );
      })}
    </div>
  );
}
