import type { DashboardReport } from '@clio/core/v3';

type Component = Record<string, unknown>;

const isComponent = (value: unknown): value is Component =>
  typeof value === 'object' && value !== null && typeof (value as Component).id === 'string';

function childIds(component: Component): string[] {
  const ids: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string') ids.push(value);
  };
  add(component.child);
  add(component.content);
  const children = component.children;
  if (Array.isArray(children)) children.forEach(add);
  else if (
    typeof children === 'object' &&
    children !== null &&
    Array.isArray((children as { explicitList?: unknown }).explicitList)
  )
    (children as { explicitList: unknown[] }).explicitList.forEach(add);
  if (Array.isArray(component.tabs))
    for (const tab of component.tabs) add((tab as { child?: unknown } | null)?.child);
  return ids;
}

/** The authored components: the saved definition, else the pinned surface's updates. */
function dashboardComponents(report: DashboardReport): Component[] {
  const authored = report.definition.components;
  if (Array.isArray(authored)) return authored.filter(isComponent);
  return report.surface.messages.flatMap((message) => {
    const update = (message as { updateComponents?: { components?: unknown } }).updateComponents;
    return Array.isArray(update?.components) ? update.components.filter(isComponent) : [];
  });
}

/** How many tabs the dashboard's outermost Tabs holds; undefined without one. */
export function dashboardTabCount(report: DashboardReport): number | undefined {
  const components = dashboardComponents(report);
  const byId = new Map(components.map((component) => [component.id as string, component]));
  const queue = byId.has('root') ? ['root'] : [];
  const seen = new Set<string>();
  let tabs: Component | undefined;
  while (queue.length && !tabs) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const component = byId.get(id);
    if (!component) continue;
    if (component.component === 'Tabs') tabs = component;
    else queue.push(...childIds(component));
  }
  tabs ??= components.find((component) => component.component === 'Tabs');
  const count = Array.isArray(tabs?.tabs) ? tabs.tabs.length : 0;
  return count > 0 ? count : undefined;
}
