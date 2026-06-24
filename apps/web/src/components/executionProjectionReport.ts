/**
 * Builds the report-node preview text for the execution-projection tree.
 */
import type { ProjectedExecutionNode } from './executionProjectionTypes.js';
import {
  imagePath,
  objectValue,
  parseJSON,
  stringValue,
} from './executionProjectionHelpers.js';

export function reportPreview(node: ProjectedExecutionNode): string {
  const structured = objectValue(node.structured);
  const workflow = objectValue(structured['workflow_state']);
  const state = objectValue(workflow[node.agent]);
  const source = Object.keys(state).length
    ? state
    : Object.keys(workflow).length
      ? workflow
      : objectValue(parseJSON(stripControlContracts(node.text ?? '')) ?? {});
  const acquisition = objectValue(source['acquisition']);
  const resource = objectValue(source['resource_candidate']);
  if (Object.keys(acquisition).length || Object.keys(resource).length) {
    return [
      stringValue(acquisition['status']) ? `acquisition ${stringValue(acquisition['status'])}` : '',
      stringValue(acquisition['metadata_path']),
      stringValue(acquisition['analysis_ready']) ? `analysis ready ${stringValue(acquisition['analysis_ready'])}` : '',
      stringValue(resource['resource_name']) || stringValue(resource['dataset_name']),
    ].filter(Boolean).join('\n');
  }
  const artifact = objectValue(source['artifact']);
  const plot = objectValue(source['plot']);
  const artifactSource = Object.keys(artifact).length ? artifact : plot;
  if (Object.keys(artifactSource).length) {
    const path = stringValue(artifactSource['path']) || stringValue(artifactSource['local_path']) || stringValue(artifactSource['output_path']) || stringValue(artifactSource['plot_path']) || stringValue(artifactSource['artifact_path']);
    return [
      stringValue(artifactSource['kind']) || stringValue(artifactSource['plot_type']) || stringValue(artifactSource['type']),
      path,
      imagePath(path) ? 'show full image' : '',
      Array.isArray(artifactSource['columns']) ? `columns ${artifactSource['columns'].join(', ')}` : '',
      stringValue(artifactSource['status']) ? `status ${stringValue(artifactSource['status'])}` : '',
    ].filter(Boolean).join('\n');
  }
  const rows = [
    stringValue(source['region_name']) || stringValue(source['display_name']) || stringValue(source['name']),
    stringValue(source['center_lat']) && stringValue(source['center_lon'])
      ? `center ${stringValue(source['center_lat'])}, ${stringValue(source['center_lon'])}`
      : '',
    stringValue(source['radius_km']) ? `radius ${stringValue(source['radius_km'])} km` : '',
    stringValue(source['confidence']) ? `confidence ${stringValue(source['confidence'])}` : '',
    stringValue(source['provenance']) ? `provenance ${stringValue(source['provenance'])}` : '',
  ].filter(Boolean);
  return rows.length ? rows.join('\n') : stripControlContracts(node.text ?? '');
}

export function retainedWorkflowStateFromText(text: string): Record<string, unknown> {
  for (const marker of [
    'Retained typed workflow state:',
    'CLIO durable typed workflow state:',
    'CLIO merged nested typed workflow state:',
    'CLIO typed workflow state:',
  ]) {
    const idx = text.toLowerCase().lastIndexOf(marker.toLowerCase());
    if (idx < 0) continue;
    const tail = text.slice(idx + marker.length);
    const brace = tail.indexOf('{');
    if (brace < 0) continue;
    return objectValue(parseJSON(tail.slice(brace)) ?? {});
  }
  return {};
}

export function structuredAgentTextPreview(text: string): string {
  const parsed = objectValue(parseJSON(text) ?? {});
  if (!Object.keys(parsed).some((key) => ['workflow_state', 'catalog', 'acquisition', 'resource_candidate', 'station_catalog', 'profile', 'artifact', 'plot'].includes(key))) {
    return text;
  }
  return reportPreview({ kind: 'report', agent: 'main', depth: 0, structured: parsed, text });
}

export function carriesArtifact(text: string): boolean {
  return /(\.png|\.jpe?g|\.gif|\.webp|plot|artifact|full image)/i.test(text);
}

export function stripControlContracts(text: string): string {
  return text
    .replace(/CLIO typed workflow state:\s*\n?[\s\S]*$/m, '')
    .replace(/CLIO durable typed workflow state:\s*\n?[\s\S]*$/m, '')
    .replace(/Retained typed workflow state:\s*\n?[\s\S]*$/m, '')
    .replace(/The workflow state is populated accordingly:\s*\n?[\s\S]*$/m, '')
    .replace(/The workflow state now records[\s\S]*$/m, '')
    .trim();
}

export function normalizeComparable(text: string): string {
  return stripControlContracts(text).toLowerCase().split(/\s+/).filter(Boolean).join(' ');
}

export function normalizeLooseComparable(text: string): string {
  return stripControlContracts(text).toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function textQualityScore(text: string): number {
  return text.trim().length + [...text].filter((ch) => ch === ' ' || ch === '\n' || ch === '\t').length * 2;
}
