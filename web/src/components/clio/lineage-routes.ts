import {
  LINEAGE_MARGIN,
  LINEAGE_NODE_HEIGHT,
  roundedPath,
  type LineageGraphLayout,
} from './artifact-lineage-layout';

/** Where the reader dropped nodes, in graph units. */
export type LineagePins = Readonly<Record<string, { x: number; y: number }>>;

interface Deletable {
  delete(): void;
}
interface AvoidPoint {
  x: number;
  y: number;
}
interface AvoidEnum {
  value: number;
}
/** The part of libavoid's embind API the lineage uses. */
export interface AvoidApi {
  RouterFlag: { OrthogonalRouting: AvoidEnum };
  RoutingParameter: Record<
    'shapeBufferDistance' | 'idealNudgingDistance' | 'segmentPenalty',
    AvoidEnum
  >;
  RoutingOption: Record<
    'nudgeOrthogonalSegmentsConnectedToShapes' | 'nudgeSharedPathsWithCommonEndPoint',
    AvoidEnum
  >;
  Router: new (flags: number) => Deletable & {
    setRoutingParameter(parameter: AvoidEnum, value: number): void;
    setRoutingOption(option: AvoidEnum, value: boolean): void;
    processTransaction(): void;
  };
  Point: new (x: number, y: number) => AvoidPoint & Deletable;
  Rectangle: new (centre: AvoidPoint, width: number, height: number) => Deletable;
  ShapeRef: new (router: unknown, polygon: unknown) => unknown;
  ShapeConnectionPin: new (
    shape: unknown,
    classId: number,
    xOffset: number,
    yOffset: number,
    proportional: boolean,
    insideOffset: number,
    directions: number,
  ) => { setExclusive(exclusive: boolean): void };
  ConnEnd: new (shape: unknown, classId: number) => Deletable;
  ConnRef: new (
    router: unknown,
    source: unknown,
    target: unknown,
  ) => {
    displayRoute(): { size(): number; at(index: number): AvoidPoint };
  };
}

let avoid: Promise<AvoidApi> | undefined;

/** libavoid, loaded once on the first drop: only a moved lineage node needs it. */
function loadAvoid(): Promise<AvoidApi> {
  avoid ??= import('libavoid-js').then(async ({ AvoidLib }) => {
    // The package doesn't export its wasm, so the bundler finds it by path.
    await AvoidLib.load(
      new URL('../../../node_modules/libavoid-js/dist/libavoid.wasm', import.meta.url).href,
    );
    return AvoidLib.getInstance() as unknown as AvoidApi;
  });
  return avoid;
}

// libavoid's ConnDirFlags.
const FROM_RIGHT = 8;
const INTO_LEFT = 4;
const OUT = 1;
const IN = 2;

/**
 * The drawing with each dropped node pinned where the reader left it. Nodes keep
 * their places, and libavoid re-routes every edge in right angles around them,
 * spaced as ELK spaces them. Edges sharing an end merge into one trunk.
 */
export async function routeLineage(
  graph: LineageGraphLayout,
  pins: LineagePins,
  load: () => Promise<AvoidApi> = loadAvoid,
): Promise<LineageGraphLayout> {
  const nodes = graph.nodes.map((node) => {
    const pin = pins[node.id];
    return pin ? { ...node, x: Math.round(pin.x), y: Math.round(pin.y) } : node;
  });
  const Avoid = await load();
  const router = new Avoid.Router(Avoid.RouterFlag.OrthogonalRouting.value);
  // libavoid keeps referring to these until the router goes.
  const held: Deletable[] = [];
  const hold = <T extends Deletable>(value: T) => (held.push(value), value);
  try {
    // Less than half the compact column gap, or the pins of neighbouring columns can't see each other.
    router.setRoutingParameter(Avoid.RoutingParameter.shapeBufferDistance, 6);
    router.setRoutingParameter(Avoid.RoutingParameter.idealNudgingDistance, 8);
    router.setRoutingParameter(Avoid.RoutingParameter.segmentPenalty, 10);
    router.setRoutingOption(Avoid.RoutingOption.nudgeOrthogonalSegmentsConnectedToShapes, true);
    router.setRoutingOption(Avoid.RoutingOption.nudgeSharedPathsWithCommonEndPoint, false);
    const shapes = new Map(
      nodes.map((node) => {
        const centre = hold(
          new Avoid.Point(node.x + node.width / 2, node.y + LINEAGE_NODE_HEIGHT / 2),
        );
        const box = hold(new Avoid.Rectangle(centre, node.width, LINEAGE_NODE_HEIGHT));
        const shape = new Avoid.ShapeRef(router, box);
        // Every edge on a side shares its one pin, so they merge into a trunk.
        for (const [kind, x, side] of [
          [OUT, 1, FROM_RIGHT],
          [IN, 0, INTO_LEFT],
        ] as const)
          new Avoid.ShapeConnectionPin(shape, kind, x, 0.5, true, 0, side).setExclusive(false);
        return [node.id, shape];
      }),
    );
    const connectors = graph.edges.map((edge) => {
      const from = shapes.get(edge.from);
      const to = shapes.get(edge.to);
      if (!from || !to) return undefined;
      const source = hold(new Avoid.ConnEnd(from, OUT));
      return new Avoid.ConnRef(router, source, hold(new Avoid.ConnEnd(to, IN)));
    });
    router.processTransaction();
    const edges = graph.edges.map((edge, index) => {
      const route = connectors[index]?.displayRoute();
      if (!route) return { ...edge, path: '' };
      const points: AvoidPoint[] = [];
      for (let at = 0; at < route.size(); at++) {
        const point = route.at(at);
        points.push({ x: point.x, y: point.y });
      }
      return { ...edge, path: roundedPath(points) };
    });
    return {
      ...graph,
      nodes,
      edges,
      width: Math.ceil(Math.max(...nodes.map((node) => node.x + node.width)) + LINEAGE_MARGIN),
      height: Math.ceil(
        Math.max(...nodes.map((node) => node.y + LINEAGE_NODE_HEIGHT)) + LINEAGE_MARGIN,
      ),
    };
  } finally {
    // The router owns its shapes, pins and connectors.
    router.delete();
    for (const value of held) value.delete();
  }
}
