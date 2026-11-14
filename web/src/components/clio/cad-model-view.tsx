import * as THREE from 'three';
import {
  Axis3dIcon,
  BoxIcon,
  ExpandIcon,
  FileBoxIcon,
  ImageIcon,
  LayersIcon,
  PentagonIcon,
  PrinterIcon,
  RulerDimensionLineIcon,
  RulerIcon,
  Rotate3dIcon,
  ScanIcon,
  SquareSplitVerticalIcon,
} from 'lucide-react';
import { useReducedMotionConfig } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { readThemeColor, resolveThemeColor, useThemeKey } from '@/theme/runtime';
import { plural, t, ph } from '@lingui/core/macro';
import { edgeColorForTheme } from './a2ui-mesh-view-state';
import { binaryStl, glbOf } from './cad-export';
import { explodeOffsets } from './cad-explode';
import { CadAxisGizmo } from './cad-gizmo';
import { useCadMeasure } from './cad-measure-state';
import { CadMeasureLabels, CadMeasurePanel } from './cad-measure-tool';
import { boxCenter, boxExtent, partFacts, unionBounds, unionBox, type Vec3 } from './cad-parts';
import { CadPartsList } from './cad-parts-panel';
import {
  footprint,
  plateAxes,
  plateBounds,
  plateCenter,
  plateOf,
  readPlateChoice,
  savePlateChoice,
  type PlateChoice,
} from './cad-plate';
import { useCanvasPointer } from './cad-pointer';
import { CadScene, UP_VECTORS, type PartFocus, type Projection } from './cad-scene';
import {
  axisIndex,
  clampSection,
  defaultSection,
  sectionOutline,
  sectionPlane,
  sectionRange,
  withAxis,
  type SectionAxis,
  type SectionState,
} from './cad-section';
import { CadToolColumn } from './cad-tool-panel';
import { CadExplodePanel, CadPlatePanel, CadSectionPanel, CadSelectionPanel } from './cad-tool-panels';
import { formatBox, readLengthUnit, saveLengthUnit, type LengthUnit } from './cad-units';
import { modelParts, partColors, standardViewFrame, upAxisOf, type StandardView } from './cad-view-model';
import { useFileViewerActions, type FileViewerAction } from './file-viewer-action-context';
import { useFileViewerFacts } from './file-viewer-facts';
import type { MeshFormat } from './mesh-viewport-formats';
import type { ParsedFeaMesh } from './mesh-viewport-mesh';
import { composeSnapshot } from './mesh-viewport-snapshot';
import { downloadBlob, downloadBytes } from './surface-export';
import { ToolbarAction, ViewerToolbarContent } from './viewer-toolbar';

const PALETTE_TOKENS = ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5'];
const EXPLODE_OPEN = 0.35;
const EXPLODE_MS = 420;

/** The theme's chart colours as linear RGB, the space three's vertex colours use. */
function themePalette(): [number, number, number][] {
  return PALETTE_TOKENS.map((token) => {
    const color = new THREE.Color().setStyle(resolveThemeColor(`var(${token})`));
    return [color.r, color.g, color.b];
  });
}

function stemOf(name: string) {
  return name.replace(/\.[^.]+$/u, '') || 'model';
}

/** Keys typed into a field or menu are theirs, not the view's shortcuts. */
function typing(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest('input, textarea, select, [role="combobox"], [role="menu"], [role="listbox"]'))
  );
}

/**
 * A parsed CAD model with the usual CAD tools: measure, section, exploded view, part
 * selection, a print-plate check, units, projection and an axis gizmo.
 */
export function CadModelView({ mesh, name, format }: { mesh: ParsedFeaMesh; name: string; format: MeshFormat }) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scene, setScene] = useState<CadScene>();
  const theme = useThemeKey();
  const reducedMotion = useReducedMotionConfig();
  const parts = useMemo(() => modelParts(mesh), [mesh]);
  const facts = useMemo(() => partFacts(mesh), [mesh]);
  const multipart = parts.length > 1;
  const up = upAxisOf(format);
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const [edges, setEdges] = useState(true);
  const [partsOpen, setPartsOpen] = useState(() => typeof window === 'undefined' || window.innerWidth >= 640);
  const [unit, setUnitState] = useState<LengthUnit>(readLengthUnit);
  const [projection, setProjection] = useState<Projection>('perspective');
  const [measureOpen, setMeasureOpen] = useState(false);
  const [section, setSection] = useState<SectionState>();
  const [explodeOpen, setExplodeOpen] = useState(false);
  const [explode, setExplodeState] = useState(0);
  const [plateOpen, setPlateOpen] = useState(false);
  const [plate, setPlateState] = useState<PlateChoice>(readPlateChoice);
  const [selectedState, setSelected] = useState<number>();
  const [focus, setFocus] = useState<PartFocus>('normal');
  const [cover, setCover] = useState(0);
  const selected = selectedState !== undefined && !hidden.has(selectedState) ? selectedState : undefined;

  // The palette follows the theme, so it is read again when the theme changes.
  const palette = useMemo(() => (theme ? themePalette() : themePalette()), [theme]);
  const colors = useMemo(() => partColors(mesh, palette), [mesh, palette]);
  const ink = useMemo(() => {
    void theme; // Read again for each theme.
    return {
      accent: readThemeColor('primary'),
      plateLine: readThemeColor('muted-foreground'),
      plateFill: readThemeColor('muted'),
      grid: readThemeColor('border'),
    };
  }, [theme]);

  const offsets = useMemo(
    () => explodeOffsets(facts, mesh.bounds, explode, UP_VECTORS[up]),
    [explode, facts, mesh.bounds, up],
  );
  const measure = useCadMeasure(scene, offsets);
  const shownPart = useCallback(
    (index: number) => !hidden.has(index) && (focus !== 'isolate' || selected === undefined || index === selected),
    [focus, hidden, selected],
  );
  // As modelled (what a slicer gets), and as drawn now (exploded): sizes read the first.
  const assembled = useMemo(() => unionBounds(facts, shownPart), [facts, shownPart]);
  const drawn = useMemo(() => unionBounds(facts, shownPart, offsets), [facts, offsets, shownPart]);
  const size = boxExtent(assembled ?? mesh.bounds);
  const sizeFact = formatBox(size, unit);
  const partsFact = multipart ? plural(parts.length, { one: '# part', other: '# parts' }) : '';
  useFileViewerFacts([sizeFact, partsFact].filter(Boolean));
  const sectionShown = section && drawn ? clampSection(section, drawn) : undefined;

  useEffect(() => {
    const container = canvasRef.current;
    if (!container) return;
    const created = new CadScene(container);
    setScene(created);
    return () => {
      setScene(undefined);
      created.dispose();
    };
  }, []);
  useEffect(() => {
    if (!scene) return;
    // A new model starts whole, framed from the isometric view.
    scene.setModel(mesh, colors, edgeColorForTheme());
    scene.frameIsometric(mesh.bounds, up);
    // Colours follow the theme through setColors below, not a rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, mesh, up]);
  useEffect(() => {
    scene?.setColors(colors, parts.map((part) => part.vertexStart));
    scene?.setEdgeColor(edgeColorForTheme());
  }, [scene, colors, parts]);
  useEffect(() => scene?.setHidden(hidden), [scene, hidden, mesh]);
  useEffect(() => scene?.setEdgesShown(edges), [scene, edges, mesh]);
  useEffect(() => scene?.setOffsets(offsets), [scene, offsets, mesh]);
  useEffect(() => scene?.setSelection(selected, focus, ink.accent), [scene, selected, focus, ink, mesh]);
  useEffect(() => scene?.setProjection(projection), [scene, projection]);
  useEffect(() => scene?.setViewInset(cover), [scene, cover]);
  useEffect(() => {
    if (!scene) return;
    if (!sectionShown || !drawn) return scene.setSection(undefined, ink.accent);
    const [x, y, z] = boxExtent(drawn);
    scene.setSection(
      {
        ...sectionPlane(sectionShown),
        corners: sectionOutline(sectionShown, drawn),
        center: boxCenter(drawn),
        size: Math.hypot(x, y, z) * 2 + 1,
      },
      ink.accent,
    );
  }, [scene, sectionShown?.axis, sectionShown?.position, sectionShown?.flipped, drawn, ink, mesh]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => scene?.overlays.setMeasurements(measure.shapes, measure.pendingPoint, ink.accent),
    [scene, measure.shapes, measure.pendingPoint, ink],
  );
  useEffect(() => scene?.requestRender(), [scene, measure.shapes, measure.pending]);
  const plateSpec = plateOf(plate);
  useEffect(() => {
    if (!scene) return;
    scene.overlays.setPlate(
      plateOpen && assembled
        ? { center: plateCenter(assembled, up), size: plateSpec.size, axes: plateAxes(up) }
        : undefined,
      { measure: ink.accent, ...ink },
    );
    scene.requestRender();
  }, [scene, plateOpen, assembled, plateSpec.size, up, ink]);
  // Opening the plate, or choosing another, frames the whole bed; closing it frames the model.
  const plateShown = useRef(false);
  const [plateW, plateD, plateH] = plateSpec.size;
  useEffect(() => {
    if (!scene || !assembled || !drawn) return;
    if (plateOpen) {
      const bed = plateBounds(plateCenter(assembled, up), [plateW, plateD, plateH], up);
      scene.fit(unionBox(bed, drawn));
    } else if (plateShown.current) scene.fit(drawn);
    plateShown.current = plateOpen;
    // Hiding a part or exploding keeps the camera where the person put it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, plateOpen, plateW, plateD, plateH, up]);

  // The exploded view eases open and shut, at once when motion is reduced.
  const animation = useRef(0);
  const explodeNow = useRef(explode);
  useEffect(() => {
    explodeNow.current = explode;
  }, [explode]);
  // Once the parts settle (opened, closed or a slider let go), the camera frames them.
  const frameExploded = useCallback(
    (amount: number) => {
      const bounds = unionBounds(facts, shownPart, explodeOffsets(facts, mesh.bounds, amount, UP_VECTORS[up]));
      if (scene && bounds) scene.fit(bounds);
    },
    [facts, mesh.bounds, scene, shownPart, up],
  );
  const explodeTo = useCallback(
    (target: number, animate = true) => {
      cancelAnimationFrame(animation.current);
      const from = explodeNow.current;
      if (!animate || reducedMotion) {
        setExplodeState(target);
        if (animate) frameExploded(target);
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - start) / EXPLODE_MS);
        setExplodeState(from + (target - from) * (1 - (1 - k) ** 3));
        if (k < 1) animation.current = requestAnimationFrame(step);
        else frameExploded(target);
      };
      animation.current = requestAnimationFrame(step);
    },
    [frameExploded, reducedMotion],
  );
  useEffect(() => () => cancelAnimationFrame(animation.current), []);

  const setUnit = (next: LengthUnit) => {
    setUnitState(next);
    saveLengthUnit(next);
  };
  const setPlate = (next: PlateChoice) => {
    setPlateState(next);
    savePlateChoice(next);
  };
  const toggleMeasure = useCallback(() => {
    setMeasureOpen((open) => {
      if (open) measure.cancel();
      return !open;
    });
  }, [measure]);
  const toggleSection = useCallback(() => {
    setSection((current) => {
      if (current || !drawn) return undefined;
      // The default cut runs through the model's long axis: across the narrower plan axis.
      const [w, d] = plateAxes(up);
      const extent = boxExtent(drawn);
      const index = extent[w]! <= extent[d]! ? w : d;
      // Keep the far half, so the cut faces the camera.
      const flipped = (scene?.viewDirection().getComponent(index) ?? 1) < 0;
      return { ...defaultSection(drawn, (['x', 'y', 'z'] as const)[index]!), flipped };
    });
  }, [drawn, scene, up]);
  const toggleExplode = useCallback(() => {
    if (explodeOpen) {
      setExplodeOpen(false);
      explodeTo(0);
    } else {
      setExplodeOpen(true);
      if (explodeNow.current === 0) explodeTo(EXPLODE_OPEN);
    }
  }, [explodeOpen, explodeTo]);

  const fitView = useCallback(() => {
    if (scene && drawn) scene.fit(drawn);
  }, [drawn, scene]);
  const look = (view: StandardView) => {
    if (!scene || !drawn) return;
    if (view === 'iso') return scene.frameIsometric(drawn, up);
    const frame = standardViewFrame(view, up);
    scene.frameFrom(drawn, new THREE.Vector3(...frame.direction), new THREE.Vector3(...frame.up));
  };
  const lookAlong = (axis: number, sign: 1 | -1) => {
    if (!scene || !drawn) return;
    // Clicking the side already in view looks from the opposite side, as a view cube does.
    const already = scene.viewDirection().getComponent(axis) * sign > 0.999;
    const direction = new THREE.Vector3().setComponent(axis, already ? -sign : sign);
    const upIndex = axisIndex(up);
    const screenUp =
      axis === upIndex ? standardViewFrame('top', up).up : (UP_VECTORS[up] as Vec3);
    scene.frameFrom(drawn, direction, new THREE.Vector3(...screenUp));
  };

  useCanvasPointer(canvasRef, {
    onHover: measureOpen ? measure.onHover : undefined,
    onClick: (point) => {
      if (measureOpen) return measure.onClick(point);
      setSelected(scene?.pick(point.x, point.y)?.part);
    },
  });
  useEffect(() => {
    if (!measureOpen) measure.onHover(undefined);
  }, [measureOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape is read before the page's own layers (a maximized canvas restores on Escape), so a
  // half-made measurement, the measuring mode or a selection is cancelled first, one per key.
  const viewRef = useRef<HTMLDivElement>(null);
  const escape = useRef<() => boolean>(() => false);
  useEffect(() => {
    escape.current = () => {
      if (measureOpen && measure.cancel()) return true;
      if (measureOpen) setMeasureOpen(false);
      else if (selected !== undefined) setSelected(undefined);
      else return false;
      return true;
    };
  });
  useEffect(() => {
    const onEscape = (event: globalThis.KeyboardEvent) => {
      const root = viewRef.current;
      if (event.key !== 'Escape' || event.defaultPrevented || !root) return;
      if (!(document.activeElement instanceof Node) || !root.contains(document.activeElement)) return;
      if (typing(document.activeElement) || !escape.current()) return;
      event.preventDefault();
    };
    window.addEventListener('keydown', onEscape, true);
    return () => window.removeEventListener('keydown', onEscape, true);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return;
    const key = event.key.toLowerCase();
    const actions: Record<string, () => void> = {
      m: toggleMeasure,
      s: toggleSection,
      f: fitView,
      ...(multipart ? { e: toggleExplode } : {}),
    };
    const action = actions[key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  const stem = stemOf(name);
  const savePicture = useCallback(async () => {
    if (!scene) return;
    downloadBlob(await composeSnapshot(scene.capture(), name, sizeFact, undefined), `${stem}.png`);
  }, [name, scene, sizeFact, stem]);
  const actions = useMemo<FileViewerAction[]>(() => {
    const rows: FileViewerAction[] = [];
    if (format !== 'stl')
      rows.push({
        label: t`STL (binary)`,
        description: t`Every part's triangles, for a slicer`,
        kind: 'download',
        icon: FileBoxIcon,
        onSelect: () => downloadBytes(binaryStl(mesh, stem), 'model/stl', `${stem}.stl`),
      });
    if (format !== 'glb')
      rows.push({
        label: t`GLB`,
        description: t`The parts with their names and colours, for other 3D viewers`,
        kind: 'download',
        icon: BoxIcon,
        onSelect: async () => downloadBytes(await glbOf(mesh, colors), 'model/gltf-binary', `${stem}.glb`),
      });
    rows.push({ label: t`PNG image of this view`, kind: 'download', icon: ImageIcon, onSelect: savePicture });
    rows.push({
      label: t`Print plate`,
      description: t`Whether the shown parts fit a printer`,
      kind: 'view',
      selected: plateOpen,
      icon: PrinterIcon,
      onSelect: () => setPlateOpen((open) => !open),
    });
    rows.push({
      label: t`Orthographic`,
      description: t`No perspective: parallel edges stay parallel`,
      kind: 'view',
      selected: projection === 'orthographic',
      icon: Axis3dIcon,
      onSelect: () => setProjection((value) => (value === 'orthographic' ? 'perspective' : 'orthographic')),
    });
    rows.push({
      label: t`Inches`,
      description: t`Read sizes and measurements in inches instead of millimetres`,
      kind: 'view',
      selected: unit === 'in',
      icon: RulerIcon,
      onSelect: () => setUnit(unit === 'in' ? 'mm' : 'in'),
    });
    rows.push({
      label: t`Show edges`,
      kind: 'view',
      selected: edges,
      icon: PentagonIcon,
      onSelect: () => setEdges((value) => !value),
    });
    if (multipart)
      rows.push({
        label: t`Parts list`,
        kind: 'view',
        selected: partsOpen,
        icon: LayersIcon,
        onSelect: () => setPartsOpen((value) => !value),
      });
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, edges, format, mesh, multipart, partsOpen, plateOpen, projection, savePicture, stem, unit]);
  useFileViewerActions(actions);

  const toggle = (index: number) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  const views: [StandardView, string][] = [
    ['iso', t`Isometric`],
    ['top', t`Top`],
    ['front', t`Front`],
    ['right', t`Right`],
  ];
  const selectedFacts = selected !== undefined ? facts[selected] : undefined;
  const anyPanel = measureOpen || Boolean(section) || explodeOpen || plateOpen || Boolean(selectedFacts);
  return (
    // The keys act on the view whichever of its controls has focus.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={viewRef}
      className="@container relative size-full min-h-0 overflow-hidden bg-muted/40"
      data-slot="cad-view"
      onKeyDown={onKeyDown}
    >
      <ViewerToolbarContent>
        <ToolbarAction aria-pressed={measureOpen} aria-keyshortcuts="M" hoverLabel={t`Measure (M)`} label={t`Measure`} onClick={toggleMeasure}>
          <RulerDimensionLineIcon aria-hidden="true" />
        </ToolbarAction>
        <ToolbarAction aria-pressed={Boolean(section)} aria-keyshortcuts="S" hoverLabel={t`Section (S)`} label={t`Section`} onClick={toggleSection}>
          <SquareSplitVerticalIcon aria-hidden="true" />
        </ToolbarAction>
        {multipart ? (
          <ToolbarAction aria-pressed={explodeOpen} aria-keyshortcuts="E" hoverLabel={t`Explode (E)`} label={t`Explode`} onClick={toggleExplode}>
            <ExpandIcon aria-hidden="true" />
          </ToolbarAction>
        ) : null}
        <ToolbarAction aria-keyshortcuts="F" hoverLabel={t`Fit to view (F)`} label={t`Fit to view`} onClick={fitView}>
          <ScanIcon aria-hidden="true" />
        </ToolbarAction>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarAction label={t`Standard views`}>
              <Rotate3dIcon aria-hidden="true" />
            </ToolbarAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {views.map(([view, label]) => (
              <DropdownMenuItem key={view} onSelect={() => look(view)}>
                {label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </ViewerToolbarContent>
      <div
        ref={canvasRef}
        aria-label={t`3D view of ${ph({ name })}, ${ph({ size: sizeFact })}. Drag to orbit, right-drag to pan, scroll or pinch to zoom. Click a part to select it. Keys: M measure, S section, E explode, F fit, Esc cancel.`}
        className={
          measureOpen
            ? 'absolute inset-0 cursor-crosshair focus-visible:outline-2 focus-visible:outline-ring'
            : 'absolute inset-0 cursor-grab focus-visible:outline-2 focus-visible:outline-ring active:cursor-grabbing'
        }
        data-slot="cad-canvas"
        onPointerDown={() => canvasRef.current?.focus({ preventScroll: true })}
        role="application"
        tabIndex={0}
      />
      {scene ? <CadMeasureLabels measure={measure} scene={scene} unit={unit} /> : null}
      {/* The frame bar folds its facts away when narrow; the size stays readable here. */}
      {anyPanel ? null : (
        <p
          className="pointer-events-none absolute bottom-2 left-2 rounded-sm bg-background/80 px-1.5 py-0.5 text-caption text-muted-foreground tabular-nums @2xl:hidden"
          data-slot="cad-size"
        >
          {sizeFact}
        </p>
      )}
      {multipart && partsOpen ? (
        <CadPartsList
          colors={colors}
          hidden={hidden}
          onSelect={setSelected}
          onShowAll={() => setHidden(new Set())}
          onToggle={toggle}
          parts={parts}
          selected={selected}
        />
      ) : null}
      {scene ? <CadAxisGizmo onLook={lookAlong} scene={scene} /> : null}
      {anyPanel ? (
        <CadToolColumn onCover={setCover}>
          {selectedFacts ? (
            <CadSelectionPanel
              focus={focus}
              multipart={multipart}
              onClose={() => setSelected(undefined)}
              onFocus={setFocus}
              part={selectedFacts}
              unit={unit}
            />
          ) : null}
          {measureOpen ? (
            <CadMeasurePanel measure={measure} onClose={toggleMeasure} unit={unit} />
          ) : null}
          {sectionShown && drawn ? (
            <CadSectionPanel
              onAxis={(axis: SectionAxis) => setSection(withAxis(sectionShown, axis, drawn))}
              onChange={setSection}
              onClose={() => setSection(undefined)}
              range={sectionRange(drawn, sectionShown.axis)}
              state={sectionShown}
              unit={unit}
            />
          ) : null}
          {explodeOpen ? (
            <CadExplodePanel
              amount={explode}
              onChange={(value) => explodeTo(value, false)}
              onCommit={frameExploded}
              onClose={toggleExplode}
            />
          ) : null}
          {plateOpen ? (
            <CadPlatePanel
              choice={plate}
              model={footprint(size, up)}
              onChoice={setPlate}
              onClose={() => setPlateOpen(false)}
              unit={unit}
            />
          ) : null}
        </CadToolColumn>
      ) : null}
    </div>
  );
}
