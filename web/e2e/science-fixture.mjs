/**
 * Test-only data for the science views (design spec "Science views are viewers
 * in the one tab", docs/design/visual-language/runs-attention.html): the Opal
 * soil moisture study's science log, the Opal vault, the Opal sites dashboard
 * and the opal_paper.tex LaTeX build, all in the flat-NDP conversation.
 *
 * `POST /__test/science-views` turns the study, vault and paper on; reset turns
 * them off. Saved dashboards and LaTeX reads answer for every artifact and
 * session (empty or `*_not_found`), as the service does.
 */

const CATALOG_ID = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
const DASHBOARD_ARTIFACT = 'artifact_opal_dashboard';
const DASHBOARD_ID = 'dash_opal_sites';
const TEX_ARTIFACT = 'artifact_opal_tex';
const PDF_ARTIFACT = 'artifact_opal_pdf';
const VAULT_ID = 'src_opal_vault';
const TEX_PATH = 'paper/opal_paper.tex';
const SOURCES_PATH = 'paper/sections/sources.tex';
const PDF_PATH = 'paper/opal_paper.pdf';
const DRIFT = 'sess_opal_drift';
const DROUGHT = 'sess_opal_drought';
const NDP = 'sess_opal_ndp';

const at = (minute) => `2026-08-22T19:${String(minute).padStart(2, '0')}:00.000Z`;

// --- Dashboard ------------------------------------------------------------------

/** Monthly mean soil moisture, 2020 to 2023, with the 2022 summer drought dip. */
function monthlyMoisture() {
  const rows = [];
  for (let year = 2020; year <= 2023; year += 1) {
    for (let month = 0; month < 12; month += 1) {
      const seasonal = 0.29 - 0.045 * Math.sin(((month - 2) / 12) * 2 * Math.PI);
      const drought =
        year === 2022 && month >= 4 && month <= 8 ? -0.07 + Math.abs(month - 6) * 0.018 : 0;
      const wiggle = (((year * 7 + month * 13) % 9) - 4) * 0.004;
      rows.push({
        date: `${year}-${String(month + 1).padStart(2, '0')}-01`,
        soil_moisture: Math.round((seasonal + drought + wiggle) * 1000) / 1000,
      });
    }
  }
  return rows;
}

const STATES = ['OK', 'KS', 'TX', 'NE', 'CO', 'NM'];

function siteRows() {
  return Array.from({ length: 412 }, (_, index) => {
    const anomaly = -0.04 + (((index * 37) % 23) - 11) * 0.002;
    return {
      site: `OP-${String(index + 1).padStart(3, '0')}`,
      state: STATES[index % STATES.length],
      latitude: Math.round((33.2 + ((index * 53) % 97) / 10) * 1000) / 1000,
      longitude: Math.round((-103.9 + ((index * 29) % 89) / 10) * 1000) / 1000,
      network: index % 4 === 0 ? 'SCAN' : 'Mesonet',
      anomaly_2022: Math.round(anomaly * 1000) / 1000,
    };
  });
}

const YEARLY = [
  { year: 2020, mean: 0.284, granules: 366, stations: 404 },
  { year: 2021, mean: 0.291, granules: 365, stations: 409 },
  { year: 2022, mean: 0.238, granules: 365, stations: 412 },
  { year: 2023, mean: 0.279, granules: 366, stations: 412 },
];

function dashboardSurface(sessionId) {
  const surfaceId = 'surface_opal_sites';
  const components = [
    {
      id: 'root',
      component: 'Tabs',
      tabs: [
        { title: 'Overview', child: 'overview' },
        { title: 'Sites', child: 'sites' },
        { title: 'Data', child: 'data' },
      ],
    },
    { id: 'overview', component: 'Column', children: ['kpis', 'trend'] },
    {
      id: 'kpis',
      component: 'Grid',
      columns: 3,
      gap: 4,
      children: ['stations', 'granules', 'delta'],
    },
    {
      id: 'stations',
      component: 'clio.metric.v1',
      label: 'Stations',
      value: '412',
      unit: 'stations',
    },
    {
      id: 'granules',
      component: 'clio.metric.v1',
      label: 'SMAP L3 granules',
      value: '1,462',
      unit: 'granules',
    },
    {
      id: 'delta',
      component: 'clio.metric.v1',
      label: '2022 vs baseline',
      value: '−0.04',
      unit: 'm³/m³',
      trend: 'down',
      detail: 'Jun to Aug, 412 sites',
    },
    {
      id: 'trend',
      component: 'clio.chart.v1',
      title: 'Soil moisture against the 2015 to 2021 baseline',
      height: 240,
      data: monthlyMoisture(),
      spec: {
        data: { name: 'source' },
        layer: [
          {
            mark: { type: 'line', point: false },
            encoding: {
              x: { field: 'date', type: 'temporal', title: null },
              y: {
                field: 'soil_moisture',
                type: 'quantitative',
                title: 'Soil moisture (m³/m³)',
                scale: { domain: [0.15, 0.4] },
              },
            },
          },
          {
            mark: { type: 'rule', strokeDash: [4, 4] },
            encoding: { y: { datum: 0.27 } },
          },
        ],
      },
      accessibility: {
        label: 'Monthly soil moisture, 2020 to 2023',
        description:
          'Monthly mean soil moisture with the dashed 0.27 baseline; 2022 dips below it.',
      },
    },
    {
      id: 'sites',
      component: 'clio.data-table.v1',
      columns: [
        { key: 'site', label: 'Site' },
        { key: 'state', label: 'State' },
        { key: 'network', label: 'Network' },
        { key: 'latitude', label: 'Latitude' },
        { key: 'longitude', label: 'Longitude' },
        { key: 'anomaly_2022', label: '2022 anomaly (m³/m³)' },
      ],
      rows: siteRows(),
    },
    {
      id: 'data',
      component: 'clio.data-table.v1',
      columns: [
        { key: 'year', label: 'Year' },
        { key: 'mean', label: 'Mean (m³/m³)' },
        { key: 'granules', label: 'SMAP granules' },
        { key: 'stations', label: 'Stations' },
      ],
      rows: YEARLY,
    },
  ];
  return {
    id: surfaceId,
    session_id: sessionId,
    catalog_id: CATALOG_ID,
    protocol_version: '0.9.1',
    revision: 3,
    part_id: 'part_opal_sites_1',
    state: 'ready',
    message_revisions: [1, 3],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId, catalogId: CATALOG_ID } },
      { version: 'v0.9.1', updateComponents: { surfaceId, components } },
    ],
  };
}

function dashboardReport(sessionId) {
  const surface = dashboardSurface(sessionId);
  return {
    format: 'clio.dashboard.v1',
    id: DASHBOARD_ID,
    session_id: sessionId,
    title: 'Opal sites',
    created_at: at(40),
    surface,
    definition_path: 'dashboards/opal-sites.dashboard.json',
    definition: { title: 'Opal sites', tabs: ['Overview', 'Sites', 'Data'] },
    sources: [{ surface_id: surface.id, revision: surface.revision }],
  };
}

// --- LaTeX ----------------------------------------------------------------------

const TEX_LINES = [
  '\\documentclass[11pt]{article}',
  '\\usepackage{graphicx}',
  '\\usepackage{textcomp}',
  '\\title{Opal soil moisture in the 2022 drought}',
  '\\author{Opal field team}',
  '\\begin{document}',
  '\\maketitle',
  '',
  '\\section{Introduction}',
  'Was soil moisture at the Opal sites in 2022 below the 2015 to 2021',
  'baseline, and was the dip drought or sensor drift?',
  '\\section{Data}',
  'SMAP L3 soil moisture, 2015 to 2023,',
  'regridded to 0.25\\textdegree{} \\cite{smap009}.',
  '\\input{sections/sources}',
  '\\begin{figure}',
  '  \\includegraphics{baseline_plot.png}',
  '  \\caption{2022 against the baseline.}',
  '\\end{figure}',
  '',
  '\\section{Results}',
  'The 2022 dip matches the drought flags',
  'in \\texttt{sm\\_qc}, not a sensor fault.',
  'Across 412 sites, June to August 2022 averaged',
  '0.04~m\\textsuperscript{3}/m\\textsuperscript{3} below the baseline.',
  '',
  'Rainfall over the same months was 38\\% below normal,',
  'and the paired SCAN probes agree with the regridded',
  'retrievals to within their calibration tolerance.',
  '',
  '\\section{Discussion}',
  'A sensor fault would show at single stations; the dip',
  'is regional and follows the precipitation deficit.',
  'Earlier SMAP versions \\cite{smap008} used a coarser',
  'grid, so we compare against version 9 only.',
  '',
  'The QC flags mark 3\\% of retrievals as frozen or',
  'dense vegetation; dropping them does not change the',
  'sign or the size of the anomaly.',
  '',
  '\\paragraph{Limits.}',
  'Two stations moved in 2021; their records restart',
  'at the new site and are excluded from the baseline.',
  '',
  '\\begin{table}',
  '  \\begin{tabular}{lrrr}',
  '    Year & Mean & Granules & Stations \\\\',
  '    2020 & 0.284 & 366 & 404 \\\\ 2021 & 0.291 & 365 & 409 \\\\ 2022 & 0.238 & 365 & 412 \\\\',
  '  \\end{tabular}',
  '\\end{table}',
  '',
  '\\begin{thebibliography}{9}',
  "\\bibitem{smap009} O'Neill et al., SMAP L3 Radiometer Global Daily",
  '  9 km EASE-Grid Soil Moisture, Version 9, NSIDC, 2023.',
  '\\end{thebibliography}',
  '\\end{document}',
];
const TEX = `${TEX_LINES.join('\n')}\n`;
const SOURCES_TEX = [
  '\\subsection{SMAP L3}',
  'Daily L3 radiometer retrievals, 1,462 granules from NDP,',
  'averaged to monthly means per 0.25\\textdegree{} cell.',
  '',
  '\\subsection{SCAN sites}',
  'In-situ probes at 5 cm from the SCAN network, matched',
  'to the nearest SMAP cell for each of the 412 Opal sites.',
  '',
].join('\n');

const lineOf = (text) => TEX_LINES.findIndex((line) => line.startsWith(text)) + 1;
const PAGE = [612, 792];

function outline() {
  const node = (title, file, start, end, page, top, extra = {}) => ({
    kind: extra.kind ?? 'section',
    file,
    start_line: start,
    end_line: end,
    title,
    level: extra.level ?? 1,
    labels: [],
    citations: extra.citations ?? [],
    places: [{ page, rect: [72, top, 540, top + 18] }],
    children: extra.children ?? [],
  });
  const data = lineOf('\\section{Data}');
  const results = lineOf('\\section{Results}');
  const discussion = lineOf('\\section{Discussion}');
  return {
    nodes: [
      node('Introduction', 'opal_paper.tex', lineOf('\\section{Introduction}'), data - 1, 1, 196),
      node('Data', 'opal_paper.tex', data, results - 1, 1, 296, {
        citations: [{ key: 'smap009', resolved: true }],
        children: [
          node('SMAP L3', 'sections/sources.tex', 1, 4, 1, 380, {
            kind: 'subsection',
            level: 2,
          }),
          node('SCAN sites', 'sections/sources.tex', 5, 8, 1, 470, {
            kind: 'subsection',
            level: 2,
          }),
        ],
      }),
      node('Results', 'opal_paper.tex', results, discussion - 1, 2, 420),
      node('Discussion', 'opal_paper.tex', discussion, TEX_LINES.length, 3, 96, {
        citations: [{ key: 'smap008', resolved: false }],
      }),
    ],
    counts: { section: 4, subsection: 2, figure: 1, table: 1, citation: 2 },
    unresolved_citations: ['smap008'],
    synctex: true,
  };
}

function latexReport() {
  return {
    entry: TEX_PATH,
    folder: 'paper',
    build: {
      status: 'complete',
      entry: TEX_PATH,
      source_artifact_id: TEX_ARTIFACT,
      pdf: { artifact_id: PDF_ARTIFACT, name: 'opal_paper.pdf', path: PDF_PATH },
      page_count: 4,
      diagnostics: [
        {
          kind: 'overfull_box',
          message: 'Overfull hbox, line 48',
          file: 'opal_paper.tex',
          line: 48,
          page: 3,
          detail: 'Overfull \\hbox (14.2pt too wide) in paragraph at lines 48--48',
        },
        {
          kind: 'undefined_citation',
          message: 'Citation smap008 undefined',
          file: 'opal_paper.tex',
          line: lineOf('Earlier SMAP versions'),
          page: 3,
          detail: 'smap008',
        },
      ],
      counts: { overfull_box: 1, undefined_citation: 1 },
      read: ['opal_paper.tex', 'sections/sources.tex', 'baseline_plot.png'],
      network: '',
    },
    outline: outline(),
    files: ['opal_paper.tex', 'sections/sources.tex', 'baseline_plot.png'],
    texts: { 'opal_paper.tex': TEX, 'sections/sources.tex': SOURCES_TEX },
    page_sizes: [PAGE, PAGE, PAGE, PAGE],
  };
}

function flatten(nodes) {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])]);
}

/** SyncTeX-like answers from the outline: a line's section places, or a page's section line. */
function locate(url) {
  const nodes = flatten(outline().nodes);
  const file = url.searchParams.get('file');
  const line = Number(url.searchParams.get('line') ?? 0);
  if (file) {
    const node =
      nodes
        .filter((item) => item.file === file && item.start_line <= line && line <= item.end_line)
        .at(-1) ?? nodes[0];
    return {
      status: 'ok',
      direction: 'forward',
      page: node.places[0].page,
      file,
      line,
      node: node.title,
      places: node.places,
    };
  }
  const page = Number(url.searchParams.get('page') ?? 1);
  const y = Number(url.searchParams.get('y') ?? 0);
  const onPage = nodes.filter((item) => item.places[0].page <= page);
  const node =
    onPage.filter((item) => item.places[0].page < page || item.places[0].rect[1] <= y).at(-1) ??
    nodes[0];
  return {
    status: 'ok',
    direction: 'inverse',
    page,
    file: node.file,
    line: node.start_line,
    node: node.title,
    places: node.places,
  };
}

const pdfText = (text) => text.replace(/[\\()]/gu, (match) => `\\${match}`);

/** A four-page text PDF of the paper, with the baseline figure drawn as vector lines. */
function paperPdf() {
  const line = (size, x, text) => ({ size, x, text });
  const pages = [
    [
      line(20, 72, 'Opal soil moisture in the 2022 drought'),
      line(11, 72, 'Opal field team'),
      line(14, 72, '1   Introduction'),
      line(11, 72, 'Was soil moisture at the Opal sites in 2022 below the 2015 to 2021'),
      line(11, 72, 'baseline, and was the dip drought or sensor drift?'),
      line(14, 72, '2   Data'),
      line(11, 72, 'SMAP L3 soil moisture, 2015 to 2023, regridded to 0.25 deg [1].'),
      line(12, 72, '2.1   SMAP L3'),
      line(11, 72, 'Daily L3 radiometer retrievals, 1,462 granules from NDP,'),
      line(11, 72, 'averaged to monthly means per 0.25 deg cell.'),
      line(12, 72, '2.2   SCAN sites'),
      line(11, 72, 'In-situ probes at 5 cm from the SCAN network, matched to the'),
      line(11, 72, 'nearest SMAP cell for each of the 412 Opal sites.'),
    ],
    [
      line(11, 72, 'Figure 1: 2022 against the baseline.'),
      line(14, 72, '3   Results'),
      line(11, 72, 'The 2022 dip matches the drought flags in sm_qc, not a sensor fault.'),
      line(11, 72, 'Across 412 sites, June to August 2022 averaged 0.04 m3/m3 below'),
      line(11, 72, 'the baseline. Rainfall over the same months was 38% below normal.'),
    ],
    [
      line(14, 72, '4   Discussion'),
      line(11, 72, 'A sensor fault would show at single stations; the dip is regional'),
      line(11, 72, 'and follows the precipitation deficit. Earlier SMAP versions [?]'),
      line(11, 72, 'used a coarser grid, so we compare against version 9 only.'),
      line(11, 72, 'The QC flags mark 3% of retrievals as frozen or dense vegetation.'),
      line(11, 72, 'Year     Mean     Granules     Stations'),
      line(11, 72, '2020     0.284     366     404'),
      line(11, 72, '2021     0.291     365     409'),
      line(11, 72, '2022     0.238     365     412'),
    ],
    [
      line(14, 72, 'References'),
      line(10, 72, "[1] O'Neill et al., SMAP L3 Radiometer Global Daily 9 km EASE-Grid"),
      line(10, 72, '     Soil Moisture, Version 9, NSIDC, 2023.'),
    ],
  ];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const kids = [];
  const moisture = monthlyMoisture();
  pages.forEach((rows, index) => {
    let y = 720;
    let content = '';
    for (const row of rows) {
      y -= row.size === 20 ? 0 : row.size >= 14 ? 30 : row.size === 12 ? 22 : 16;
      content += `BT /F1 ${row.size} Tf ${row.x} ${y} Td (${pdfText(row.text)}) Tj ET\n`;
    }
    if (index === 1) {
      // Figure 1 above its caption: axes, the dashed baseline and the monthly series.
      content += '0.5 w 0.4 G 90 560 m 90 740 l 530 740 l S\n';
      content += '[4 3] 0 d 0.6 0.5 0.2 RG 90 668 m 530 668 l S [] 0 d\n';
      content += '1.2 w 0.1 0.55 0.5 RG ';
      moisture.forEach((point, step) => {
        const px = 90 + (step / (moisture.length - 1)) * 440;
        const py = 560 + ((point.soil_moisture - 0.15) / 0.25) * 180;
        content += `${px.toFixed(1)} ${py.toFixed(1)} ${step ? 'l' : 'm'} `;
      });
      content += 'S\n';
    }
    content += `BT /F1 9 Tf 300 40 Td (${index + 1}) Tj ET`;
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`,
    );
    kids.push(`${objects.length} 0 R`);
  });
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'latin1');
}

// --- Knowledge vault ------------------------------------------------------------

const CORE_NOTES = {
  'Opal sites': {
    tags: ['network', 'sites'],
    body: [
      'The Opal network is 412 soil moisture stations across the southern Great Plains,',
      'read against [[SMAP L3]] retrievals and the in-situ [[SCAN sites]].',
      '',
      '## Baseline',
      '',
      '2015 to 2021 sets the [[Baseline]]. June to August 2022 averaged 0.04 m³/m³',
      'below it, which matches the [[Drought]] record rather than sensor drift.',
      '',
      '## Stations',
      '',
      '| Network | Stations | Depth |',
      '| --- | ---: | --- |',
      '| Mesonet | 309 | 5 cm |',
      '| SCAN | 103 | 5 cm |',
    ],
  },
  'SMAP L3': {
    tags: ['dataset', 'satellite'],
    body: [
      'Daily L3 radiometer soil moisture on the 9 km EASE grid, version 9.',
      'We fetched 1,462 granules from NDP for 2020 to 2023 and averaged them',
      'per cell before comparing with the [[Opal sites]].',
    ],
  },
  'SCAN sites': {
    tags: ['dataset', 'in-situ'],
    body: [
      'The Soil Climate Analysis Network probes at 5 cm depth. Each of the',
      '[[Opal sites]] is matched to its nearest SCAN probe.',
    ],
  },
  Baseline: {
    tags: ['method'],
    body: [
      'The 2015 to 2021 monthly mean, 0.27 m³/m³ in summer. Years are compared',
      'month by month against it, see [[Opal sites]].',
    ],
  },
  Drought: {
    tags: ['finding'],
    body: [
      'The 2022 summer drought: rainfall 38% below normal from June to August.',
      'It explains the dip below the [[Baseline]] at the [[Opal sites]].',
    ],
  },
  Regridding: {
    tags: ['method'],
    body: [
      'SMAP cells are regridded to 0.25° with area weighting before the',
      'comparison; see [[SMAP L3]] and [[Opal sites]].',
    ],
  },
  'QC flags': {
    tags: ['method'],
    body: [
      'The `sm_qc` flags mark frozen ground and dense vegetation; 3% of',
      'retrievals are dropped. Applied to the [[SCAN sites]] too.',
    ],
  },
};

const TOPICS = [
  'PRISM precipitation',
  'Soil texture',
  'EASE grid',
  'NDP catalog',
  'Granule index 2020',
  'Granule index 2021',
  'Granule index 2022',
  'Granule index 2023',
  'Calibration 2021',
  'Probe depth',
  'Frozen ground',
  'Vegetation water content',
  'Station moves',
  'Anomaly method',
  'Monthly means',
  'Summer window',
  'Area weighting',
  'Nearest cell match',
  'Precipitation deficit',
  'Heat wave 2022',
  'Mesonet stations',
  'Data custody',
  'Regrid script',
  'Open questions',
  'Meeting 2026-08-12',
  'Meeting 2026-08-19',
  'Paper outline',
  'Figure plan',
  'Reviewer notes',
  'Version 8 grid',
  'Version 9 changes',
  'Evapotranspiration',
  'Root zone',
  'Surface layer',
  'Drought monitor',
  'Sensor drift checks',
  'Field visit log',
  'Glossary',
  'Reading list',
];
const SITE_NOTES = Array.from(
  { length: 40 },
  (_, index) => `Site OP-${String(index * 10 + 1).padStart(3, '0')}`,
);
const FILLERS = [...TOPICS, ...SITE_NOTES];
const notePath = (title) => `notes/${title}.md`;

/** 86 notes and 142 unique links; the core notes keep the spec's link counts. */
function vaultGraph() {
  const titles = [...Object.keys(CORE_NOTES), ...FILLERS];
  const edges = [
    ['Opal sites', 'SMAP L3'],
    ['Opal sites', 'SCAN sites'],
    ['Opal sites', 'Baseline'],
    ['Opal sites', 'Drought'],
    ['Regridding', 'SMAP L3'],
    ['QC flags', 'SCAN sites'],
    ['Drought', 'Baseline'],
    ['Regridding', 'Opal sites'],
  ];
  const coreFill = {
    'Opal sites': 7,
    'SMAP L3': 6,
    'SCAN sites': 4,
    Baseline: 2,
    Drought: 3,
    Regridding: 2,
    'QC flags': 2,
  };
  let next = 0;
  for (const [core, count] of Object.entries(coreFill)) {
    for (let index = 0; index < count; index += 1) {
      edges.push([FILLERS[next % FILLERS.length], core]);
      next += 1;
    }
  }
  const seen = new Set(edges.map(([a, b]) => [a, b].sort().join('|')));
  const add = (a, b) => {
    const key = [a, b].sort().join('|');
    if (a === b || seen.has(key)) return false;
    seen.add(key);
    edges.push([a, b]);
    return true;
  };
  for (let index = 0; index + 1 < FILLERS.length; index += 1)
    add(FILLERS[index], FILLERS[index + 1]);
  for (let step = 3; edges.length < 142; step += 2)
    for (let index = 0; index < FILLERS.length && edges.length < 142; index += 5)
      add(FILLERS[index], FILLERS[(index + step) % FILLERS.length]);
  return { titles, edges };
}

function noteBody(title, edges) {
  const core = CORE_NOTES[title];
  const outgoing = edges.filter(([source]) => source === title).map(([, target]) => target);
  const lines = [`# ${title}`, ''];
  if (core) lines.push(...core.body);
  else if (title.startsWith('Site '))
    lines.push(`One of the [[Opal sites]]: a 5 cm probe with hourly readings since 2015.`);
  else lines.push(`Working note for the Opal soil moisture study.`);
  const extra = outgoing.filter((target) => !lines.some((line) => line.includes(`[[${target}]]`)));
  if (extra.length)
    lines.push('', `Related: ${extra.map((target) => `[[${target}]]`).join(', ')}.`);
  return `${lines.join('\n')}\n`;
}

function vault() {
  const { titles, edges } = vaultGraph();
  const notes = titles.map((title) => {
    const text = noteBody(title, edges);
    const excerpt = text
      .split('\n')
      .filter((line) => line && !line.startsWith('#') && !line.startsWith('|'))
      .join(' ')
      .replace(/\[\[([^\]]+)\]\]/gu, '$1')
      .slice(0, 160);
    return {
      path: notePath(title),
      revision: 'r1',
      title,
      excerpt,
      kind: 'note',
      tags: CORE_NOTES[title]?.tags ?? (title.startsWith('Site ') ? ['site'] : ['working']),
      headings: text
        .split('\n')
        .filter((line) => line.startsWith('## '))
        .map((line) => line.slice(3)),
      text,
    };
  });
  const links = edges.map(([source, target]) => ({
    source: notePath(source),
    target: notePath(target),
    kind: 'link',
    selector: '',
    status: 'resolved',
  }));
  return { notes, links };
}

// --- Science log ----------------------------------------------------------------

function scienceStudy(sessionId, asSession, view) {
  const entry = (minute, id, branch, type, fields, links = [], status = '', extra = {}) => ({
    id,
    study: 'e_q',
    branch,
    session: branch,
    type,
    fields,
    links: links.map(([relation, to]) => ({ relation, to, by: branch })),
    status,
    status_reason: extra.reason ?? null,
    created_at: at(minute),
    invocation: `call_${id}`,
  });
  return {
    session_id: asSession,
    in_study: true,
    study: 'e_q',
    root_session_id: sessionId,
    branches: [
      {
        session_id: sessionId,
        title: 'Opal soil moisture',
        agent: 'main',
        relation: 'root',
        parent_session_id: '',
        fork_of_session_id: '',
        workflow_step: '',
        node_folder: 'study/opal',
        handle: 'opal',
        task_status: 'running',
        note: '',
      },
      {
        session_id: DROUGHT,
        title: 'Drought',
        agent: 'main',
        relation: 'fork',
        parent_session_id: sessionId,
        fork_of_session_id: sessionId,
        workflow_step: '',
        node_folder: 'study/opal/drought',
        handle: 'opal-drought',
        task_status: 'completed',
        note: 'Test the drought explanation against PRISM rainfall.',
      },
      {
        session_id: DRIFT,
        title: 'Sensor drift',
        agent: 'main',
        relation: 'fork',
        parent_session_id: sessionId,
        fork_of_session_id: sessionId,
        workflow_step: '',
        node_folder: 'study/opal/drift',
        handle: 'opal-drift',
        task_status: 'completed',
        note: 'Check the SCAN probes against their 2021 calibration.',
      },
      {
        session_id: NDP,
        title: 'NDP explorer',
        agent: 'ndp-explorer',
        relation: 'delegated',
        parent_session_id: sessionId,
        fork_of_session_id: '',
        workflow_step: '',
        node_folder: '',
        handle: 'ndp-explorer',
        task_status: 'completed',
        note: '',
      },
    ],
    entries: [
      entry(1, 'e_q', sessionId, 'question', {
        statement: 'Was 2022 below baseline?',
        context: 'Summer soil moisture at the 412 Opal sites against the 2015 to 2021 baseline.',
      }),
      entry(
        2,
        'h_drought',
        DROUGHT,
        'hypothesis',
        {
          claim: 'Drought, not sensor drift',
          prediction: 'The dip is regional and follows the rainfall deficit.',
        },
        [['addresses', 'e_q']],
        'supported',
      ),
      entry(
        3,
        'h_drift',
        DRIFT,
        'hypothesis',
        {
          claim: 'SCAN sensors drifted',
          prediction: 'The dip is confined to probes past their calibration date.',
        },
        [['addresses', 'e_q']],
        'refuted',
        { reason: 'Calibration residuals stay within 0.005 m³/m³ at every probe.' },
      ),
      entry(
        4,
        'e_exp_regrid',
        sessionId,
        'experiment',
        {
          method: 'Regrid SMAP and compare',
          design: 'Regrid SMAP L3 to 0.25°, average Jun to Aug per year, difference from baseline.',
        },
        [
          ['tests', 'h_drought'],
          ['tests', 'h_drift'],
        ],
        'running',
      ),
      entry(
        5,
        'e_obs_dip',
        sessionId,
        'observation',
        {
          result: '2022 is 0.04 below baseline',
          measurements: [
            {
              metric: 'soil moisture',
              value: -0.04,
              unit: 'm³/m³',
              conditions: '412 sites, Jun to Aug',
              source: 'regrid.py run',
            },
          ],
          artifacts: [
            {
              direction: 'script',
              path: 'scripts/regrid.py',
              call_id: 'call_regrid',
              artifact_id: '',
              sha256: '7f3c9b2e',
            },
            {
              direction: 'used',
              path: 'ndp/soil_moisture.h5',
              call_id: 'call_regrid',
              artifact_id: '',
              sha256: 'a41d07c5',
            },
            {
              direction: 'generated',
              path: 'figures/baseline_plot.png',
              call_id: 'call_regrid',
              artifact_id: '',
              sha256: 'c9e8113a',
            },
          ],
          lineage: [
            {
              call_id: 'call_regrid',
              tool: 'bash',
              args: { command: 'python scripts/regrid.py --res 0.25 --months 6-8' },
              started_at: at(5),
              completed_at: at(6),
              result_sha256: '5b0e4f19',
              session: sessionId,
            },
          ],
          derived_from: ['e_obs_granules'],
        },
        [['experiment', 'e_exp_regrid']],
      ),
      entry(
        6,
        'e_exp_fetch',
        NDP,
        'experiment',
        {
          method: 'Fetch SMAP L3 from NDP',
          design: 'Daily granules, 2020 to 2023, Opal bounding box.',
        },
        [['serves', 'e_exp_regrid']],
      ),
      entry(
        7,
        'e_obs_granules',
        NDP,
        'observation',
        {
          result: '1,462 SMAP L3 granules',
          measurements: [
            {
              metric: 'granules',
              value: 1462,
              unit: '',
              conditions: '2020 to 2023',
              source: 'ndp search',
            },
          ],
        },
        [['experiment', 'e_exp_fetch']],
      ),
      entry(
        8,
        'e_exp_precip',
        DROUGHT,
        'experiment',
        {
          method: 'Compare PRISM precipitation anomaly',
          design: 'Jun to Aug 2022 against 1991 to 2020 normals.',
        },
        [['tests', 'h_drought']],
      ),
      entry(
        9,
        'e_obs_precip',
        DROUGHT,
        'observation',
        {
          result: 'Jun–Aug rainfall 38% below normal',
          measurements: [
            {
              metric: 'precipitation anomaly',
              value: -38,
              unit: '%',
              conditions: 'Opal box, Jun to Aug 2022',
              source: 'PRISM monthly',
            },
          ],
        },
        [['experiment', 'e_exp_precip']],
      ),
      entry(
        10,
        'e_ev_precip',
        DROUGHT,
        'evidence',
        { interpretation: 'The rainfall deficit covers the same months and sites as the dip.' },
        [
          ['supports', 'h_drought'],
          ['cites', 'e_obs_precip'],
        ],
      ),
      entry(
        11,
        'e_obs_calib',
        DRIFT,
        'observation',
        {
          result: 'Probe calibration within tolerance',
          measurements: [
            {
              metric: 'calibration residual',
              value: 0.005,
              unit: 'm³/m³',
              conditions: '103 SCAN probes',
              source: 'calibration check',
            },
          ],
        },
        [['refutes', 'h_drift']],
      ),
      entry(
        12,
        'e_obs_baseline',
        sessionId,
        'observation',
        {
          result: 'Baseline summer mean 0.27 m³/m³',
          measurements: [
            {
              metric: 'soil moisture',
              value: 0.27,
              unit: 'm³/m³',
              conditions: '2015 to 2021, Jun to Aug',
              source: 'regrid.py run',
            },
          ],
        },
        [['baseline for', 'e_q']],
      ),
      entry(
        13,
        'e_view',
        sessionId,
        'view',
        { title: 'Opal sites', purpose: 'Stations, granules and the 2022 anomaly at a glance.' },
        [['serves', 'e_q']],
      ),
      entry(
        14,
        'e_concl',
        sessionId,
        'conclusion',
        {
          claims: [
            {
              text: 'The 2022 dip is drought',
              cites: ['e_obs_dip', 'e_ev_precip'],
            },
          ],
          answers: 'e_q',
        },
        [['supports', 'h_drought']],
      ),
    ],
    views: [view],
  };
}

// --- Routes ---------------------------------------------------------------------

export function createScienceViewsFixture({
  sendJson,
  commonHeaders,
  sessionId,
  workspaceId,
  readyResource,
  observedAt,
}) {
  let enabled = false;
  const report = dashboardReport(sessionId);
  const dashboardBytes = Buffer.from(JSON.stringify(report), 'utf8');
  const texBytes = Buffer.from(TEX, 'utf8');
  const sourcesBytes = Buffer.from(SOURCES_TEX, 'utf8');
  const pdfBytes = paperPdf();
  const { notes, links } = vault();
  const record = (id, name, kind, size, producer, path = '') => ({
    workspace_id: workspaceId,
    name,
    kind,
    latest_version: 1,
    head_artifact_id: id,
    aliases: {},
    producing_session_ids: [sessionId],
    versions: [
      {
        artifact_id: id,
        workspace_id: workspaceId,
        name,
        version: 1,
        kind,
        custody: 'fixture',
        mechanism: 'fixture_capture',
        evidence_class: 'test_owned',
        sha256: `fixture-${id}-v1`,
        size_bytes: size,
        created_at: observedAt,
        producer: { session_id: sessionId, ...producer },
        uri: `artifact://${id}@v1`,
        fetch_url: `/v1/artifacts/${id}/bytes`,
        ...(path ? { path } : {}),
      },
    ],
  });
  const artifacts = {
    [DASHBOARD_ARTIFACT]: {
      record: record(
        DASHBOARD_ARTIFACT,
        'opal-sites.dashboard.json',
        'application/json',
        dashboardBytes.length,
        {
          designation: 'dashboard-report',
          title: 'Opal sites',
        },
      ),
      bytes: dashboardBytes,
      type: 'application/json',
    },
    [TEX_ARTIFACT]: {
      record: record(TEX_ARTIFACT, 'opal_paper.tex', 'text/x-tex', texBytes.length, {}, TEX_PATH),
      bytes: texBytes,
      type: 'text/x-tex',
    },
    [PDF_ARTIFACT]: {
      record: record(
        PDF_ARTIFACT,
        'opal_paper.pdf',
        'application/pdf',
        pdfBytes.length,
        {
          designation: 'latex-build',
        },
        PDF_PATH,
      ),
      bytes: pdfBytes,
      type: 'application/pdf',
    },
  };
  const commentTarget = (id) => {
    const version = artifacts[id].record.versions[0];
    return {
      artifact_id: id,
      name: version.name,
      workspace_id: workspaceId,
      version: 1,
      sha256: version.sha256,
      path: version.path,
      producer: version.producer,
    };
  };
  const files = {
    [TEX_PATH]: { type: 'text/x-tex', bytes: texBytes },
    [SOURCES_PATH]: { type: 'text/x-tex', bytes: sourcesBytes },
    [PDF_PATH]: { type: 'application/pdf', bytes: pdfBytes },
  };
  const view = {
    entry: 'e_view',
    session_id: sessionId,
    surface_id: report.surface.id,
    title: 'Opal sites',
    purpose: 'Stations, granules and the 2022 anomaly at a glance.',
    serves: ['e_q'],
    created_at: at(13),
    surface: report.surface,
    reason: null,
    kind: 'dashboard',
    dashboard_id: DASHBOARD_ID,
    artifact_id: DASHBOARD_ARTIFACT,
    read_only: false,
  };
  const source = {
    id: VAULT_ID,
    label: 'Opal vault',
    provider: 'obsidian',
    source_kind: 'knowledge',
    connection: 'local_vault',
    root: 'D:\\science\\vaults\\Opal',
    owner: { clio_id: 'clio_fixture', host_id: 'host_fixture' },
    capabilities: {
      browse: true,
      download: false,
      note_read: true,
      note_relations: true,
      note_search: true,
      search: true,
      supported_modes: ['read_only'],
      unavailable_reasons: {},
    },
    local_path: null,
    materialization: 'ready',
    mode: 'read_only',
    operation_id: null,
    revision: 'rev1',
    schema_version: 1,
    workspace_id: workspaceId,
    connected: true,
    authenticated: true,
    access_without_signin: true,
    configuration: {},
    linked: true,
    link_access: 'read_only',
  };
  const sources = `/v1/workspaces/${workspaceId}/sources`;
  const vaultRoot = `${sources}/${VAULT_ID}`;
  const publicNote = ({ text: _text, ...note }) => note;
  const snapshot = (url, max) => {
    const query = (url.searchParams.get('query') ?? '').trim().toLowerCase();
    const focus = url.searchParams.get('focus') ?? '';
    let shown = notes;
    if (focus) {
      const near = new Set([focus]);
      for (const link of links) {
        if (link.source === focus) near.add(link.target);
        if (link.target === focus) near.add(link.source);
      }
      shown = shown.filter((note) => near.has(note.path));
    }
    if (query)
      shown = shown.filter(
        (note) =>
          note.title.toLowerCase().includes(query) || note.text.toLowerCase().includes(query),
      );
    const offset = Number(url.searchParams.get('offset') ?? 0) || 0;
    const limit = Math.min(Number(url.searchParams.get('limit') ?? max) || max, max);
    const page = shown.slice(offset, offset + limit);
    const paths = new Set(shown.map((note) => note.path));
    return {
      source_id: VAULT_ID,
      revision: 'rev1',
      state: 'ready',
      notes: page.map(publicNote),
      links: links.filter((link) => paths.has(link.source) && paths.has(link.target)),
      total: shown.length,
      offset,
      next_offset: offset + limit < shown.length ? offset + limit : null,
      truncated: false,
      relationships_truncated: false,
    };
  };
  const bytes = (response, type, body) => {
    response.writeHead(200, { ...commonHeaders(type), 'Content-Length': String(body.length) });
    response.end(body);
  };
  const notFound = (response, code, message) =>
    sendJson(response, { error: { code, message } }, 404);

  return {
    reset() {
      enabled = false;
    },
    /** The session's artifacts list gains the saved dashboard while the views are on. */
    artifacts() {
      return enabled ? [artifacts[DASHBOARD_ARTIFACT].record] : [];
    },
    /** The workspace file list gains the paper folder while the views are on. */
    files() {
      return enabled
        ? [
            { path: 'paper', type: 'dir' },
            { path: 'paper/sections', type: 'dir' },
            { path: TEX_PATH, type: 'file', size: texBytes.length },
            { path: SOURCES_PATH, type: 'file', size: sourcesBytes.length },
            { path: PDF_PATH, type: 'file', size: pdfBytes.length },
          ]
        : [];
    },
    /** Unknown artifacts, as the service answers them (after every specific artifact route). */
    fallback(request, response, url) {
      if (request.method !== 'GET') return false;
      const match = url.pathname.match(/^\/v1\/artifacts\/([^/]+)(\/latex(?:\/locate)?)?$/u);
      if (!match) return false;
      notFound(
        response,
        'artifact_not_found',
        `Artifact ${decodeURIComponent(match[1])} was not found.`,
      );
      return true;
    },
    async handle(request, response, url) {
      const { pathname } = url;
      const get = request.method === 'GET';
      if (request.method === 'POST' && pathname === '/__test/science-views') {
        enabled = true;
        sendJson(response, { enabled }, 202);
        return true;
      }

      // Saved dashboards answer for every session.
      const dashboards = pathname.match(
        /^\/v1\/sessions\/([^/]+)\/dashboards(?:\/([^/]+)(\/export)?)?$/u,
      );
      if (dashboards) {
        const [, session, id, exporting] = dashboards;
        const ours =
          enabled && session === sessionId && (id === DASHBOARD_ARTIFACT || id === DASHBOARD_ID);
        if (!id && get) {
          sendJson(
            response,
            enabled && session === sessionId
              ? [
                  {
                    id: DASHBOARD_ID,
                    title: report.title,
                    created_at: report.created_at,
                    artifact_id: DASHBOARD_ARTIFACT,
                  },
                ]
              : [],
          );
          return true;
        }
        if (id && !exporting && get) {
          if (ours) sendJson(response, report);
          else notFound(response, 'dashboard_not_found', `Dashboard ${id} was not found.`);
          return true;
        }
        if (id && exporting && request.method === 'POST') {
          if (ours)
            sendJson(
              response,
              {
                error: {
                  code: 'export_unavailable',
                  message: 'Dashboard export is not available in this demo.',
                },
              },
              503,
            );
          else notFound(response, 'dashboard_not_found', `Dashboard ${id} was not found.`);
          return true;
        }
        return false;
      }

      if (!enabled) return false;

      const log = pathname.match(/^\/v1\/sessions\/([^/]+)\/science-log$/u);
      if (log && get && [sessionId, DROUGHT, DRIFT, NDP].includes(log[1])) {
        sendJson(response, scienceStudy(sessionId, log[1], view));
        return true;
      }

      const artifact = pathname.match(/^\/v1\/artifacts\/([^/]+)(\/.*)?$/u);
      if (artifact && get && artifacts[artifact[1]]) {
        const [, id, rest = ''] = artifact;
        const item = artifacts[id];
        if (rest === '') {
          sendJson(response, { artifact: item.record, resolved: item.record.versions[0] });
          return true;
        }
        if (rest === '/bytes' || rest === '/document/content') {
          bytes(response, item.type, item.bytes);
          return true;
        }
        if (rest === '/latex' && id === TEX_ARTIFACT) {
          sendJson(response, latexReport());
          return true;
        }
        if (rest === '/latex/locate' && id === TEX_ARTIFACT) {
          sendJson(response, locate(url));
          return true;
        }
        if (rest === '/threads') {
          sendJson(response, {
            artifact_id: id,
            head: commentTarget(id),
            next_label: '1',
            threads: [],
          });
          return true;
        }
        return false;
      }

      if (get && pathname === `/v1/workspaces/${workspaceId}/comment-targets`) {
        const path = url.searchParams.get('path') ?? '';
        const id = path === TEX_PATH ? TEX_ARTIFACT : path === PDF_PATH ? PDF_ARTIFACT : '';
        sendJson(response, { artifact: id ? commentTarget(id) : null });
        return true;
      }
      if (get && pathname === `/v1/workspaces/${workspaceId}/files/read`) {
        const file = files[url.searchParams.get('path') ?? ''];
        if (!file) return false;
        bytes(response, file.type, file.bytes);
        return true;
      }

      if (get && pathname === '/v1/storage/obsidian') {
        sendJson(response, {
          installed: true,
          version: '1.8.0',
          state: 'ready',
          message: '',
          authenticated: false,
        });
        return true;
      }
      if (get && pathname === '/v1/storage/obsidian/vaults') {
        sendJson(response, { vaults: [{ id: 'vault_opal', name: 'Opal' }] });
        return true;
      }
      if (get && pathname === '/v1/storage/providers') {
        sendJson(response, { clio_id: 'clio_fixture', host_id: 'host_fixture', providers: [] });
        return true;
      }
      if (get && pathname === sources) {
        sendJson(response, { sources: [source] });
        return true;
      }
      if (!pathname.startsWith(`${vaultRoot}/`) && pathname !== vaultRoot) return false;
      const rest = pathname.slice(vaultRoot.length);
      if (get && rest === '') {
        sendJson(response, source);
        return true;
      }
      if (get && rest === '/knowledge/graph') {
        sendJson(response, snapshot(url, 5000));
        return true;
      }
      if (get && rest === '/knowledge') {
        sendJson(response, snapshot(url, 500));
        return true;
      }
      if (request.method === 'POST' && rest === '/knowledge/open') {
        let body = '';
        for await (const chunk of request) body += chunk;
        const path = (body ? JSON.parse(body) : {}).path ?? '';
        const note = notes.find((row) => row.path === path);
        if (!note) {
          notFound(response, 'note_not_found', `${path} is not in this vault.`);
          return true;
        }
        sendJson(response, {
          source_id: VAULT_ID,
          note: publicNote(note),
          text: note.text,
          properties: { tags: note.tags },
          resource: {
            ...readyResource,
            id: `res_note_${notes.indexOf(note)}`,
            name: `${note.title}.md`,
            claimed_mime: 'text/markdown',
            detected_mime: 'text/markdown',
            declared_size: Buffer.byteLength(note.text),
            received_size: Buffer.byteLength(note.text),
          },
          links: links.filter((link) => link.source === path || link.target === path),
          relationships_truncated: false,
          link_revision: 'rev1',
          access: 'read_only',
        });
        return true;
      }
      if (get && rest === '/knowledge/sync') {
        sendJson(response, {
          state: 'stopped',
          mode: 'pull-only',
          connection: 'local_vault',
          error: null,
        });
        return true;
      }
      if (get && rest === '/operations') {
        sendJson(response, { operations: [] });
        return true;
      }
      if (request.method === 'POST' && rest === '/browse') {
        sendJson(response, {
          source_id: VAULT_ID,
          entries: notes.slice(0, 20).map((note) => ({
            path: note.path,
            kind: 'file',
            size: Buffer.byteLength(note.text),
            revision: 'r1',
          })),
          next_offset: null,
        });
        return true;
      }
      if (get && rest === '/mapping-options') {
        sendJson(response, {
          link_access: ['read_only'],
          reason: 'The vault is linked read only.',
          write_permission: false,
        });
        return true;
      }
      return false;
    },
  };
}
