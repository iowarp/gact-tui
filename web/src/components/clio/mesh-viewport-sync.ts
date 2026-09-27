/**
 * Client-side coordination between `clio.mesh-viewport.v1` instances that
 * share a `syncGroup`: one camera, one framing box, and one color range per
 * field, so two states of the same part are compared on the same terms.
 *
 * Nothing here reaches the agent or the data model; it is view state only.
 */

export interface MeshCameraState {
  position: [number, number, number];
  target: [number, number, number];
  up?: [number, number, number];
  /** Vertical field of view, degrees. */
  fov?: number;
  zoom?: number;
}

export interface MeshBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface MeshFieldRange {
  field: string;
  min: number;
  max: number;
}

export interface MeshSyncMember {
  readonly id: string;
  bounds?: MeshBounds;
  range?: MeshFieldRange;
  /** Apply a camera published by another member of the group. */
  applyCamera(state: MeshCameraState): void;
  /** Group bounds or ranges changed; recompute framing and coloring. */
  groupChanged(): void;
}

const groups = new Map<string, Set<MeshSyncMember>>();

export function joinMeshSyncGroup(group: string, member: MeshSyncMember): () => void {
  let members = groups.get(group);
  if (!members) {
    members = new Set();
    groups.set(group, members);
  }
  members.add(member);
  notify(group);
  return () => {
    const current = groups.get(group);
    if (!current) return;
    current.delete(member);
    if (current.size === 0) groups.delete(group);
    else notify(group);
  };
}

/** Re-announce a member whose bounds or range changed. */
export function updateMeshSyncMember(group: string): void {
  notify(group);
}

export function publishMeshCamera(group: string, from: MeshSyncMember, state: MeshCameraState) {
  for (const member of groups.get(group) ?? []) {
    if (member !== from) member.applyCamera(state);
  }
}

/** Union of every member's mesh bounds, so all members frame the same box. */
export function meshGroupBounds(group: string): MeshBounds | undefined {
  let union: MeshBounds | undefined;
  for (const member of groups.get(group) ?? []) {
    const bounds = member.bounds;
    if (!bounds) continue;
    union = union
      ? {
          min: [
            Math.min(union.min[0], bounds.min[0]),
            Math.min(union.min[1], bounds.min[1]),
            Math.min(union.min[2], bounds.min[2]),
          ],
          max: [
            Math.max(union.max[0], bounds.max[0]),
            Math.max(union.max[1], bounds.max[1]),
            Math.max(union.max[2], bounds.max[2]),
          ],
        }
      : { min: [...bounds.min], max: [...bounds.max] };
  }
  return union;
}

/**
 * The shared color range for `field`: the union of every member currently
 * showing that field, plus how many members contributed to it.
 */
export function meshGroupRange(
  group: string,
  field: string,
): { min: number; max: number; members: number } | undefined {
  let result: { min: number; max: number; members: number } | undefined;
  for (const member of groups.get(group) ?? []) {
    const range = member.range;
    if (!range || range.field !== field) continue;
    result = result
      ? {
          min: Math.min(result.min, range.min),
          max: Math.max(result.max, range.max),
          members: result.members + 1,
        }
      : { min: range.min, max: range.max, members: 1 };
  }
  return result;
}

function notify(group: string): void {
  for (const member of [...(groups.get(group) ?? [])]) member.groupChanged();
}
