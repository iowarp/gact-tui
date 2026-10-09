import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import {
  behavior,
  compactionCheckpoint,
  observedAt,
  pendingSteer,
  providerCatalog,
  readyResource,
  sessionId,
  workspaceId,
} from './fixture-data.mjs';
import {
  a2uiCapabilities,
  a2uiCatalogRows,
  allExampleMessages,
  loginFormExampleMessages,
} from './a2ui-fixtures.mjs';
import {
  EARTHQUAKE_ROWS,
  earthquakeCsv,
  runEarthquakeTableQuery,
} from './a2ui-data-demo-fixture.mjs';
import { makeGalleryTerrainGlb } from './gallery-terrain.mjs';
import { createBranchArtifactFixture } from './branch-artifact-fixture.mjs';
import { createSessionSummaryFixture } from './session-summary-fixture.mjs';
import { createHtmlPreviewFixture } from './html-preview-fixture.mjs';

const port = Number.parseInt(process.env['CLIO_FIXTURE_PORT'] ?? '18799', 10);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new Error(`Invalid CLIO_FIXTURE_PORT: ${process.env['CLIO_FIXTURE_PORT'] ?? ''}`);
}
const streamMessageId = 'msg_stream';
const streamBlockId = 'block_stream';
let permissionPending = true;
let questionPending = true;
let questionTrayDemo = false;
let mcpV2UiDemo = false;
let a2uiMapDemo = false;
let a2uiDataDemo = false;
let a2uiAutoDemo = false;
let a2uiContinuousMapDemo = false;
let a2uiGeojsonDemo = false;
let a2uiBoxplotDemo = false;
let a2uiComposedDemo = false;
let a2uiMeshDemo = false;
let a2uiRasterDemo = false;
let meshDemoFormat = 'obj';
let meshDemoRevision = 1;
let attachmentsEnabled = false;
let mcpAppGeneration = 1;
let mcpAppToolCalls = 0;
let mcpAppModelContextUpdates = 0;
let mcpAppMessages = 0;
let mcpAppCloses = 0;
let resolvedInteractionIds = new Set();
let streamedText = '';
let streamStarted = false;
let transcriptActivityMessages = [];
let transcriptActivityTools = [];
let nextCursor = 1;
let queuedMessages = [];
const streamClients = new Set();
const artifactPng = readFileSync(new URL('../tests/fixtures/gallery-sample.png', import.meta.url));

const mcpAppHtml = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>V2 exerciser panel</title></head>
  <body style="font-family:system-ui;margin:0;padding:16px;background:#fff;color:#171717">
    <h2 style="font-size:16px;margin:0 0 8px">Evidence row inspector</h2>
    <p style="font-size:13px;margin:0 0 12px">Choose a row to send a structured tool action.</p>
    <button id="inspect" type="button">Inspect row 2</button>
    <output id="status" style="display:block;font-size:12px;margin-top:10px">Ready</output>
    <script>
      const send = (message) => parent.postMessage(message, '*');
      let initialized = false;
      addEventListener('message', (event) => {
        const message = event.data;
        if (!message || message.jsonrpc !== '2.0') return;
        if (message.id === 'initialize-fixture' && !initialized) {
          initialized = true;
          send({ jsonrpc: '2.0', method: 'ui/notifications/initialized', params: {} });
        }
      });
      document.querySelector('#inspect').addEventListener('click', () => {
        send({ jsonrpc: '2.0', id: 'context-fixture', method: 'ui/update-model-context', params: { selected_row: 2 } });
        send({ jsonrpc: '2.0', id: 'tool-fixture', method: 'tools/call', params: { name: 'inspect_row', arguments: { row: 2 } } });
        send({ jsonrpc: '2.0', id: 'message-fixture', method: 'ui/message', params: { role: 'user', content: [{ type: 'text', text: 'Inspect row 2' }] } });
        document.querySelector('#status').textContent = 'Action sent';
      });
      send({
        jsonrpc: '2.0',
        id: 'initialize-fixture',
        method: 'ui/initialize',
        params: {
          protocolVersion: '2026-01-26',
          appInfo: { name: 'V2 exerciser', version: '1.0.0' },
          appCapabilities: { availableDisplayModes: ['inline'] }
        }
      });
    </script>
  </body>
</html>`;

function mcpSandboxHtml() {
  return `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>MCP App sandbox</title></head>
  <body style="margin:0">
    <script>
      let appFrame;
      addEventListener('message', (event) => {
        const message = event.data;
        if (event.source === parent) {
          if (message?.method === 'ui/notifications/sandbox-resource-ready') {
            appFrame = document.createElement('iframe');
            appFrame.title = 'MCP App content';
            appFrame.sandbox = 'allow-scripts';
            appFrame.style.cssText = 'border:0;width:100%;height:300px;display:block';
            appFrame.srcdoc = message.params.html;
            document.body.replaceChildren(appFrame);
          } else {
            appFrame?.contentWindow?.postMessage(message, '*');
          }
          return;
        }
        if (appFrame && event.source === appFrame.contentWindow) {
          parent.postMessage(message, '*');
        }
      });
      parent.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/sandbox-proxy-ready', params: {} }, '*');
    </script>
  </body>
</html>`;
}

const capabilities = {
  contract_version: '0.2',
  gact_versions: ['0.3'],
  a2ui_versions: ['0.9.1'],
  replay: { supported: true, retention: 2048 },
  capabilities: {
    attachments: false,
    approvals: true,
    questions: true,
    files: true,
    context: true,
    a2ui: true,
  },
  degradations: [],
  model_catalog: { source: 'provider', observed_at: observedAt, stale: false },
  active_model: { provider_id: 'codex', model_id: 'gpt-5.6-luna', effort: 'medium' },
};

const workspace = {
  id: workspaceId,
  name: 'flat-NDP',
  display_name: 'flat-NDP',
  path: 'D:\\science\\campaigns\\flat-NDP',
  connection_id: 'fixture',
};

const session = {
  id: sessionId,
  workspace_id: workspaceId,
  title: 'EarthScope NDP evidence review',
  state: 'running',
  created_at: '2026-08-22T19:00:00.000Z',
  updated_at: observedAt,
  provider_id: 'codex',
  model_id: 'gpt-5.6-luna',
  effort: 'medium',
  agent_id: 'main',
};

const artifactRecord = {
  workspace_id: workspaceId,
  name: 'vertical-displacement.png',
  kind: 'image/png',
  latest_version: 1,
  head_artifact_id: 'artifact_plot',
  aliases: {},
  producing_session_ids: [sessionId],
  versions: [
    {
      artifact_id: 'artifact_plot',
      workspace_id: workspaceId,
      name: 'vertical-displacement.png',
      version: 1,
      kind: 'image/png',
      custody: 'fixture',
      mechanism: 'fixture_capture',
      evidence_class: 'test_owned',
      sha256: 'fixture-vertical-displacement-v1',
      size_bytes: artifactPng.length,
      created_at: observedAt,
      producer: { session_id: sessionId },
      uri: 'artifact://flat-ndp/vertical-displacement.png@v1',
      fetch_url: '/v1/artifacts/artifact_plot/bytes',
    },
  ],
};

const earthquakeArtifactId = 'artifact_earthquakes01';
const earthquakeArtifactUri = `artifact://${earthquakeArtifactId}`;
const earthquakeCsvBytes = Buffer.from(earthquakeCsv(), 'utf8');
const geojsonArtifactId = 'artifact_geojson_demo';
const geojsonDemo = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      id: 'west',
      properties: { name: 'Western region', group: 'Region', score: 42 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-121, 36],
            [-116, 36],
            [-116, 40],
            [-121, 40],
            [-121, 36],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'east',
      properties: { name: 'Eastern region', group: 'Region', score: 75 },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-114, 36],
            [-109, 36],
            [-109, 40],
            [-114, 40],
            [-114, 36],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'route',
      properties: { name: 'Cross-region route', group: 'Route', score: 55 },
      geometry: {
        type: 'LineString',
        coordinates: [
          [-119, 37],
          [-117, 38],
          [-112, 38],
          [-110, 39],
        ],
      },
    },
    {
      type: 'Feature',
      id: 'station',
      properties: { name: 'Field station', group: 'Site', score: 30 },
      geometry: { type: 'Point', coordinates: [-115, 35.5] },
    },
  ],
};
const geojsonDemoBytes = Buffer.from(JSON.stringify(geojsonDemo), 'utf8');

const earthquakeArtifactRecord = {
  workspace_id: workspaceId,
  name: 'earthquakes.csv',
  kind: 'text/csv',
  latest_version: 1,
  head_artifact_id: earthquakeArtifactId,
  aliases: {},
  producing_session_ids: [sessionId],
  versions: [
    {
      artifact_id: earthquakeArtifactId,
      workspace_id: workspaceId,
      name: 'earthquakes.csv',
      version: 1,
      kind: 'text/csv',
      custody: 'fixture',
      mechanism: 'fixture_capture',
      evidence_class: 'test_owned',
      sha256: 'fixture-earthquakes-v1',
      size_bytes: earthquakeCsvBytes.length,
      created_at: observedAt,
      producer: { session_id: sessionId },
      uri: 'artifact://flat-ndp/earthquakes.csv@v1',
      fetch_url: `/v1/artifacts/${earthquakeArtifactId}/bytes`,
    },
  ],
};

/**
 * One surface: a chart, a map, and a table all reading `EARTHQUAKE_ROWS`
 * through `earthquakeArtifactUri`, plus a metric — sharing one selection
 * path (`/selection/earthquakes`) keyed by `id`. Demonstrates issue #1533
 * phase 3's data-by-reference contract for map/table alongside the chart.
 */
function earthquakeDataSurface() {
  const surfaceId = 'surface_earthquake_data';
  const catalogId = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
  return {
    id: surfaceId,
    session_id: sessionId,
    run_id: 'run_earthquake_data',
    message_id: 'message_earthquake_data',
    part_id: 'part_earthquake_data',
    catalog_id: catalogId,
    protocol_version: '0.9.1',
    revision: 2,
    state: 'ready',
    message_revisions: [1, 2],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            { id: 'root', component: 'Column', children: ['metric', 'chart', 'map', 'table'] },
            {
              id: 'metric',
              component: 'clio.metric.v1',
              label: 'Events reviewed',
              value: EARTHQUAKE_ROWS.length,
              unit: 'events',
            },
            {
              id: 'chart',
              component: 'clio.chart.v1',
              title: 'Depth vs. magnitude',
              preset: 'scatter',
              xField: 'depth',
              yField: 'magnitude',
              entityField: 'id',
              colorField: 'place',
              selectionField: 'id',
              dataUri: earthquakeArtifactUri,
              selection: { path: '/selection/earthquakes' },
              accessibility: {
                label: 'Depth versus magnitude',
                description: `${EARTHQUAKE_ROWS.length} reviewed earthquakes`,
              },
            },
            {
              id: 'map',
              component: 'clio.map.v1',
              title: 'Epicenters',
              dataUri: earthquakeArtifactUri,
              latitudeField: 'lat',
              longitudeField: 'lon',
              labelField: 'id',
              idField: 'id',
              detailField: 'time',
              categoryField: 'place',
              selectionField: 'id',
              selection: { path: '/selection/earthquakes' },
              accessibility: {
                label: 'Epicenter map',
                description: `${EARTHQUAKE_ROWS.length} reviewed earthquake epicenters`,
              },
            },
            {
              id: 'table',
              component: 'clio.data-table.v1',
              dataUri: earthquakeArtifactUri,
              dataQuery: {
                columns: ['id', 'time', 'place', 'magnitude', 'depth'],
                // The agent's own base view: magnitude 2.0+ only. The viewer's
                // paging/sorting/filtering layers on top of this and never
                // drops it (a2ui-component-design skill, rule 1).
                filter: [{ column: 'magnitude', op: 'range', value: [2, null] }],
                sort: [{ column: 'magnitude', desc: true }],
              },
              selectionField: 'id',
              selection: { path: '/selection/earthquakes' },
              accessibility: {
                label: 'Earthquake table',
                description: 'Reviewed earthquakes, highest magnitude first',
              },
            },
          ],
        },
      },
    ],
  };
}

/** The same data without producer-authored selection wiring exercises the renderer's auto-link. */
function earthquakeAutoSelectionSurface() {
  const surface = earthquakeDataSurface();
  surface.id = 'surface_earthquake_auto_selection';
  surface.message_id = 'message_earthquake_auto_selection';
  surface.part_id = 'part_earthquake_auto_selection';
  surface.messages[0].createSurface.surfaceId = surface.id;
  surface.messages[1].updateComponents.surfaceId = surface.id;
  for (const component of surface.messages[1].updateComponents.components) {
    delete component.selection;
    delete component.selectionField;
    if (a2uiContinuousMapDemo && component.id === 'map') {
      delete component.categoryField;
      component.valueField = 'magnitude';
      component.valueUnit = 'Mw';
      component.title = 'Magnitude across epicenters';
    }
  }
  return surface;
}

function geojsonDemoSurface() {
  const surfaceId = 'surface_geojson_demo';
  const catalogId = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
  return {
    id: surfaceId,
    session_id: sessionId,
    run_id: 'run_geojson_demo',
    message_id: 'message_geojson_demo',
    part_id: 'part_geojson_demo',
    catalog_id: catalogId,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    message_revisions: [1, 1],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            { id: 'root', component: 'Column', children: ['map'] },
            {
              id: 'map',
              component: 'clio.map.v1',
              title: 'Regions, route and station',
              geojsonUri: `artifact://${geojsonArtifactId}`,
              labelField: 'name',
              categoryField: 'group',
            },
          ],
        },
      },
    ],
  };
}

function boxplotDemoSurface() {
  const surfaceId = 'surface_boxplot_demo';
  const catalogId = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
  const data = Array.from({ length: 24 }, (_, index) => ({
    id: `observation-${index + 1}`,
    country: ['Canada', 'Mexico', 'United States'][index % 3],
    latitude: 18 + (index % 3) * 10 + ((index * 7) % 9),
  }));
  return {
    id: surfaceId,
    session_id: sessionId,
    run_id: 'run_boxplot_demo',
    message_id: 'message_boxplot_demo',
    part_id: 'part_boxplot_demo',
    catalog_id: catalogId,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    message_revisions: [1, 1],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            { id: 'root', component: 'Column', children: ['chart'] },
            {
              id: 'chart',
              component: 'clio.chart.v1',
              title: 'Latitude by country',
              preset: 'boxplot',
              xField: 'country',
              yField: 'latitude',
              entityField: 'id',
              data,
            },
          ],
        },
      },
    ],
  };
}

function composedDemoSurface() {
  const surface = boxplotDemoSurface();
  const surfaceId = 'surface_composed_demo';
  surface.id = surfaceId;
  surface.message_id = 'message_composed_demo';
  surface.part_id = 'part_composed_demo';
  surface.messages[0].createSurface.surfaceId = surfaceId;
  surface.messages[1].updateComponents.surfaceId = surfaceId;
  const chart = surface.messages[1].updateComponents.components.find(
    (component) => component.id === 'chart',
  );
  const rows = chart.data;
  surface.messages[1].updateComponents.components = [
    { id: 'root', component: 'Frame', title: 'Latitude explorer', child: 'tabs' },
    {
      id: 'tabs',
      component: 'Tabs',
      tabs: [
        { title: 'Explore', child: 'grid' },
        { title: 'Rows', child: 'table' },
      ],
    },
    { id: 'grid', component: 'Grid', columns: 2, gap: 4, children: ['chart', 'map'] },
    chart,
    {
      id: 'map',
      component: 'clio.map.v1',
      title: 'Regions, route and station',
      geojsonUri: `artifact://${geojsonArtifactId}`,
      labelField: 'name',
      categoryField: 'group',
    },
    { id: 'table', component: 'clio.data-table.v1', columns: ['id', 'country', 'latitude'], rows },
  ];
  return surface;
}

const modelObjId = 'artifact_model_obj';
const modelMtlId = 'artifact_model_mtl';
const modelObjBytes = Buffer.from(
  'mtllib sample.mtl\no Pyramid\nv -1 0 -1\nv 1 0 -1\nv 1 0 1\nv -1 0 1\nv 0 1.8 0\nusemtl Blue\nf 1 2 5\nf 2 3 5\nf 3 4 5\nf 4 1 5\nf 1 4 3\nf 1 3 2\n',
);
const modelMtlBytes = Buffer.from('newmtl Blue\nKd 0.12 0.48 0.82\n');
const galleryTerrainGlb = makeGalleryTerrainGlb();
const triangleBin = Buffer.alloc(44);
new Float32Array(triangleBin.buffer, triangleBin.byteOffset, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
new Uint16Array(triangleBin.buffer, triangleBin.byteOffset + 36, 3).set([0, 1, 2]);
const triangleGltf = (uri) => ({
  asset: { version: '2.0' },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0 }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
  buffers: [{ byteLength: triangleBin.length, ...(uri ? { uri } : {}) }],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: 36 },
    { buffer: 0, byteOffset: 36, byteLength: 6 },
  ],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5123, count: 3, type: 'SCALAR' },
  ],
});
const triangleGlbJson = Buffer.from(JSON.stringify(triangleGltf()));
const triangleGlbJsonPadded = Buffer.concat([
  triangleGlbJson,
  Buffer.alloc((4 - (triangleGlbJson.length % 4)) % 4, 32),
]);
const triangleGlb = Buffer.alloc(12 + 8 + triangleGlbJsonPadded.length + 8 + triangleBin.length);
triangleGlb.write('glTF', 0);
triangleGlb.writeUInt32LE(2, 4);
triangleGlb.writeUInt32LE(triangleGlb.length, 8);
triangleGlb.writeUInt32LE(triangleGlbJsonPadded.length, 12);
triangleGlb.write('JSON', 16);
triangleGlbJsonPadded.copy(triangleGlb, 20);
const triangleGlbBinOffset = 20 + triangleGlbJsonPadded.length;
triangleGlb.writeUInt32LE(triangleBin.length, triangleGlbBinOffset);
triangleGlb.write('BIN\0', triangleGlbBinOffset + 4);
triangleBin.copy(triangleGlb, triangleGlbBinOffset + 8);
const modelTriangle = {
  // A self-contained triangle 3MF (the ZIP contains _rels/.rels and 3D/3dmodel.model).
  '3mf': Buffer.from(
    'UEsDBBQAAAAIAG6/QV2vG3e9sQAAAAIBAAALAAAAX3JlbHMvLnJlbHNlz0FqwzAQheGriNlXI8dQSrCcTQhkG5wDCHksi0oaISnBuX0JpdCQ7f/ggzccthjEnUr1nDR0UoGgZHn2yWm4TqePLziMw4WCaZ5TXX2uYoshVQ1ra3mPWO1K0VTJmdIWw8IlmlYlF4fZ2G/jCHdKfWL5b8CrKc6zhkJBgZgemd7s6G3hykuTliP2czTpthjbbsUnhzvV9ai6Z+eZAojJFEdNA/bHvyh/JxwHfDkz/gBQSwMEFAAAAAgAbr9BXbih+u/mAAAAkgEAABAAAAAzRC8zZG1vZGVsLm1vZGVsdY9NasMwEIWvImZfj+UQKEVSdj1BewBHnthT9BMk2Tg9fbBciDfdPAa+eW/mqcvqnVgoZY5Bg2xaEBRsHDiMGr6/Pt/e4WKUjwM5MQcuGjw7x54KJRCrdyFrmEq5fyBmO5Hvc+PZppjjrTQ2ejwNvg/zrbdlThxGtDERdq08Y9uBUYlynJOlbFS8/pAtggcNEkR53ElDvQxGecqTUQulwnV3m2gVq4YWxKPq76Z4RPJ/tLvkC+EruyTuw+iOo1hk9SxdNS0nDV11HXZx/xH3Gkbhodp1ZjcYxYW82Pnecov4Y1irmidQSwECFAAUAAAACABuv0Fdrxt3vbEAAAACAQAACwAAAAAAAAAAAAAAgAEAAAAAX3JlbHMvLnJlbHNQSwECFAAUAAAACABuv0FduKH67+YAAACSAQAAEAAAAAAAAAAAAAAAgAHaAAAAM0QvM2Rtb2RlbC5tb2RlbFBLBQYAAAAAAgACAHcAAADuAQAAAAA=',
    'base64',
  ),
  glb: triangleGlb,
  gltf: Buffer.from(
    JSON.stringify(
      triangleGltf(`data:application/octet-stream;base64,${triangleBin.toString('base64')}`),
    ),
  ),
  stl: Buffer.from(
    'solid Triangle\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid Triangle\n',
  ),
  ply: Buffer.from(
    'ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0\n1 0 0\n0 1 0\n3 0 1 2\n',
  ),
  vtk: Buffer.from(
    '# vtk DataFile Version 3.0\nTriangle\nASCII\nDATASET POLYDATA\nPOINTS 3 float\n0 0 0 1 0 0 0 1 0\nPOLYGONS 1 4\n3 0 1 2\n',
  ),
  vtp: Buffer.from(
    '<VTKFile type="PolyData"><PolyData><Piece NumberOfPoints="3" NumberOfPolys="1"><Points><DataArray format="ascii" NumberOfComponents="3">0 0 0 1 0 0 0 1 0</DataArray></Points><Polys><DataArray Name="connectivity" format="ascii">0 1 2</DataArray><DataArray Name="offsets" format="ascii">3</DataArray></Polys></Piece></PolyData></VTKFile>',
  ),
};

function meshDemoSurface() {
  const surfaceId = 'surface_mesh_demo';
  const catalogId = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
  return {
    id: surfaceId,
    session_id: sessionId,
    run_id: 'run_mesh_demo',
    message_id: 'message_mesh_demo',
    part_id: 'part_mesh_demo',
    catalog_id: catalogId,
    protocol_version: '0.9.1',
    revision: meshDemoRevision,
    state: 'ready',
    message_revisions: [1, meshDemoRevision],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            { id: 'root', component: 'Column', children: ['mesh'] },
            {
              id: 'mesh',
              component: 'clio.mesh-viewport.v1',
              title:
                meshDemoFormat === 'obj'
                  ? 'Pyramid model'
                  : `${meshDemoFormat.toUpperCase()} triangle`,
              meshUri: `artifact://${meshDemoFormat === 'obj' ? modelObjId : `artifact_model_${meshDemoFormat}`}`,
              format: meshDemoFormat,
              ...(meshDemoFormat === 'obj' ? { materialUri: `artifact://${modelMtlId}` } : {}),
            },
          ],
        },
      },
    ],
  };
}

const rasterArtifactId = 'artifact_raster_demo';

function rasterDemoSurface() {
  const surfaceId = 'surface_raster_demo';
  const catalogId = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
  return {
    id: surfaceId,
    session_id: sessionId,
    run_id: 'run_raster_demo',
    message_id: 'message_raster_demo',
    part_id: 'part_raster_demo',
    catalog_id: catalogId,
    protocol_version: '0.9.1',
    revision: 1,
    state: 'ready',
    message_revisions: [1, 1],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId,
          components: [
            { id: 'root', component: 'Column', children: ['raster'] },
            {
              id: 'raster',
              component: 'clio.raster-viewport.v1',
              title: 'Temperature field',
              rasterUri: `artifact://${rasterArtifactId}`,
              colormap: 'viridis',
              unit: '°C',
            },
          ],
        },
      },
    ],
  };
}

/** Resources the fixture holds, keyed by id: the seeded one plus any uploaded. */
let resources = new Map();

function seedResources() {
  resources = new Map([
    [readyResource.id, { record: { ...readyResource }, bytes: Buffer.alloc(0) }],
  ]);
}
seedResources();

/** Build one durable queued message using the explicit GACT 0.3 composer contract. */
function queuedMessage(id, text, position) {
  return {
    id,
    session_id: sessionId,
    revision: 1,
    position,
    parts: [{ type: 'text', text }],
    metadata: {},
    client_message_id: id,
    idempotency_key: id,
    behavior,
    model: { provider_id: 'codex', model_id: 'gpt-5.6-luna' },
    created_at: observedAt,
    updated_at: observedAt,
  };
}

/** Seed a compact stack long enough to exercise the queue's visual edge fade. */
function seedQueuedMessages() {
  queuedMessages = [
    queuedMessage('queue_current', 'Currently it renders as a static card.', 0),
    queuedMessage('queue_annotation_1', 'Review the first annotation.', 1),
    queuedMessage('queue_annotation_2', 'Review the second annotation.', 2),
    queuedMessage('queue_pdf', 'Check why the PDF viewer is always paged.', 3),
    queuedMessage('queue_annotation_3', 'Review the attachment processing semantics.', 4),
    queuedMessage('queue_annotation_4', 'Keep the queue compact while work continues.', 5),
  ];
}

/** Return a dense sanitized transcript with one active, always-mounted streaming turn. */
function transcriptMessages() {
  const compact = branchArtifacts.compactMessages();
  if (compact) return compact;
  const messages = Array.from({ length: 998 }, (_, index) => ({
    id: `msg_history_${String(index).padStart(4, '0')}`,
    session_id: sessionId,
    role: index % 2 === 0 ? 'user' : 'assistant',
    created_at: new Date(Date.parse('2026-08-22T18:00:00.000Z') + index * 1000).toISOString(),
    completed_at: new Date(Date.parse('2026-08-22T18:00:00.000Z') + index * 1000).toISOString(),
    blocks: [
      {
        id: `block_history_${String(index).padStart(4, '0')}`,
        type: 'text',
        text:
          index === 0
            ? 'Sanitized **evidence ledger** entry 1.'
            : `Sanitized evidence ledger entry ${index + 1}.`,
      },
    ],
  }));
  messages.push({
    id: 'msg_compaction_checkpoint',
    session_id: sessionId,
    role: 'assistant',
    created_at: '2026-08-22T19:59:57.000Z',
    completed_at: '2026-08-22T19:59:57.000Z',
    blocks: [compactionCheckpoint],
  });
  messages.push({
    id: 'msg_fixture_request',
    session_id: sessionId,
    role: 'user',
    created_at: '2026-08-22T19:59:58.000Z',
    completed_at: '2026-08-22T19:59:58.000Z',
    blocks: [
      {
        id: 'block_fixture_request',
        type: 'text',
        text: 'Review the EarthScope station evidence and keep provenance visible.',
      },
    ],
  });
  messages.push({
    id: streamMessageId,
    session_id: sessionId,
    role: 'assistant',
    created_at: '2026-08-22T19:59:59.000Z',
    completed_at: streamStarted && streamedText.includes('delta-99') ? observedAt : undefined,
    blocks: [
      {
        id: 'block_reasoning',
        type: 'reasoning',
        text: 'Compare station coverage, quality flags, and the derived displacement series.',
        streaming: false,
      },
      { id: 'block_tool', type: 'tool', tool_id: 'tool_earthscope' },
      ...(questionTrayDemo
        ? [{ id: 'block_fixture_question', type: 'tool', tool_id: 'tool_fixture_question' }]
        : []),
      { id: 'block_task', type: 'task', task_id: 'task_quality' },
      { id: 'block_subagent', type: 'subagent', subagent_id: 'subagent_station' },
      { id: 'block_artifact', type: 'artifact', artifact_id: 'artifact_plot' },
      ...(mcpV2UiDemo
        ? [
            {
              id: 'block_mcp_app_1',
              type: 'mcp_app',
              app_instance_id: 'app_fixture_1',
              data_ref: 'opaque-fixture-1',
              resource_uri: 'ui://v2ex/panel',
              source_server: 'MCP v2 exerciser',
              mime_type: 'text/html;profile=mcp-app',
              height: 300,
            },
            ...(mcpAppGeneration > 1
              ? [
                  {
                    id: 'block_mcp_app_2',
                    type: 'mcp_app',
                    app_instance_id: 'app_fixture_2',
                    data_ref: 'opaque-fixture-2',
                    resource_uri: 'ui://v2ex/panel',
                    source_server: 'Simulation viewer',
                    mime_type: 'text/html;profile=mcp-app',
                    height: 300,
                  },
                ]
              : []),
          ]
        : []),
      {
        id: streamBlockId,
        type: 'text',
        text: streamedText,
        streaming: !streamedText.includes('delta-99'),
      },
    ],
  });
  return [...messages, ...transcriptActivityMessages];
}

function mcpV2Interactions() {
  const interactions = [
    {
      id: 'question:form_fixture',
      kind: 'question',
      owner_session_id: sessionId,
      attended_session_id: sessionId,
      status: 'pending',
      title: 'Configure the evidence review',
      prompt: 'Choose how this evidence should be reviewed.',
      requires_human_response: true,
      audience: 'human',
      source: { protocol: 'mcp', tool_name: 'guarded_input', invocation_id: 'tool_earthscope' },
      created_at: observedAt,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'form',
        question_id: 'form_fixture',
        answer_metadata: {
          brief: 'NDP evidence',
          iterations: 3,
          method: 'table',
          provenance: true,
          views: ['coverage'],
        },
        fields: [
          {
            name: 'brief',
            type: 'string',
            title: 'Review brief',
            required: true,
            min_length: 3,
            max_length: 40,
          },
          { name: 'iterations', type: 'integer', title: 'Iterations', required: true, default: 3 },
          {
            name: 'method',
            type: 'string',
            title: 'Primary view',
            enum: ['table', 'plot'],
            enum_names: ['Station table', 'Displacement plot'],
            default: 'table',
          },
          { name: 'provenance', type: 'boolean', title: 'Keep provenance visible', default: true },
          {
            name: 'views',
            type: 'array',
            title: 'Supporting views',
            enum: ['coverage', 'quality', 'displacement'],
            enum_names: ['Coverage', 'Quality', 'Displacement'],
            multi: true,
            min_items: 1,
            max_items: 2,
            default: ['coverage'],
          },
        ],
      },
    },
    {
      id: 'question:url_fixture',
      kind: 'question',
      owner_session_id: sessionId,
      attended_session_id: sessionId,
      status: 'pending',
      title: 'Authorize the data source',
      prompt: 'Open the provider authorization page?',
      requires_human_response: true,
      audience: 'human',
      source: { protocol: 'mcp', tool_name: 'url_guarded_input' },
      created_at: observedAt,
      actions: ['answer', 'cancel'],
      payload: {
        mode: 'url',
        question_id: 'url_fixture',
        url: 'https://xn--nxasmq6b.mcp-clio.example.com/authorize',
        container: 'external',
        punycode_warning: true,
        punycode_host: 'ελληνικά.mcp-clio.example.com',
        punycode_host_raw: 'xn--nxasmq6b.mcp-clio.example.com',
      },
    },
    {
      id: 'question:agent_fixture',
      kind: 'question',
      owner_session_id: sessionId,
      attended_session_id: sessionId,
      status: 'pending',
      title: 'Agent-owned method check',
      prompt: 'Choose the station comparison method.',
      requires_human_response: false,
      audience: 'agent',
      routing_state: 'elicitation_routed_to_agent',
      source: {
        protocol: 'mcp',
        tool_name: 'agent_guarded_input',
        invocation_id: 'tool_earthscope',
      },
      created_at: observedAt,
      actions: [],
    },
    {
      id: 'question:answered_agent_fixture',
      kind: 'question',
      owner_session_id: sessionId,
      attended_session_id: sessionId,
      status: 'answered',
      title: 'Agent-owned completed check',
      requires_human_response: false,
      audience: 'agent',
      routing_state: 'elicitation_routed_to_agent',
      answered_by: 'agent',
      source: {
        protocol: 'mcp',
        tool_name: 'agent_guarded_input',
        invocation_id: 'tool_earthscope',
      },
      created_at: observedAt,
      actions: [],
    },
    {
      id: 'question:fallback_fixture',
      kind: 'question',
      owner_session_id: sessionId,
      attended_session_id: sessionId,
      status: 'pending',
      title: 'Confirm the fallback method',
      prompt: 'Which fallback should the review use?',
      requires_human_response: true,
      audience: 'human',
      routing_state: 'agent_elicitation_fallback_to_human',
      fallback_detail: 'agent_answer_timeout',
      source: {
        protocol: 'mcp',
        tool_name: 'agent_guarded_input',
        invocation_id: 'tool_earthscope',
      },
      created_at: observedAt,
      actions: ['answer', 'cancel'],
      payload: {
        question_kind: 'choice',
        options: [
          { label: 'Station table', value: 'table', description: 'Use sortable station evidence.' },
          { label: 'Displacement plot', value: 'plot', description: 'Use the derived series.' },
        ],
      },
    },
  ];
  return interactions.filter((interaction) => !resolvedInteractionIds.has(interaction.id));
}

function earthScopeMapSurface() {
  return {
    id: 'surface_earthscope_map',
    session_id: sessionId,
    run_id: 'run_earthscope_map',
    message_id: 'message_earthscope_map',
    part_id: 'part_earthscope_map',
    catalog_id: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
    protocol_version: '0.9.1',
    revision: 2,
    state: 'ready',
    message_revisions: [1, 2],
    messages: [
      {
        version: 'v0.9.1',
        createSurface: {
          surfaceId: 'surface_earthscope_map',
          catalogId: 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1',
        },
      },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: 'surface_earthscope_map',
          components: [
            { id: 'root', component: 'Column', children: ['map'] },
            {
              id: 'map',
              component: 'clio.map.v1',
              title: 'Five nearest observed EarthScope GNSS stations',
              accessibility: {
                label: 'Nearest EarthScope GNSS stations',
                description: 'Five observed stations near Palm Springs, California',
              },
              points: [
                {
                  id: 'PSAP',
                  label: '1. PSAP — 4.3195 km',
                  latitude: 33.823,
                  longitude: -116.549,
                  category: 'nearest',
                },
                {
                  id: 'SGPS',
                  label: '2. SGPS — 17.3602 km',
                  latitude: 33.744,
                  longitude: -116.71,
                  category: 'near',
                },
                {
                  id: 'COTD',
                  label: '3. COTD — 17.4931 km',
                  latitude: 33.732,
                  longitude: -116.386,
                  category: 'near',
                },
                {
                  id: 'DHLG',
                  label: '4. DHLG — 24.1020 km',
                  latitude: 33.9,
                  longitude: -116.73,
                  category: 'near',
                },
                {
                  id: 'P494',
                  label: '5. P494 — 31.8040 km',
                  latitude: 33.66,
                  longitude: -116.31,
                  category: 'near',
                },
              ],
            },
          ],
        },
      },
    ],
  };
}

function earthScopeMapInteractions() {
  return [
    {
      id: 'a2ui:sess_flat_ndp:surface_earthscope_map',
      kind: 'a2ui',
      owner_session_id: sessionId,
      attended_session_id: sessionId,
      status: 'pending',
      title: 'Choose an EarthScope station',
      prompt: 'Choose one observed station to continue.',
      requires_human_response: true,
      audience: 'human',
      source: { protocol: 'native', surface_id: 'surface_earthscope_map' },
      created_at: observedAt,
      actions: ['form.submit', 'cancel'],
      payload: { revision: 1 },
    },
  ].filter((interaction) => !resolvedInteractionIds.has(interaction.id));
}

// clio.chart.v1 demo surfaces (iowarp/clio-agent#1533 phase 1): the branch that
// added the chart kernel shipped no Playwright chart fixture, so these back the
// e2e smoke added alongside it. Both use the clio-workspace v1 catalog's
// scatter preset over INLINE `data` rows — no dataUri/artifact plumbing needed
// for a render/selection smoke.
const CHART_DEMO_CATALOG_ID = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
const CHART_DEMO_ROWS = [
  { run: 'alpha', t: 0, v: 1.2 },
  { run: 'alpha', t: 1, v: 2.6 },
  { run: 'alpha', t: 2, v: 1.9 },
  { run: 'beta', t: 0, v: 3.1 },
  { run: 'beta', t: 1, v: 2.2 },
  { run: 'beta', t: 2, v: 4.0 },
  { run: 'gamma', t: 0, v: 0.4 },
  { run: 'gamma', t: 1, v: 1.1 },
  { run: 'gamma', t: 2, v: 0.8 },
];

/** A lone clio.chart.v1 (scatter preset, inline data) — proves the kernel draws. */
function chartDemoMessages(legend = false) {
  return [
    {
      version: 'v0.9.1',
      createSurface: { surfaceId: 'surface_chart_demo', catalogId: CHART_DEMO_CATALOG_ID },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'surface_chart_demo',
        components: [
          { id: 'root', component: 'Column', children: ['chart'] },
          {
            id: 'chart',
            component: 'clio.chart.v1',
            title: 'Wave amplitude by run',
            ...(!legend ? { preset: 'scatter', xField: 't', yField: 'v', entityField: 'run' } : {}),
            ...(legend
              ? {
                  spec: {
                    mark: 'point',
                    config: { background: '#ffffff' },
                    encoding: {
                      x: { field: 't', type: 'quantitative' },
                      y: { field: 'v', type: 'quantitative' },
                      color: { field: 'run', type: 'nominal' },
                    },
                  },
                }
              : {}),
            data: CHART_DEMO_ROWS,
          },
        ],
      },
    },
  ];
}

/**
 * A clio.chart.v1 and a clio.data-table.v1 bound to the same `/selection/sel`
 * path. The e2e drives the selection from the TABLE side (a real DOM row
 * click) rather than a chart canvas pixel click, which is not a reliable
 * click target in headless Chromium — the write-then-broadcast wiring is the
 * same either way, since both components are bound to the one shared path.
 */
function linkedSelectionDemoMessages() {
  return [
    {
      version: 'v0.9.1',
      createSurface: {
        surfaceId: 'surface_linked_selection_demo',
        catalogId: CHART_DEMO_CATALOG_ID,
      },
    },
    {
      version: 'v0.9.1',
      updateComponents: {
        surfaceId: 'surface_linked_selection_demo',
        components: [
          { id: 'root', component: 'Column', children: ['chart', 'table'] },
          {
            id: 'chart',
            component: 'clio.chart.v1',
            title: 'Wave amplitude by run',
            preset: 'scatter',
            xField: 't',
            yField: 'v',
            entityField: 'run',
            data: CHART_DEMO_ROWS,
            selection: { path: '/selection/sel' },
          },
          {
            id: 'table',
            component: 'clio.data-table.v1',
            columns: ['run', 't', 'v'],
            rows: CHART_DEMO_ROWS,
            selection: { path: '/selection/sel' },
            // Required once `selection` is bound (#1533 data-by-reference:
            // `selectionField` names the column a bound selection reads and
            // writes). Matches the chart's own effective selection field
            // here, which falls back to its `entityField: 'run'` above, so
            // clicking a table row and the chart's own selection agree on
            // the same column.
            selectionField: 'run',
          },
        ],
      },
    },
  ];
}

/** Apply the CORS and version headers used by every fixture response. */
function commonHeaders(contentType = 'application/json') {
  return {
    'Access-Control-Allow-Headers':
      'Authorization, Content-Type, Last-Event-ID, Upload-Offset, X-A2UI-Version, X-GACT-Version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
    'Content-Type': contentType,
    'X-GACT-Version': '0.3',
  };
}

/** Send one JSON response with fixture-wide transport headers. */
function sendJson(response, body, status = 200) {
  response.writeHead(status, commonHeaders());
  response.end(JSON.stringify(body));
}

/** Read one bounded JSON request body from the local browser fixture. */
async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('fixture request body is too large');
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/**
 * How the service derives an envelope's `entity_id` from its payload, per
 * event family. Mirrored from the reference backend rather than hand-annotated
 * per call site, so the fixture cannot drift into naming an entity the service
 * would not name — `queued_message.reordered` carries a list and no id, and the
 * `stream.*` family has no entity at all.
 */
const ENTITY_KEYS_BY_FAMILY = {
  message: ['message_id', 'id'],
  pending_steer: ['message_id', 'id'],
  provider_catalog: ['catalog_id', 'id'],
  queued_message: ['queued_message_id', 'id'],
  resource: ['resource_id', 'id'],
  session: ['session_id'],
};

function entityIdFor(type, payload) {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined;
  const family = type.split('.')[0];
  for (const key of ENTITY_KEYS_BY_FAMILY[family] ?? ['id']) {
    const value = payload[key];
    if (value) return String(value);
  }
  return undefined;
}

/**
 * Build the canonical scoped GACT 0.3 envelope used by the SSE fixture.
 *
 * `entity_revision` is the service's own event sequence and rides on EVERY
 * frame, including the connection preamble; `entity_id` rides only where the
 * service can derive one. Both are what the recorded golden frames carry, and
 * the client's per-entity ordering guard reads them.
 */
function envelope(type, payload, revision) {
  const entityId = entityIdFor(type, payload);
  return {
    protocol_version: '0.3',
    type,
    occurred_at: new Date().toISOString(),
    scope: {
      connection_id: 'fixture',
      workspace_id: workspaceId,
      session_id: sessionId,
    },
    ...(entityId === undefined ? {} : { entity_id: entityId }),
    entity_revision: revision,
    payload,
  };
}

/** Publish one ordered event to every currently focused session stream. */
function publish(type, payload) {
  const cursor = nextCursor++;
  const frame = JSON.stringify(envelope(type, payload, cursor));
  const block = `id: ${cursor}\nevent: ${type}\ndata: ${frame}\n\n`;
  for (const client of streamClients) client.write(block);
}

const RESOURCE_PREFIX = `/v1/workspaces/${workspaceId}/resources/`;

/** The resource id one `/resources/{id}` path names, or undefined. */
function resourcePath(pathname) {
  if (!pathname.startsWith(RESOURCE_PREFIX)) return undefined;
  const rest = pathname.slice(RESOURCE_PREFIX.length);
  return rest.includes('/') ? undefined : decodeURIComponent(rest);
}

/** The resource id one `/resources/{id}/content` path names, or undefined. */
function resourceContentPath(pathname) {
  if (!pathname.startsWith(RESOURCE_PREFIX) || !pathname.endsWith('/content')) return undefined;
  const rest = pathname.slice(RESOURCE_PREFIX.length, -'/content'.length);
  return rest.includes('/') ? undefined : decodeURIComponent(rest);
}

/** Read one bounded raw request body. */
async function readBytes(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32 * 1024 * 1024) throw new Error('fixture upload body is too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Register one resource, resuming an upload the fixture already holds.
 *
 * `client_upload_id` is the client's own fingerprint of the file, so a repeated
 * create is an idempotent replay that reports how many bytes are already in
 * custody rather than starting a second resource.
 */
function createResource(body) {
  const existing = [...resources.values()].find(
    (entry) =>
      body.client_upload_id && entry.record.client_upload_id === String(body.client_upload_id),
  );
  if (existing)
    return {
      ...existing.record,
      idempotent_replay: true,
      upload_url: uploadUrl(existing.record.id),
    };
  const id = `res_upload_${resources.size + 1}`;
  const now = new Date().toISOString();
  const record = {
    id,
    workspace_id: workspaceId,
    client_upload_id: String(body.client_upload_id ?? ''),
    revision: 1,
    name: String(body.name ?? 'attachment'),
    claimed_mime: String(body.media_type ?? 'application/octet-stream'),
    detected_mime: '',
    detection_source: '',
    declared_size: Number(body.size ?? 0),
    received_size: 0,
    sha256: '',
    state: 'uploading',
    failure: '',
    created_at: now,
    updated_at: now,
    completed_at: '',
    mime_mismatch: false,
  };
  const entry = { record, bytes: Buffer.alloc(0) };
  resources.set(id, entry);
  publish('resource.created', record);
  // An empty file has no chunk to deliver, so custody registers it right away
  // rather than leaving the client polling an upload that can never advance.
  if (record.declared_size === 0) finalizeResource(entry);
  return { ...record, idempotent_replay: false, upload_url: uploadUrl(id) };
}

function uploadUrl(id) {
  return `/v1/workspaces/${workspaceId}/resources/${id}/content`;
}

/** Close one upload the way custody does: detect, hash, stamp, announce. */
function finalizeResource(entry) {
  const now = new Date().toISOString();
  entry.record.state = 'ready';
  entry.record.detected_mime = entry.record.claimed_mime;
  entry.record.detection_source = 'content_sniff';
  entry.record.sha256 = `fixture-${entry.record.id}-sha256`;
  entry.record.completed_at = now;
  entry.record.updated_at = now;
  publish('resource.ready', entry.record);
}

/** Run the test-owned 100-delta-per-second stream exactly once. */
function startHighRateStream() {
  if (streamStarted) return;
  streamStarted = true;
  let index = 0;
  const timer = setInterval(() => {
    const delta = `delta-${index} `;
    streamedText += delta;
    publish('message.block.delta', {
      message_id: streamMessageId,
      block_id: streamBlockId,
      delta,
    });
    index += 1;
    if (index < 100) return;
    clearInterval(timer);
    publish('message.block.completed', {
      message_id: streamMessageId,
      block_id: streamBlockId,
      text: streamedText,
    });
    publish('message.completed', {
      message_id: streamMessageId,
      completed_at: new Date().toISOString(),
    });
  }, 10);
}

const branchArtifacts = createBranchArtifactFixture({
  session, workspaceId, observedAt, transcriptMessages, readJson, sendJson, commonHeaders,
});

const sessionSummary = createSessionSummaryFixture({ sendJson, sessionId, workspaceId });
const htmlPreview = createHtmlPreviewFixture({ artifactRecord, sessionId, workspaceId, sendJson, commonHeaders });
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `127.0.0.1:${port}`}`);
  if (request.method === 'OPTIONS') {
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  if (request.method === 'POST' && url.pathname === '/__test/reset') {
    sessionSummary.reset();
    htmlPreview.reset();
    branchArtifacts.reset();
    session.state = 'running';
    session.updated_at = observedAt;
    permissionPending = true;
    questionPending = true;
    questionTrayDemo = false;
    mcpV2UiDemo = false;
    a2uiMapDemo = false;
    // Every spec shares this server: a demo left on by one spec file (the
    // linked earthquake surface) otherwise leaks into every spec after it.
    a2uiDataDemo = false;
    a2uiAutoDemo = false;
    a2uiContinuousMapDemo = false;
    a2uiGeojsonDemo = false;
    a2uiBoxplotDemo = false;
    a2uiComposedDemo = false;
    a2uiMeshDemo = false;
    a2uiRasterDemo = false;
    meshDemoFormat = 'obj';
    meshDemoRevision = 1;
    attachmentsEnabled = false;
    mcpAppGeneration = 1;
    mcpAppToolCalls = 0;
    mcpAppModelContextUpdates = 0;
    mcpAppMessages = 0;
    mcpAppCloses = 0;
    resolvedInteractionIds = new Set();
    streamedText = '';
    streamStarted = false;
    transcriptActivityMessages = [];
    transcriptActivityTools = [];
    nextCursor = 1;
    queuedMessages = [];
    seedResources();
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  if (await branchArtifacts.handle(request, response, url)) return;
  if (await sessionSummary.handle(request, response, url)) return;
  if (await htmlPreview.handle(request, response, url)) return;
  if (request.method === 'POST' && url.pathname === '/__test/session-failure-demo') {
    session.state = 'failed';
    session.updated_at = new Date().toISOString();
    sendJson(response, { state: session.state });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/attachments-demo') {
    attachmentsEnabled = true;
    sendJson(response, { status: 'ready' }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/mcp-v2-ui-demo') {
    mcpV2UiDemo = true;
    permissionPending = false;
    questionPending = false;
    sendJson(response, { status: 'ready' }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-map-demo') {
    const body = await readJson(request);
    a2uiMapDemo = body.enabled !== false;
    permissionPending = !a2uiMapDemo;
    questionPending = !a2uiMapDemo;
    resolvedInteractionIds = new Set();
    sendJson(response, { status: a2uiMapDemo ? 'ready' : 'disabled' }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-data-demo') {
    const body = await readJson(request);
    a2uiDataDemo = body.enabled !== false;
    permissionPending = !a2uiDataDemo;
    questionPending = !a2uiDataDemo;
    sendJson(response, { status: a2uiDataDemo ? 'ready' : 'disabled' }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/mcp-v2-ui-replace') {
    mcpAppGeneration = 2;
    sendJson(response, { status: 'replaced' }, 202);
    return;
  }

  if (request.method === 'GET' && url.pathname === '/__test/mcp-v2-ui-state') {
    sendJson(response, {
      tool_calls: mcpAppToolCalls,
      model_context_updates: mcpAppModelContextUpdates,
      messages: mcpAppMessages,
      closes: mcpAppCloses,
      resolved_interactions: [...resolvedInteractionIds],
    });
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/question-tray') {
    questionTrayDemo = true;
    questionPending = false;
    sendJson(response, { status: 'pending' }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/queue-demo') {
    seedQueuedMessages();
    sendJson(response, { queued_messages: queuedMessages }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/queue-append') {
    const message = queuedMessage(
      `queue_live_${queuedMessages.length}`,
      'New server update joined the queue.',
      queuedMessages.length,
    );
    queuedMessages.push(message);
    // The service publishes the row itself, not a wrapper — that is what gives
    // the envelope its `entity_id`.
    publish('queued_message.created', message);
    sendJson(response, { queued_message: message }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/start-stream') {
    startHighRateStream();
    sendJson(response, { status: 'started' }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/prepare-turn') {
    const { phase } = await readJson(request);
    if (phase === 'start') {
      publish('turn.started', { turn_id: 'run_preparation' });
      publish('message.upserted', {
        id: 'msg_preparation_user',
        session_id: sessionId,
        run_id: 'run_preparation',
        role: 'user',
        created_at: '2026-10-06T12:00:00Z',
        blocks: [
          { id: 'preparation_user_text', type: 'text', text: 'Summarize the station evidence.' },
        ],
      });
      publish('message.upserted', {
        id: 'msg_preparation_assistant',
        session_id: sessionId,
        run_id: 'run_preparation',
        role: 'assistant',
        created_at: '2026-10-06T12:00:01Z',
        blocks: [{ id: 'preparation_text', type: 'text', text: '', streaming: true }],
      });
    } else if (phase === 'token') {
      publish('message.block.delta', {
        message_id: 'msg_preparation_assistant',
        block_id: 'preparation_text',
        delta: 'Here is the evidence.',
      });
    } else {
      sendJson(response, { error: 'Unknown preparation phase' }, 400);
      return;
    }
    sendJson(response, { status: phase }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/transcript-activity') {
    const { phase } = await readJson(request);
    if (!['thinking', 'answer'].includes(phase)) {
      sendJson(response, { error: 'Unknown transcript activity phase' }, 400);
      return;
    }
    const thought = 'Read the fixture notes before preparing the report.';
    if (phase === 'answer' && !transcriptActivityMessages.length) {
      sendJson(response, { error: 'No transcript activity turn started' }, 400);
      return;
    }
    if (phase === 'thinking') {
      transcriptActivityTools = [];
      publish('turn.started', { turn_id: 'run_flat_activity' });
      const userMessage = {
        id: 'msg_flat_user',
        session_id: sessionId,
        run_id: 'run_flat_activity',
        role: 'user',
        created_at: '2026-10-06T12:00:00Z',
        blocks: [{ id: 'flat_user_text', type: 'text', text: 'Review this fictional fixture.' }],
      };
      transcriptActivityMessages = [userMessage];
      publish('message.upserted', userMessage);
      transcriptActivityTools.push({
        id: 'flat_read',
        session_id: sessionId,
        run_id: 'run_flat_activity',
        name: 'fs_read_file',
        title: 'Read',
        state: 'succeeded',
        input: { path: 'notes.md' },
        output: 'Complete fixture file contents.',
        presentation: {
          action: 'Read',
          summary: '61 lines',
          subject: 'file',
          blocks: [{ id: 'file', type: 'text', text: 'notes.md', label: 'notes.md' }],
        },
      });
      transcriptActivityTools.push({
        id: 'flat_run',
        session_id: sessionId,
        run_id: 'run_flat_activity',
        name: 'shell_bash',
        title: 'Run',
        state: 'failed',
        input: { command: 'python review.py' },
        error: 'Fixture command failed.',
        output: 'ModuleNotFoundError: fixture_package',
        presentation: {
          action: 'Run',
          summary: 'exit 1',
          subject: 'command',
          blocks: [
            { id: 'command', type: 'text', text: 'python review.py', label: 'python review.py' },
          ],
        },
      });
      for (const tool of transcriptActivityTools) publish('tool.upserted', tool);
    }
    const assistantMessage = {
      id: 'msg_flat_assistant',
      session_id: sessionId,
      run_id: 'run_flat_activity',
      role: 'assistant',
      created_at: '2026-10-06T12:00:01Z',
      ...(phase === 'answer'
        ? {
            completed_at: '2026-10-06T12:00:45Z',
            stop_reason: 'end_turn',
            usage: { input: 129000, output: 3000, cache_read: 0, cache_write: 0 },
            cost_usd: 0,
          }
        : {}),
      blocks: [
        {
          id: 'flat_reasoning',
          type: 'reasoning',
          provider_source: 'codex',
          text: thought,
          streaming: phase === 'thinking',
        },
        { id: 'flat_next', type: 'text', channel: 'next_thought', text: thought },
        { id: 'flat_read_part', type: 'tool', tool_id: 'flat_read' },
        { id: 'flat_run_part', type: 'tool', tool_id: 'flat_run' },
        ...(phase === 'answer'
          ? [
              {
                id: 'flat_answer',
                type: 'text',
                channel: 'answer',
                text: 'The fixture review is ready; one command failed.',
              },
            ]
          : []),
      ],
    };
    transcriptActivityMessages = [transcriptActivityMessages[0], assistantMessage];
    publish('message.upserted', assistantMessage);
    sendJson(response, { status: phase }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-login-form') {
    // Must match the `surfaceId` embedded in the vendored example's own
    // createSurface/updateComponents messages (loginFormExampleMessages()) —
    // the MessageProcessor keys its internal SurfaceModel off that embedded
    // id, not this envelope's `id`, so a mismatch here makes the processor
    // build a model under a different key and getSurface(surface.id) never
    // finds it (renders silently as nothing, no error).
    const surfaceId = 'gallery-login-form';
    const surface = {
      id: surfaceId,
      session_id: sessionId,
      catalog_id: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json',
      protocol_version: '0.9.1',
      revision: 1,
      state: 'ready',
      messages: loginFormExampleMessages(),
    };
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surfaceId }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-chart-demo') {
    const { legend = false } = await readJson(request);
    const surfaceId = 'surface_chart_demo';
    publish('a2ui.surface.upserted', {
      id: surfaceId,
      session_id: sessionId,
      catalog_id: CHART_DEMO_CATALOG_ID,
      protocol_version: '0.9.1',
      revision: 1,
      state: 'ready',
      messages: chartDemoMessages(legend),
    });
    sendJson(response, { status: 'published', surface_id: surfaceId }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-linked-selection-demo') {
    const surfaceId = 'surface_linked_selection_demo';
    publish('a2ui.surface.upserted', {
      id: surfaceId,
      session_id: sessionId,
      catalog_id: CHART_DEMO_CATALOG_ID,
      protocol_version: '0.9.1',
      revision: 1,
      state: 'ready',
      messages: linkedSelectionDemoMessages(),
    });
    sendJson(response, { status: 'published', surface_id: surfaceId }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-auto-selection-demo') {
    const surface = earthquakeAutoSelectionSurface();
    a2uiAutoDemo = true;
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surface.id }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-continuous-map-demo') {
    a2uiAutoDemo = true;
    a2uiContinuousMapDemo = true;
    const surface = earthquakeAutoSelectionSurface();
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surface.id }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-geojson-demo') {
    a2uiGeojsonDemo = true;
    const surface = geojsonDemoSurface();
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surface.id }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-boxplot-demo') {
    a2uiBoxplotDemo = true;
    const surface = boxplotDemoSurface();
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surface.id }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-composed-demo') {
    a2uiComposedDemo = true;
    const surface = composedDemoSurface();
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surface.id }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-mesh-demo') {
    meshDemoFormat = Object.hasOwn(modelTriangle, url.searchParams.get('format'))
      ? url.searchParams.get('format')
      : 'obj';
    meshDemoRevision += 1;
    a2uiMeshDemo = true;
    const surface = meshDemoSurface();
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surface.id }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-raster-demo') {
    a2uiRasterDemo = true;
    const surface = rasterDemoSurface();
    publish('a2ui.surface.upserted', surface);
    sendJson(response, { status: 'published', surface_id: surface.id }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === `/v1/sessions/${sessionId}/a2ui/actions`) {
    // Only acknowledges receipt (the `isPending` mutation this resolves is
    // what gates the surface header's optimistic "Sending action" label,
    // S8 gact-tui#409 item 2) — the S5 lifecycle events a real dispatcher
    // would publish off the back of this are published explicitly by the
    // test via /__test/a2ui-action-lifecycle, for deterministic ordering.
    // The short delay keeps the mutation observably pending for that test.
    await readJson(request);
    await new Promise((resolve) => setTimeout(resolve, 250));
    sendJson(response, { status: 'accepted' }, 202);
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-corpus') {
    // Publishes all 43 vendored Basic-catalog examples as detached surfaces
    // (no owning message, same as /__test/a2ui-login-form) — the desktop JS
    // smoke (S8 gact-tui#409 item 3) drives this to prove the packaged
    // bundle renders the whole official corpus, not just one example. Each
    // surface's `id`/`catalog_id` come from its own vendored createSurface
    // message, exactly like the single-example handler above.
    const examples = allExampleMessages();
    const surfaceIds = [];
    for (const example of examples) {
      const first = example.messages[0];
      const surfaceId = first?.createSurface?.surfaceId;
      const catalogId = first?.createSurface?.catalogId;
      if (!surfaceId || !catalogId) continue;
      surfaceIds.push(surfaceId);
      publish('a2ui.surface.upserted', {
        id: surfaceId,
        session_id: sessionId,
        catalog_id: catalogId,
        protocol_version: '0.9.1',
        revision: 1,
        state: 'ready',
        messages: example.messages,
      });
    }
    sendJson(
      response,
      { status: 'published', count: surfaceIds.length, surface_ids: surfaceIds },
      202,
    );
    return;
  }

  if (request.method === 'POST' && url.pathname === '/__test/a2ui-action-lifecycle') {
    // Publishes one `a2ui.action.<status>` server-truth lifecycle event
    // (dispatcher slice S5) for the footer e2e (S8 gact-tui#409 item 2):
    // `{surface_id, action_name, status, reason?, source_component_id?,
    // action_id?, state?, delivery?}` — `status` selects the event name,
    // everything else rides through as the payload verbatim.
    const { status, ...payload } = await readJson(request);
    if (typeof status !== 'string' || !status) {
      sendJson(response, { error: 'status is required' }, 400);
      return;
    }
    publish(`a2ui.action.${status}`, payload);
    sendJson(response, { status: 'published' }, 202);
    return;
  }

  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/a2ui/catalogs`) {
    sendJson(response, { catalogs: a2uiCatalogRows() });
    return;
  }

  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/a2ui/capabilities`) {
    sendJson(response, a2uiCapabilities());
    return;
  }

  if (request.method === 'GET' && url.pathname === '/v1/capabilities') {
    sendJson(response, {
      ...capabilities,
      capabilities: {
        ...capabilities.capabilities,
        ...(mcpV2UiDemo || a2uiMapDemo || questionTrayDemo ? { x_clio_interactions: true } : {}),
        ...(attachmentsEnabled ? { x_clio_resources: { enabled: true } } : {}),
      },
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/system/latest-release') {
    sendJson(response, {
      version: '0.0.0',
      source: 'fixture',
      checked_at: '2026-01-01T00:00:00Z',
      degradation: null,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/desktop/attach') {
    // A current CLIO's attach check (clio-agent#1478). This fixture enforces no
    // bearer token, so a desktop attaching without one is told it may proceed.
    // It publishes no credential record: that file lives in the machine's CLIO
    // state dir, which a fixture must not write.
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/health') {
    sendJson(response, {
      healthy: true,
      uptime_s: 1,
      overall_status: 'healthy',
      integrations: [],
      tool_hooks_installed: true,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/relay/status') {
    sendJson(response, {
      configured: false,
      configuration_scope: 'none',
      can_manage: false,
      reachable: false,
      checked_at: observedAt,
      reason: 'Not configured for this test-owned fixture.',
      details: {},
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/mcp/servers') {
    sendJson(response, { servers: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/commands') {
    sendJson(response, { commands: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/provenance/providers') {
    sendJson(response, {
      schema_version: '1.0',
      default_provider: 'native',
      providers: [
        {
          name: 'native',
          configured: false,
          queryable: false,
          durable: false,
          status: 'unavailable',
          source: 'test-owned fixture',
          health: { status: 'unavailable' },
        },
      ],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/workspaces') {
    sendJson(response, { workspaces: [workspace] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/sessions') {
    sendJson(response, { sessions: [session, ...branchArtifacts.sessions()] });
    return;
  }
  if (
    request.method === 'GET' &&
    url.pathname === `/v1/sessions/${sessionId}/attention/availability`
  ) {
    sendJson(response, {
      enabled: false,
      reason: 'not_configured',
      message: 'This fixture has no attention capture.',
      messages: {},
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/messages`) {
    sendJson(response, {
      messages: transcriptMessages(),
      tools: [
        ...(questionTrayDemo
          ? [
              {
                id: 'tool_fixture_question',
                session_id: sessionId,
                name: 'ask_user',
                title: 'Ask user',
                state: 'succeeded',
                input: { question: 'Which evidence view?' },
                output: 'Waiting for your answer.',
              },
            ]
          : []),
        ...transcriptActivityTools,
        {
          id: 'tool_earthscope',
          session_id: sessionId,
          name: 'ndp_search_datasets',
          title: 'Search EarthScope catalog',
          state: 'succeeded',
          input: { search_terms: ['earthscope', 'converted'] },
          output: { dataset_id: 'earthscope_stations', staged: false },
          duration_ms: 820,
        },
      ],
      tasks: [
        {
          id: 'task_quality',
          session_id: sessionId,
          title: 'Review station quality',
          state: 'completed',
          detail: 'Evidence retained with source identity.',
        },
      ],
      subagents: [
        {
          id: 'subagent_station',
          session_id: sessionId,
          title: 'Station evidence specialist',
          state: 'completed',
          summary: 'Reviewed coverage without staging data.',
        },
      ],
      artifacts: [
        {
          id: 'artifact_plot',
          session_id: sessionId,
          name: 'vertical-displacement.png',
          media_type: 'image/png',
          uri: 'artifact://flat-ndp/vertical-displacement.png@v1',
          // Without size, ClioArtifactCard's withinBudget check never opens,
          // so the inline preview never fetches or renders (artifact-card.tsx).
          size: artifactPng.length,
          created_at: observedAt,
        },
        ...(a2uiDataDemo
          ? [
              {
                id: earthquakeArtifactId,
                session_id: sessionId,
                name: 'earthquakes.csv',
                media_type: 'text/csv',
                uri: 'artifact://flat-ndp/earthquakes.csv@v1',
                size: earthquakeCsvBytes.length,
                created_at: observedAt,
              },
            ]
          : []),
      ],
      surfaces: [
        ...(a2uiBoxplotDemo ? [boxplotDemoSurface()] : []),
        ...(a2uiComposedDemo ? [composedDemoSurface()] : []),
        ...(a2uiMeshDemo ? [meshDemoSurface()] : []),
        ...(a2uiRasterDemo ? [rasterDemoSurface()] : []),
        ...(a2uiGeojsonDemo ? [geojsonDemoSurface()] : []),
        ...(a2uiMapDemo ? [earthScopeMapSurface()] : []),
        ...(a2uiDataDemo
          ? [a2uiAutoDemo ? earthquakeAutoSelectionSurface() : earthquakeDataSurface()]
          : []),
      ],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/work`) {
    sendJson(response, {
      cursor: 0,
      goal: null,
      loop: null,
      goals: [],
      loops: [],
      todos: [],
      goal_next_cursor: null,
      loop_next_cursor: null,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/schedules`) {
    sendJson(response, { schedules: [], cron_timezone: 'UTC' });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/workspaces/${workspaceId}/sources`) {
    sendJson(response, { sources: [] });
    return;
  }
  // The variant tabs rebuild a session's BestOfN / Refine runs from this route
  // after a reload; the flat-NDP session has none.
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/variant-runs`) {
    sendJson(response, { session_id: sessionId, runs: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/queued-messages`) {
    sendJson(response, { queued_messages: queuedMessages });
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === `/v1/sessions/${sessionId}/queued-messages/reorder`
  ) {
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      sendJson(response, { detail: error instanceof Error ? error.message : 'invalid JSON' }, 400);
      return;
    }
    const orderedIds = Array.isArray(body.ordered_ids) ? body.ordered_ids : [];
    const currentIds = new Set(queuedMessages.map((message) => message.id));
    const requestedIds = new Set(orderedIds);
    if (
      orderedIds.length !== queuedMessages.length ||
      requestedIds.size !== currentIds.size ||
      orderedIds.some((id) => typeof id !== 'string' || !currentIds.has(id))
    ) {
      sendJson(response, { detail: 'queued message reorder set does not match server state' }, 409);
      return;
    }
    const byId = new Map(queuedMessages.map((message) => [message.id, message]));
    // The client sends the revision it believes each row is at. Ignoring that
    // map made the conflict path unreachable from a test, so a drag started
    // against a stale queue could never be exercised.
    const expected = body.revisions && typeof body.revisions === 'object' ? body.revisions : {};
    const stale = queuedMessages.find((message) => expected[message.id] !== message.revision);
    if (stale) {
      sendJson(
        response,
        {
          detail: {
            error: 'revision_conflict',
            message: 'queued message changed on the server',
            current: stale,
          },
        },
        409,
      );
      return;
    }
    queuedMessages = orderedIds.map((id, position) => {
      const message = byId.get(id);
      return {
        ...message,
        position,
        revision: message.revision + 1,
        updated_at: new Date().toISOString(),
      };
    });
    publish('queued_message.reordered', { queued_messages: queuedMessages });
    sendJson(response, { queued_messages: queuedMessages });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/pending-steers`) {
    sendJson(response, { pending_steers: [pendingSteer] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/workspaces/${workspaceId}/resources`) {
    sendJson(response, { resources: [...resources.values()].map((entry) => entry.record) });
    return;
  }
  if (request.method === 'POST' && url.pathname === `/v1/workspaces/${workspaceId}/resources`) {
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      sendJson(response, { detail: error instanceof Error ? error.message : 'invalid JSON' }, 400);
      return;
    }
    sendJson(response, createResource(body), 201);
    return;
  }
  if (
    request.method === 'PATCH' &&
    resourceContentPath(url.pathname) !== undefined &&
    resources.has(resourceContentPath(url.pathname))
  ) {
    const entry = resources.get(resourceContentPath(url.pathname));
    const offset = Number.parseInt(request.headers['upload-offset'] ?? '', 10);
    if (!Number.isSafeInteger(offset) || offset !== entry.bytes.length) {
      // The service is authoritative for how many bytes it holds: a client that
      // resumes from the wrong place must be told, not silently appended to.
      sendJson(
        response,
        { detail: { error: 'upload_offset_conflict', received_size: entry.bytes.length } },
        409,
      );
      return;
    }
    entry.bytes = Buffer.concat([entry.bytes, await readBytes(request)]);
    entry.record.received_size = entry.bytes.length;
    entry.record.updated_at = new Date().toISOString();
    publish('resource.upload_progress', entry.record);
    if (entry.bytes.length >= entry.record.declared_size) finalizeResource(entry);
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  if (request.method === 'GET' && resources.has(resourcePath(url.pathname))) {
    sendJson(response, resources.get(resourcePath(url.pathname)).record);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/provider-catalog') {
    sendJson(response, providerCatalog);
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/artifacts`) {
    const artifacts = [...(a2uiDataDemo ? [artifactRecord, earthquakeArtifactRecord] : [artifactRecord]), ...branchArtifacts.artifacts()];
    sendJson(response, {
      artifacts,
      used: [],
      count: artifacts.length,
      include_children: true,
      child_session_ids: [],
      next_cursor: null,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/references/resolve`) {
    const uri = url.searchParams.get('uri');
    if (uri === 'artifact://artifact_plot') {
      sendJson(response, {
        uri,
        kind: 'artifact',
        workspace_id: workspaceId,
        name: artifactRecord.name,
        media_type: 'image/png',
        size_bytes: artifactPng.length,
        artifact_id: 'artifact_plot',
        fetch_path: '/v1/artifacts/artifact_plot/bytes',
      });
      return;
    }
    sendJson(response, { detail: 'Reference is not present in this demo session.' }, 404);
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/artifacts/artifact_plot') {
    sendJson(response, { artifact: artifactRecord, resolved: artifactRecord.versions[0] });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/artifacts/artifact_plot/bytes') {
    response.writeHead(200, {
      ...commonHeaders('image/png'),
      'Content-Length': String(artifactPng.length),
    });
    response.end(artifactPng);
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/artifacts/${earthquakeArtifactId}`) {
    sendJson(response, {
      artifact: earthquakeArtifactRecord,
      resolved: earthquakeArtifactRecord.versions[0],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/artifacts/${earthquakeArtifactId}/bytes`) {
    response.writeHead(200, {
      ...commonHeaders('text/csv'),
      'Content-Length': String(earthquakeCsvBytes.length),
    });
    response.end(earthquakeCsvBytes);
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/artifacts/${geojsonArtifactId}/bytes`) {
    response.writeHead(200, {
      ...commonHeaders('application/geo+json'),
      'Content-Length': String(geojsonDemoBytes.length),
    });
    response.end(geojsonDemoBytes);
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/artifacts/${modelObjId}/bytes`) {
    response.writeHead(200, {
      ...commonHeaders('model/obj'),
      'Content-Length': String(modelObjBytes.length),
    });
    response.end(modelObjBytes);
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === `/v1/artifacts/${rasterArtifactId}/raster-query`
  ) {
    const body = await readJson(request);
    const width = Math.min(768, Number(body.width) || 512);
    const height = Math.min(768, Number(body.height) || 512);
    const extent = body.extent ?? [0, 0, 100, 100];
    const values = [];
    for (let y = 0; y < height; y += 1)
      for (let x = 0; x < width; x += 1) {
        const gx = extent[0] + ((x + 0.5) / width) * (extent[2] - extent[0]);
        const gy = extent[1] + ((y + 0.5) / height) * (extent[3] - extent[1]);
        const hot = Math.exp(-((gx - 32) ** 2 + (gy - 38) ** 2) / 180);
        const cool = Math.exp(-((gx - 70) ** 2 + (gy - 64) ** 2) / 220);
        values.push(Math.round((16 + 18 * hot - 9 * cool + gx * 0.04) * 100) / 100);
      }
    sendJson(response, {
      width,
      height,
      extent,
      sourceBounds: [0, 0, 100, 100],
      sourceShape: [100, 100],
      xLabel: 'Easting',
      yLabel: 'Northing',
      min: values.reduce((a, b) => Math.min(a, b), Infinity),
      max: values.reduce((a, b) => Math.max(a, b), -Infinity),
      values,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/artifacts/${modelMtlId}/bytes`) {
    response.writeHead(200, {
      ...commonHeaders('text/plain'),
      'Content-Length': String(modelMtlBytes.length),
    });
    response.end(modelMtlBytes);
    return;
  }
  if (
    request.method === 'GET' &&
    url.pathname === '/v1/artifacts/artifact_gallery_terrain_glb/bytes'
  ) {
    response.writeHead(200, {
      ...commonHeaders('model/gltf-binary'),
      'Content-Length': String(galleryTerrainGlb.length),
    });
    response.end(galleryTerrainGlb);
    return;
  }
  if (
    request.method === 'GET' &&
    url.pathname.startsWith('/v1/artifacts/artifact_model_') &&
    url.pathname.endsWith('/bytes')
  ) {
    const format = url.pathname.slice('/v1/artifacts/artifact_model_'.length, -'/bytes'.length);
    const bytes = modelTriangle[format];
    if (bytes) {
      response.writeHead(200, {
        ...commonHeaders('application/octet-stream'),
        'Content-Length': String(bytes.length),
      });
      response.end(bytes);
      return;
    }
  }
  if (
    request.method === 'POST' &&
    url.pathname === `/v1/artifacts/${earthquakeArtifactId}/table-query`
  ) {
    const body = await readJson(request);
    const result = runEarthquakeTableQuery(body);
    sendJson(response, result.body, result.status);
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/events`) {
    response.writeHead(200, commonHeaders('text/event-stream'));
    const preamble = envelope('stream.live', { service: 'clio-fixture' }, nextCursor);
    response.write(`id: ${nextCursor}\nevent: stream.live\ndata: ${JSON.stringify(preamble)}\n\n`);
    nextCursor += 1;
    streamClients.add(response);
    const keepAlive = setInterval(() => response.write(': fixture keep-alive\n\n'), 1000);
    request.on('close', () => {
      clearInterval(keepAlive);
      streamClients.delete(response);
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/providers/lm') {
    sendJson(response, {
      configured: true,
      provider: 'codex',
      api_base: 'codex://direct',
      model: 'gpt-5.6-luna',
      thinking_level: 'medium',
      thinking_effective: 'medium (budget 8192)',
      presets: [
        {
          id: 'codex',
          label: 'Codex',
          provider: 'codex',
          api_base: 'codex://direct',
          suggested_model: 'gpt-5.6-luna',
          requires_api_key: false,
          is_authenticated: true,
          supports_live_catalog: true,
          supports_vision: true,
        },
      ],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/providers/codex/models') {
    sendJson(response, {
      models: [{ id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', context_window: 262144 }],
      source: 'provider',
      default_model: 'gpt-5.6-luna',
      generated_at: observedAt,
    });
    return;
  }
  if (
    (mcpV2UiDemo || a2uiMapDemo || questionTrayDemo) &&
    request.method === 'GET' &&
    url.pathname === `/v1/sessions/${sessionId}/interactions`
  ) {
    sendJson(response, {
      interactions: questionTrayDemo
        ? [
            {
              id: 'native:question:tray',
              kind: 'question',
              status: 'pending',
              requires_human_response: true,
              audience: 'human',
              owner_session_id: sessionId,
              attended_session_id: sessionId,
              title: 'Question',
              prompt: 'Which evidence view should remain primary?',
              created_at: observedAt,
              source: {
                protocol: 'native',
                tool_name: 'ask_user',
                invocation_id: 'tool_fixture_question',
              },
              actions: ['answer'],
              payload: {
                question_id: 'tray',
                kind: 'choice',
                options: [{ label: 'Table', value: 'table' }],
              },
            },
          ]
        : a2uiMapDemo
          ? earthScopeMapInteractions()
          : mcpV2Interactions(),
    });
    return;
  }
  const interactionResponseMatch = url.pathname.match(
    new RegExp(`^/v1/sessions/${sessionId}/interactions/([^/]+)/respond$`),
  );
  if ((mcpV2UiDemo || a2uiMapDemo) && request.method === 'POST' && interactionResponseMatch) {
    const interactionId = decodeURIComponent(interactionResponseMatch[1]);
    const body = await readJson(request);
    resolvedInteractionIds.add(interactionId);
    sendJson(response, { interaction_id: interactionId, response: body, status: 'answered' });
    return;
  }
  const mcpAppMatch = url.pathname.match(
    new RegExp(`^/v1/sessions/${sessionId}/mcp-apps/(app_fixture_[12])(?:/(.*))?$`),
  );
  if (mcpV2UiDemo && mcpAppMatch) {
    const appInstanceId = mcpAppMatch[1];
    const suffix = mcpAppMatch[2] ?? '';
    const expectedRef = appInstanceId === 'app_fixture_1' ? 'opaque-fixture-1' : 'opaque-fixture-2';
    if (url.searchParams.get('data_ref') !== expectedRef) {
      sendJson(response, { detail: 'invalid app capability' }, 403);
      return;
    }
    if (request.method === 'GET' && suffix === '') {
      sendJson(response, {
        protocol_version: '2026-01-26',
        resource: {
          uri: 'ui://v2ex/panel',
          mime_type: 'text/html;profile=mcp-app',
          html: mcpAppHtml,
          csp: {},
          permissions: {},
        },
        tool_input: { dataset: 'stations' },
        tool_result: { structuredContent: { rows: 3 } },
        sandbox_url: `http://127.0.0.1:${port}/v1/sessions/${sessionId}/mcp-apps/${appInstanceId}/sandbox?data_ref=${expectedRef}`,
      });
      return;
    }
    if (request.method === 'GET' && suffix === 'sandbox') {
      response.writeHead(200, {
        ...commonHeaders('text/html; charset=utf-8'),
        'Content-Security-Policy':
          "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self'",
      });
      response.end(mcpSandboxHtml());
      return;
    }
    if (request.method === 'POST' && suffix === 'tools/call') {
      await readJson(request);
      mcpAppToolCalls += 1;
      sendJson(response, { content: [{ type: 'text', text: 'row inspected' }] });
      return;
    }
    if (request.method === 'PUT' && suffix === 'model-context') {
      await readJson(request);
      mcpAppModelContextUpdates += 1;
      sendJson(response, {});
      return;
    }
    if (request.method === 'POST' && suffix === 'messages') {
      await readJson(request);
      mcpAppMessages += 1;
      sendJson(response, {
        message_id: `fixture-message-${mcpAppMessages}`,
        delivery: 'queued',
        state: 'waiting',
      });
      return;
    }
    if (request.method === 'POST' && suffix === 'resources/read') {
      const body = await readJson(request);
      sendJson(response, { contents: [{ uri: body.uri, text: 'fixture resource' }] });
      return;
    }
    if (request.method === 'DELETE' && suffix === '') {
      mcpAppCloses += 1;
      sendJson(response, { closed: true });
      return;
    }
  }
  if (request.method === 'GET' && url.pathname === '/v1/permissions') {
    sendJson(response, {
      permissions: permissionPending
        ? [
            {
              id: 'perm_fixture',
              session_id: sessionId,
              tool_call: { tool_name: 'workspace.read', input: { path: 'results/stations.csv' } },
              summary: 'Read the station evidence table',
              reason: 'The agent needs the selected evidence source.',
              risk: 'low',
              created_at: observedAt,
              status: 'pending',
            },
          ]
        : [],
    });
    return;
  }
  if (request.method === 'POST' && url.pathname === '/v1/permissions/perm_fixture') {
    permissionPending = false;
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }
  // The unscoped read the workspace actually uses: a descendant session can
  // raise a question, so the surface asks for every session's, filtered by
  // status, rather than only the focused session's.
  if (
    request.method === 'GET' &&
    (url.pathname === '/v1/questions' || url.pathname === `/v1/sessions/${sessionId}/questions`)
  ) {
    const wantsPending = url.searchParams.get('status');
    sendJson(response, {
      questions:
        questionPending && (wantsPending === null || wantsPending === 'pending')
          ? [
              {
                id: 'question_fixture',
                session_id: sessionId,
                prompt: 'Which evidence view should remain primary?',
                status: 'pending',
                kind: 'choice',
                options: [
                  {
                    label: 'Station table',
                    value: 'table',
                    description: 'Keep sortable evidence primary.',
                  },
                  {
                    label: 'Displacement plot',
                    value: 'plot',
                    description: 'Keep the derived series primary.',
                  },
                ],
                selected_options: [],
                created_at: observedAt,
                updated_at: observedAt,
              },
            ]
          : [],
    });
    return;
  }
  if (
    request.method === 'POST' &&
    url.pathname === `/v1/sessions/${sessionId}/questions/question_fixture/answer`
  ) {
    questionPending = false;
    sendJson(response, {
      id: 'question_fixture',
      session_id: sessionId,
      prompt: 'Which evidence view should remain primary?',
      status: 'answered',
      kind: 'choice',
      options: [],
      selected_options: ['table'],
      created_at: observedAt,
      updated_at: new Date().toISOString(),
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/state`) {
    sendJson(response, {
      session_id: sessionId,
      scope: 'main',
      window_tokens: 262144,
      live_tokens: 1200,
      used_tokens: 18400,
      autocompact_pct: 0.85,
      live_block_count: 4,
      categories: { evidence: 840, tools: 360 },
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/policy`) {
    sendJson(response, {
      session_id: sessionId,
      memory_scope: 'session',
      writable_scope: 'session',
      cross_session_read_available: true,
      cross_session_read_endpoint: `/v1/sessions/${sessionId}/memory/tools/search-sessions`,
      requires_user_consent: true,
      notes: [
        'Conversation retrieval and writes are scoped to the active session.',
        'Cross-session memory tools require explicit user intent or policy.',
        'Other-workspace memory is denied by default.',
      ],
      metadata: { source: 'clio_backend_default' },
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/diffs`) {
    sendJson(response, { diffs: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/files`) {
    sendJson(response, {
      files: [
        {
          path: 'results/stations.csv',
          display_path: 'results/stations.csv',
          workspace_id: workspaceId,
          source: 'EarthScope evidence review',
          mode: 'read',
          size: 2048,
          language: 'csv',
          added_at: observedAt,
        },
      ],
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/context/frames`) {
    sendJson(response, { frames: [] });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/sessions/${sessionId}/async-processes`) {
    sendJson(response, { processes: [] });
    return;
  }
  // The agent-task registry read behind the observability child-agent list
  // (GET /v1/sessions/{sid}/agent-tasks). The fixture session's registry holds
  // the one delegated specialist its transcript shows; every other session has
  // none.
  const agentTasksMatch = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/agent-tasks$/u);
  if (request.method === 'GET' && agentTasksMatch) {
    const tasks =
      decodeURIComponent(agentTasksMatch[1]) === sessionId
        ? [
            {
              task_id: 'subagent_station',
              parent_session_id: sessionId,
              child_session_id: '',
              agent_ref: { expert_id: 'station_evidence' },
              run_index: 0,
              run_label: 'Station evidence specialist',
              status: 'completed',
              live_state: 'completed',
              error_reason: '',
              created_at: '2026-08-22T00:00:00Z',
              updated_at: '2026-08-22T00:00:00Z',
            },
          ]
        : [];
    sendJson(response, { tasks });
    return;
  }
  if (request.method === 'GET' && url.pathname === `/v1/workspaces/${workspaceId}/files`) {
    // Matched on pathname only (query params like include_hidden /
    // exclude_service_storage never affect this fixture's response), but
    // `truncated` is still included so the response shape matches the real
    // server contract for any consumer that reads it.
    sendJson(response, {
      entries: [
        { path: 'results', type: 'dir' },
        { path: 'results/stations.csv', type: 'file', size: 2048 },
        { path: 'results/vertical-displacement.png', type: 'file', size: 8192 },
      ],
      truncated: false,
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/runs') {
    sendJson(response, { runs: [] });
    return;
  }
  // SPOTTER review availability for the confirmation-policy pickers
  // (GET /v1/spotter/availability): the fixture service can arm it, so the
  // option renders selectable exactly as before the availability read existed.
  if (request.method === 'GET' && url.pathname === '/v1/spotter/availability') {
    sendJson(response, {
      schema_version: 'clio.spotter_availability.v1',
      approval_mode: 'spotter-ai',
      available: true,
      reason: '',
      message: '',
      remedy: '',
      agent_blueprint_id: 'spotter-ai',
      details: {},
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/session-defaults') {
    sendJson(response, {
      provider_id: '',
      model_id: '',
      effort: 'medium',
      effort_source: 'user',
      mode: 'edit',
      edit_mode: 'diff',
      routing_mode: 'auto',
      approval_mode: 'ask',
      blueprint_id: '',
    });
    return;
  }
  if (request.method === 'GET' && url.pathname === '/v1/agent-blueprints') {
    sendJson(response, { agent_blueprints: [] });
    return;
  }
  if (request.method === 'POST' && url.pathname === `/v1/sessions/${sessionId}/cancel`) {
    response.writeHead(204, commonHeaders());
    response.end();
    return;
  }

  sendJson(response, { error: 'not_found', path: url.pathname }, 404);
});

const host = process.env['CLIO_FIXTURE_HOST'] ?? '127.0.0.1';
server.listen(port, host, () => {
  process.stdout.write(`CLIO Playwright fixture listening on http://${host}:${port}\n`);
});
