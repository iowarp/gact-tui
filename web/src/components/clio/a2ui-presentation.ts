const INPUT_COMPONENTS = new Set([
  'TextField',
  'TextArea',
  'Checkbox',
  'RadioGroup',
  'Select',
  'Slider',
  'DateTimeInput',
]);

const COMPONENT_KIND_LABELS = new Map([
  ['clio.time-series.v1', 'Chart'],
  ['clio.data-table.v1', 'Table'],
  ['clio.map.v1', 'Map'],
  ['clio.mermaid.v1', 'Diagram'],
  ['clio.code.v1', 'Code'],
  ['clio.artifact.v1', 'Artifact'],
  ['clio.metric.v1', 'Metrics'],
  ['clio.status.v1', 'Status'],
  ['clio.progress.v1', 'Status'],
]);

/** Stable transcript target used by provider-authored surface links. */
export function a2uiSurfaceDomId(surfaceId: string): string {
  return `a2ui-surface-${encodeURIComponent(surfaceId)}`;
}

/** Infer the dominant human-facing representation from A2UI update messages. */
export function a2uiSurfaceKind(messages: readonly unknown[]): string {
  const names = new Set<string>();
  for (const message of messages) {
    if (typeof message !== 'object' || message === null) continue;
    const update = Reflect.get(message, 'updateComponents');
    if (typeof update !== 'object' || update === null) continue;
    const components = Reflect.get(update, 'components');
    if (!Array.isArray(components)) continue;
    for (const component of components) {
      if (typeof component !== 'object' || component === null) continue;
      const name = Reflect.get(component, 'component');
      if (typeof name === 'string') names.add(name);
    }
  }
  if ([...INPUT_COMPONENTS].some((name) => names.has(name))) return 'Input';
  for (const [name, label] of COMPONENT_KIND_LABELS) {
    if (names.has(name)) return label;
  }
  if (names.has('Text')) return 'Text';
  return 'Interface';
}
