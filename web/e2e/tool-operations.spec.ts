import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { ToolInvocation, ToolPresentationBlock } from '@clio/core/v3';

const report = (name: string) =>
  `# ${name}\n\n${'Verified the retained observations against the supplied rules. '.repeat(300)}`;
const tool = (id: string, name: string, input: unknown, output: unknown): ToolInvocation => ({
  id,
  name,
  input,
  output,
  session_id: 'parent',
  state: 'succeeded',
});
// A batch of installed skill files: they live with the app, outside every workspace.
const skillRoot =
  '/Applications/CLIO Desktop.app/Contents/Resources/gact-runtime/clio_schemas/skills/work-with-ndp';
const skillFiles = Array.from({ length: 12 }, (_, i) =>
  i % 3 === 2
    ? `catalog.json#/components/Widget${i + 1}`
    : `references/observation-guide-${i + 1}.md`,
);
const skillBatch: ToolInvocation = {
  id: 'skill',
  name: 'load_skill',
  session_id: 'parent',
  state: 'succeeded',
  input: { skill_id: 'work-with-ndp', files: skillFiles },
  presentation: {
    action: 'Read skill references',
    subject: 'skill-reference',
    summary: 'Work with NDP',
    blocks: [
      { id: 'skill-reference', type: 'text', text: `${skillFiles.length} reference files` },
      { id: 'skill-identity', type: 'text', label: 'Skill', text: 'work-with-ndp' },
      { id: 'skill-directory', type: 'text', label: 'Skill directory', text: skillRoot },
      ...skillFiles.map((file, i) => ({
        id: `skill-file-${i}`,
        type: 'link' as const,
        target: 'file' as const,
        uri: `${skillRoot}/${file.split('#')[0]}`,
        label: file,
      })),
      {
        id: 'content',
        type: 'markdown',
        text: skillFiles
          .map(
            (file, i) =>
              `=== File ${i + 1}/${skillFiles.length}: ${file} ===\n` +
              (file.startsWith('catalog')
                ? JSON.stringify({ title: `Widget ${i + 1}`, properties: { data: 'ref' } }, null, 2)
                : `# Observation guide ${i + 1}\n\n${'Compare each station window with its calibration record. '.repeat(40)}`),
          )
          .join('\n\n'),
      },
    ],
  },
};
// The finished audit child's only recorded call, served from its transcript page.
const childCall: ToolInvocation = {
  ...tool('child-read', 'fs_read_file', { path: '/workspace/observations.csv' }, 'id,value\n'),
  session_id: 'child-audit',
};

// Rendered report pages a script viewed, served as real PNG bytes from the workspace.
const pagePng = readFileSync(new URL('../tests/fixtures/gallery-sample.png', import.meta.url));
const pageSha = createHash('sha256').update(pagePng).digest('hex');
const pagePath = (i: number) => `tmp/pdfs/page-${i}.png`;
const descriptor = (i: number) =>
  `{'type': 'clio.workspace_image.v1', 'path': '${pagePath(i)}', 'media_type': 'image/png', 'size_bytes': ${pagePng.length}, 'sha256': '${pageSha}'}`;
const viewedBlock = (i: number, shown?: string) => ({
  id: 'workspace-file',
  type: 'workspace_file' as const,
  media_type: 'image/png',
  workspace_id: 'ws_review',
  path: pagePath(i),
  sha256: pageSha,
  ...(shown ? { status: 'attached_to_model', detail: shown } : {}),
});
const SCRIPT_SHOWN = "Shown to the model on its next step, with the run_code script's result.";
/** A script's run as clio-agent records it: its label, source and returned value. */
const scriptRun = (
  id: string,
  label: string,
  code: string,
  value: string,
  extra: ToolPresentationBlock[] = [],
): ToolInvocation => ({
  ...tool(id, 'run_code', { code, background: false, label }, `Value: ${value}`),
  title: 'Run code',
  presentation: {
    subject: 'target',
    summary: '',
    blocks: [
      { id: 'target', type: 'text', text: label, label },
      { id: 'script', type: 'code', text: code, label: 'Script', language: 'python' },
      { id: 'value', type: 'text', text: value, label: 'Value' },
      ...extra,
    ],
  },
});
const viewFromScript = (parent: string, i: number, overrides: Partial<ToolInvocation> = {}) => ({
  ...tool(`${parent}-view-${i}`, 'view_image', { path: pagePath(i) }, null),
  title: 'View image',
  parent_call_id: parent,
  started_at: `2026-11-01T00:00:0${i}Z`,
  duration_ms: 120,
  output: { type: 'clio.workspace_image.v1', path: pagePath(i), media_type: 'image/png' },
  presentation: { summary: '', blocks: [viewedBlock(i)] },
  ...overrides,
});
const PAGES_CODE =
  "import asyncio\nawait asyncio.gather(*(tools.view_image(path=f'tmp/pdfs/page-{i}.png') for i in range(1, 5)))";
const SHOWN_CODE = [
  'pages = []',
  'for i in (1, 2, 3):',
  '    try:',
  "        pages.append(await tools.view_image(path=f'tmp/pdfs/page-{i}.png'))",
  '    except ToolError as error:',
  '        print(error)',
  'pages',
].join('\n');
const LARGE_CODE = [
  'import json, statistics',
  'from pathlib import Path',
  '',
  "rows = json.loads(Path('data/stations.json').read_text())",
  'summary = {}',
  ...Array.from(
    { length: 30 },
    (_, i) => `summary['station_${i + 1}'] = statistics.mean(rows[${i}]['values'])`,
  ),
  'summary',
].join('\n');
const LARGE_VALUE = `{${Array.from(
  { length: 60 },
  (_, i) =>
    `'station_${i + 1}': {'mean': ${(i * 0.37).toFixed(2)}, 'flagged': ${i % 7 === 0 ? 'True' : 'False'}, 'note': None}`,
).join(', ')}}`;
const scriptTools: ToolInvocation[] = [
  // An agent that predates the "shown to the model" report (clio-agent #2272).
  scriptRun(
    'script-pages',
    'Inspect all four rendered pages',
    PAGES_CODE,
    `[${[1, 2, 3, 4].map(descriptor).join(', ')}]`,
  ),
  ...[1, 2, 3, 4].map((i) => viewFromScript('script-pages', i)),
  // An agent that attaches what a script viewed to the script's result.
  scriptRun(
    'script-shown',
    'Check the first three pages',
    SHOWN_CODE,
    `[${[1, 2].map(descriptor).join(', ')}]`,
    [1, 2].map((i) => ({ ...viewedBlock(i, SCRIPT_SHOWN), id: `attached-${i}` })),
  ),
  ...[1, 2].map((i) =>
    viewFromScript('script-shown', i, {
      output: {
        attached_to_model: true,
        delivery: 'script_result',
        parent_call_id: 'script-shown',
      },
      presentation: { summary: 'Shown to the model', blocks: [viewedBlock(i, SCRIPT_SHOWN)] },
    }),
  ),
  viewFromScript('script-shown', 3, {
    state: 'failed',
    output: { error: { reason: 'view_image_script_limit' } },
    error:
      'The script already attached the most files one result may carry; page-3.png was NOT shown to the model.',
    presentation: { summary: '', blocks: [] },
  }),
  // A direct view the model saw, and one whose file has since gone.
  {
    ...tool(
      'view-direct',
      'view_image',
      { path: pagePath(1) },
      { attached_to_model: true, delivery: 'tool_result' },
    ),
    title: 'View image',
    presentation: {
      summary: 'Shown to the model',
      blocks: [viewedBlock(1, 'Shown to the model on its next step.')],
    },
  },
  {
    ...tool('view-gone', 'view_image', { path: 'tmp/pdfs/draft.png' }, null),
    title: 'View image',
    presentation: {
      summary: '',
      blocks: [{ ...viewedBlock(1), path: 'tmp/pdfs/draft.png' }],
    },
  },
  scriptRun('script-large', 'Summarise station means', LARGE_CODE, LARGE_VALUE),
  {
    ...scriptRun(
      'script-failed',
      'Render the cover',
      "await tools.view_image(path='cover.png')",
      '',
    ),
    presentation: {
      subject: 'target',
      summary: '',
      blocks: [
        { id: 'target', type: 'text', text: 'Render the cover', label: 'Render the cover' },
        {
          id: 'script',
          type: 'code',
          text: "await tools.view_image(path='cover.png')",
          label: 'Script',
          language: 'python',
        },
      ],
    },
    state: 'failed',
    error:
      'Traceback (most recent call last):\n  File "<script>", line 1\nFileNotFoundError: cover.png',
  },
];
// Search showcases: the producer's own blocks for web and literature search, as the
// agent records them (synthetic values, real shapes).
const searched = (
  id: string,
  name: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
  presentation: ToolInvocation['presentation'],
): ToolInvocation => ({
  ...tool(id, name, input, { structuredContent: output }),
  presentation,
});
const webHits = Array.from({ length: 24 }, (_, i) => ({
  title: `Station drift study ${i + 1}: GNSS velocities across the Basin and Range`,
  url: `https://research.example.org/drift/${i + 1}`,
  date: `2026-0${(i % 9) + 1}-1${i % 10}`,
  snippet: `Velocity residuals for station ${i + 1} after removing seasonal terms. `.repeat(3),
}));
const rotatedNote = {
  id: 'note-0',
  type: 'text' as const,
  severity: 'warning' as const,
  text: 'Keenable: The search moved to the next source in the person’s order. (allowance used up) Until 18:00.',
};
const webSearch = searched(
  'web-search',
  'web_search',
  { query: 'GNSS station drift Basin and Range', limit: 24 },
  { ok: true, query: 'GNSS station drift Basin and Range', source: 'exa', results: webHits },
  {
    action: 'Search',
    subject: 'subject',
    summary: '24 results from Exa',
    blocks: [
      { id: 'subject', type: 'text', text: 'GNSS station drift Basin and Range' },
      rotatedNote,
      ...webHits.flatMap((hit, i) => [
        {
          id: `result-${i}`,
          type: 'link' as const,
          target: 'url' as const,
          uri: hit.url,
          label: hit.title,
        },
        { id: `result-${i}-snippet`, type: 'text' as const, text: `${hit.date} ${hit.snippet}` },
      ]),
      {
        id: 'payload',
        type: 'link',
        target: 'resource',
        uri: '/workspace/.clio/search/exa-answer.json',
        label: 'Full answer from the search source',
      },
    ],
  },
);
const webSearchFailed = searched(
  'web-search-failed',
  'web_search',
  { query: 'tide gauge datum change 2026' },
  {
    ok: false,
    error: {
      code: 'search_all_sources_unavailable',
      message: 'Every enabled source is cooling down or failed.',
    },
    notes: [{ code: 'search_source_allowance_used', source: 'keenable', until: '18:00' }],
  },
  {
    summary: '',
    blocks: [
      {
        id: 'content-0',
        type: 'text',
        label: 'Request failed',
        severity: 'error',
        text: 'Every enabled source is cooling down or failed.',
      },
    ],
  },
);
const pageText = `# Basin and Range GNSS network\n\n${'The network records daily positions for 412 stations. '.repeat(80)}`;
const fetchSubject = (uri: string, label: string) => ({
  id: 'subject',
  type: 'link' as const,
  target: 'url' as const,
  uri,
  label,
});
const webFetchLocal = searched(
  'fetch-local',
  'web_fetch',
  { url: 'https://network.example.org/basin' },
  {
    ok: true,
    url: 'https://network.example.org/basin',
    title: 'Basin and Range GNSS network',
    reader: 'local',
    content: pageText,
  },
  {
    action: 'Read',
    subject: 'subject',
    summary: 'Read on this computer',
    blocks: [
      fetchSubject('https://network.example.org/basin', 'Basin and Range GNSS network'),
      { id: 'content', type: 'markdown', text: pageText },
    ],
  },
);
const webFetchHosted = searched(
  'fetch-hosted',
  'web_fetch',
  { url: 'https://journal.example.org/article/88' },
  {
    ok: true,
    url: 'https://journal.example.org/article/88',
    title: 'Crustal strain from dense GNSS',
    reader: 'jina',
    content: 'Strain rates exceed 20 nanostrain per year.',
  },
  {
    action: 'Read',
    subject: 'subject',
    summary: 'Read through Jina Reader',
    blocks: [
      fetchSubject('https://journal.example.org/article/88', 'Crustal strain from dense GNSS'),
      {
        id: 'note-0',
        type: 'text',
        severity: 'warning',
        text: 'Jina Reader: The page was read through a hosted reader after a local fetch failed. (HTTP 403)',
      },
      { id: 'content', type: 'markdown', text: 'Strain rates exceed 20 nanostrain per year.' },
    ],
  },
);
const webFetchFailed = searched(
  'fetch-failed',
  'web_fetch',
  { url: 'https://archive.example.org/scan.pdf' },
  {
    ok: false,
    url: 'https://archive.example.org/scan.pdf',
    pdf_path: '/workspace/.clio/downloads/scan.pdf',
    error: {
      code: 'fetch_failed',
      message: 'The page could not be read.',
      detail: 'PDF saved; read it with view_pdf',
    },
  },
  {
    subject: 'subject',
    summary: '',
    blocks: [
      fetchSubject('https://archive.example.org/scan.pdf', 'https://archive.example.org/scan.pdf'),
      {
        id: 'content-0',
        type: 'text',
        label: 'Request failed',
        severity: 'error',
        text: 'The page could not be read. (PDF saved; read it with view_pdf)',
      },
      {
        id: 'pdf',
        type: 'link',
        target: 'resource',
        uri: '/workspace/.clio/downloads/scan.pdf',
        label: 'Saved PDF',
      },
    ],
  },
);
const work = (prefix: string, i: number, found = false) => [
  {
    id: `${prefix}-${i}`,
    type: 'link' as const,
    target: 'url' as const,
    uri: `https://doi.org/10.5555/${prefix}.${i}`,
    label: `${prefix === 'work' ? 'Interseismic' : prefix === 'references' ? 'Referenced' : 'Citing'} strain accumulation study ${i + 1}`,
  },
  {
    id: `${prefix}-${i}-cite`,
    type: 'text' as const,
    text: `Rivera et al., Journal of Geophysical Research, ${2010 + (i % 15)}, doi:10.5555/${prefix}.${i}${found ? ', found in OpenAlex, Crossref' : ''}`,
  },
];
const literatureSearch = searched(
  'literature-search',
  'literature_search',
  { query: 'interseismic strain GNSS', limit: 30 },
  {
    ok: true,
    query: 'interseismic strain GNSS',
    sources: ['openalex', 'crossref', 'arxiv'],
    works: Array.from({ length: 30 }, (_, i) => ({
      title: `Interseismic strain accumulation study ${i + 1}`,
    })),
  },
  {
    action: 'Search literature',
    subject: 'subject',
    summary: '30 works from OpenAlex, Crossref, arXiv',
    blocks: [
      { id: 'subject', type: 'text', text: 'interseismic strain GNSS' },
      {
        id: 'note-0',
        type: 'text',
        severity: 'warning',
        text: 'Semantic Scholar: A literature source failed; the others answered. (no key saved)',
      },
      ...Array.from({ length: 30 }, (_, i) => work('work', i, i % 2 === 0)).flat(),
      {
        id: 'payload',
        type: 'link',
        target: 'resource',
        uri: '/workspace/.clio/search/literature.json',
        label: 'Every work found, with full abstracts',
      },
    ],
  },
);
const literatureLookup = searched(
  'literature-lookup',
  'literature_lookup',
  { id: '10.5555/work.0', include: ['references', 'cited_by', 'versions'] },
  {
    ok: true,
    work: { title: 'Interseismic strain accumulation study 1' },
    references: [],
    cited_by: [],
    versions: [],
  },
  {
    action: 'Look up',
    subject: 'subject',
    summary: '40 references, 12 cited by, 2 other versions',
    blocks: [
      { ...work('work', 0)[0], id: 'subject' },
      work('work', 0)[1],
      {
        id: 'abstract',
        type: 'markdown',
        text: 'We estimate interseismic strain from 412 continuous stations.',
      },
      { id: 'references-heading', type: 'text', text: 'References (40)' },
      ...Array.from({ length: 40 }, (_, i) => work('references', i)).flat(),
      { id: 'cited_by-heading', type: 'text', text: 'Cited by (12)' },
      ...Array.from({ length: 12 }, (_, i) => work('cited_by', i)).flat(),
      { id: 'versions-heading', type: 'text', text: 'Other versions (2)' },
      {
        id: 'version-0',
        type: 'link',
        target: 'url',
        uri: 'https://doi.org/10.48550/arXiv.2601.0001',
        label: 'is preprint of: 10.48550/arXiv.2601.0001',
      },
      {
        id: 'version-1',
        type: 'link',
        target: 'url',
        uri: 'https://doi.org/10.5555/dataset.9',
        label: 'is supplemented by: 10.5555/dataset.9',
      },
    ],
  },
);
const fixture = {
  subagents: {
    build: {
      id: 'build',
      session_id: 'parent',
      child_session_id: 'child-build',
      title: 'Build package',
      state: 'completed',
    },
    audit: {
      id: 'audit',
      session_id: 'parent',
      child_session_id: 'child-audit',
      title: 'Independent audit',
      state: 'completed',
    },
  },
  tools: [
    tool(
      'delegate',
      'spawn_agent_task',
      {
        name: 'Independent audit',
        agent: 'standard',
        model: 'model-review',
        task: 'Check the package against the original observations.\n'.repeat(200),
      },
      { handle: 'audit', session_id: 'child-audit' },
    ),
    tool(
      'waiting',
      'wait_tasks',
      { tasks: ['build', 'audit'] },
      { outcomes: [], pending: ['build', 'audit'] },
    ),
    tool(
      'returned',
      'wait_tasks',
      { tasks: ['build', 'audit'] },
      {
        outcomes: [
          { handle: 'build', result: { answer: report('Build package report') } },
          { handle: 'audit', result: { answer: report('Independent audit report') } },
        ],
        pending: [],
      },
    ),
    tool(
      'search',
      'query_tasks',
      { query: 'calibration', scope: 'conversation', status: 'completed' },
      {
        matches: Array.from({ length: 96 }, (_, i) => ({
          name: `Calibration review ${i + 1}`,
          excerpt: `Station ${i + 1} calibration window was checked against the recorded observations.`,
        })),
      },
    ),
    tool(
      'models',
      'list_models',
      {},
      {
        models: Array.from({ length: 128 }, (_, i) => ({
          name: `Model ${i + 1}`,
          context: 32000,
          vision: i % 2 === 0,
          tools: true,
          notes: 'Recorded provider capabilities',
        })),
      },
    ),
    skillBatch,
    {
      ...tool('skill-running', 'load_skill', { skill_id: 'work-with-ndp' }, null),
      state: 'running',
    },
    {
      ...tool(
        'skill-failed',
        'load_skill',
        { skill_id: 'work-with-ndp', file: 'missing.md' },
        null,
      ),
      state: 'failed',
      error: "bundled file 'missing.md' not found in skill 'work-with-ndp'",
    },
    ...scriptTools,
    webSearch,
    webSearchFailed,
    webFetchLocal,
    webFetchHosted,
    webFetchFailed,
    literatureSearch,
    literatureLookup,
  ],
};

for (const width of [1440, 390]) {
  test(`shared operations preserve names, content and bounded disclosure at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    const requests: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__test/operation-tools', (route) => route.fulfill({ json: fixture }));
    await page.route('**/v1/**', (route) => {
      const url = new URL(route.request().url());
      requests.push(`${url.pathname}${url.search}`);
      return route.fulfill({
        json: url.pathname.endsWith('/messages') ? { messages: [], tools: [childCall] } : {},
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/tool-operations.html');
    await expect(page.getByRole('heading', { name: 'Tool operation review' })).toBeVisible();
    const row = (id: string) => page.locator(`#tool-${id}`);
    // Phone rows hide the action name; the leading disclosure opens them there.
    const opener = (id: string, label: string) =>
      row(id).getByRole('button', {
        name: width < 480 ? `Expand ${label}` : `Show result for ${label}`,
        exact: true,
      });
    const waitName = row('waiting').locator('[data-slot="tool-action-text"]');
    await expect(waitName).toHaveAttribute('aria-label', 'Show result for Wait for');
    await expect(waitName).toBeDisabled();
    await expect(row('waiting').getByRole('button', { name: /Expand/ })).toHaveCount(0);
    await expect(row('waiting')).toContainText('0 returned, 2 running');
    expect(requests).toEqual([]);
    await row('delegate').getByRole('button', { name: 'Independent audit', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText('child-audit');
    await expect(row('delegate').getByRole('region')).toHaveCount(0);
    await opener('delegate', 'Delegate').click();
    await expect(row('delegate')).toContainText(
      'Check the package against the original observations.',
    );
    // Opening a delegate reads its child's newest bounded page once: nothing is
    // read on render, and a finished child is never polled.
    await expect(
      row('delegate').getByRole('group', { name: 'Calls by Independent audit' }),
    ).toContainText('observations.csv');
    const childPage = ['/v1/sessions/child-audit/messages?limit=40'];
    expect(requests).toEqual(childPage);
    await opener('returned', 'Wait for').click();
    await expect(
      row('returned').getByRole('heading', { name: 'Build package report' }),
    ).toBeVisible();
    await row('returned').getByRole('tab', { name: 'Independent audit', exact: true }).click();
    await expect(
      row('returned').getByRole('heading', { name: 'Independent audit report' }),
    ).toBeVisible();
    await expect(
      row('returned').getByRole('heading', { name: 'Build package report' }),
    ).toHaveCount(0);
    await expect(row('returned')).not.toContainText('Return when all');
    await opener('search', 'Search tasks').click();
    await expect(row('search')).toContainText('calibration');
    await expect(row('search').getByText('Calibration review 9', { exact: true })).toHaveCount(0);
    await row('search').getByRole('button', { name: 'Next', exact: true }).click();
    await expect(row('search')).toContainText('9–16 of 96');
    await expect(row('search').getByText('Calibration review 9', { exact: true })).toBeVisible();
    await opener('models', 'Find models').click();
    await expect(row('models').getByRole('row')).toHaveCount(13);
    await expect(row('models').getByText('Model 13', { exact: true })).toHaveCount(0);
    await row('models').getByRole('button', { name: 'Next', exact: true }).click();
    await expect(row('models').getByText('Model 13', { exact: true })).toBeVisible();
    // Installed skill files open from the text this call loaded, not the workspace reader.
    await opener('skill', 'Read skill references').click();
    await row('skill').getByText('Source', { exact: true }).click();
    await row('skill').getByRole('button', { name: 'catalog.json#/components/Widget6' }).click();
    const skillFile = page.getByRole('dialog', { name: 'catalog.json#/components/Widget6' });
    await expect(skillFile).toContainText('"title": "Widget 6"');
    await expect(skillFile).not.toContainText('Widget 9');
    // Every kind of skill file gets the same copy and download actions.
    await expect(skillFile.getByRole('button', { name: 'Download catalog.json' })).toBeVisible();
    await expect(
      skillFile.getByRole('button', { name: 'Copy catalog.json#/components/Widget6' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await row('skill').getByRole('button', { name: 'references/observation-guide-11.md' }).click();
    const guide = page.getByRole('dialog', { name: 'observation-guide-11.md' });
    await expect(guide.getByRole('heading', { name: 'Observation guide 11' })).toBeVisible();
    await expect(guide.getByText('work-with-ndp › references', { exact: true })).toHaveAttribute(
      'title',
      `${skillRoot}/references/observation-guide-11.md`,
    );
    await expect(
      guide.getByRole('button', { name: 'Download observation-guide-11.md' }),
    ).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`skill-file-${width}.png`) });
    expect(await guide.evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThan(2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText('child-audit');
    await opener('skill-failed', 'Load skill').click();
    await expect(row('skill-failed')).toContainText("bundled file 'missing.md' not found");
    await expect(row('skill-running')).toContainText('Load skill');
    const info = row('returned').getByRole('button', { name: 'Technical details for Wait for' });
    await info.click();
    await expect(page.getByRole('dialog')).toContainText('"tasks"');
    await page.keyboard.press('Escape');
    await expect(info).toBeFocused();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThan(2);
    expect(
      await row('returned')
        .locator('[data-slot=transcript-tool-details]')
        .evaluateAll((nodes) => nodes.some((node) => getComputedStyle(node).overflowY === 'auto')),
    ).toBe(false);
    expect(errors).toEqual([]);
    expect(requests).toEqual(childPage);
    await page.getByRole('button', { name: 'Expand all', exact: true }).click();
    await expect(
      row('returned').getByRole('heading', { name: 'Build package report' }),
    ).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath(`operations-${width}.png`) });
  });
}

for (const width of [1440, 390]) {
  test(`a script's calls, viewed images and their reach to the model read plainly at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__test/operation-tools', (route) => route.fulfill({ json: fixture }));
    await page.route('**/v1/**', (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('/files/read')) {
        return (url.searchParams.get('path') ?? '').startsWith('tmp/pdfs/page-')
          ? route.fulfill({ body: pagePng, contentType: 'image/png' })
          : route.fulfill({ status: 404, json: { error: { code: 'not_found' } } });
      }
      return route.fulfill({ json: {} });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/tool-operations.html');
    const row = (id: string) => page.locator(`#tool-${id}`);
    const open = (id: string) =>
      row(id)
        .getByRole('button', { name: /^(Expand|Show result for) / })
        .first()
        .click();

    // An older agent: the row names what the script called and does not claim it was seen.
    const pages = row('script-pages');
    await expect(pages).toContainText('Inspect all four rendered pages');
    if (width > 480) await expect(pages).toContainText('View image ×4, not confirmed as seen');
    await open('script-pages');
    await expect(pages).toContainText('Python, 2 lines');
    await expect(pages.locator('code')).toContainText('asyncio.gather');
    // The returned descriptors read as the images, not as a Python dict.
    await expect(pages).not.toContainText("{'type': 'clio.workspace_image.v1'");
    await expect(pages.getByRole('list', { name: '4 images' }).getByRole('img')).toHaveCount(4);
    await expect(pages.getByText('4 calls from this script', { exact: true })).toBeVisible();
    for (const i of [1, 2, 3, 4]) {
      await expect(row(`script-pages-view-${i}`)).toContainText(`page-${i}.png`);
      if (width > 480) await expect(row(`script-pages-view-${i}`)).toContainText('Not confirmed');
    }
    await open('script-pages-view-1');
    await expect(row('script-pages-view-1').getByRole('img', { name: 'page-1.png' })).toBeVisible();
    await expect(row('script-pages-view-1')).toContainText('not its pixels');

    // A newer agent attaches what the script viewed; a refused view says so.
    const shown = row('script-shown');
    if (width > 480) await expect(shown).toContainText('View image ×3, 2 of 3 shown to the model');
    await open('script-shown');
    await expect(shown).toContainText('Descriptions of 2 images: page-1.png, page-2.png');
    await expect(shown.getByRole('heading', { name: 'Shown to the model' })).toBeVisible();
    await expect(shown).toContainText(
      'Shown to the model on its next step, with the run_code script’s result.',
    );
    if (width > 480)
      await expect(row('script-shown-view-3')).toContainText('Not shown to the model');
    await open('script-shown-view-3');
    await expect(row('script-shown-view-3')).toContainText('NOT shown to the model');

    // A direct view shows the image and opens it; a vanished file says so in place.
    await open('view-direct');
    await expect(row('view-direct')).toContainText(
      'Shown to the model on its next step, as this call’s result.',
    );
    await row('view-direct').getByRole('button', { name: 'Open page-1.png' }).click();
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText(
      'tmp/pdfs/page-1.png',
    );
    await open('view-gone');
    await expect(row('view-gone')).toContainText('No longer in the workspace');

    // A large returned value reads as bounded JSON; a long script folds behind Show all.
    const large = row('script-large');
    await open('script-large');
    await expect(large).toContainText('"station_1"');
    await expect(large).not.toContainText("{'station_1': {'mean'");
    await expect(large.getByRole('button', { name: 'Show all' }).first()).toBeVisible();
    await open('script-failed');
    await expect(row('script-failed').getByRole('heading', { name: 'Error' })).toBeVisible();
    await expect(row('script-failed').getByRole('alert')).toContainText(
      'FileNotFoundError: cover.png',
    );
    await expect(row('script-failed').locator('code')).toContainText(
      "tools.view_image(path='cover.png')",
    );

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThan(2);
    expect(errors).toEqual([]);
    // Code paints only on screen (content-visibility), so capture each row in view.
    for (const id of ['script-pages', 'script-shown', 'view-direct', 'script-failed']) {
      await row(id).scrollIntoViewIfNeeded();
      await row(id).screenshot({ path: test.info().outputPath(`${id}-${width}.png`) });
    }
  });
}

for (const width of [1440, 390]) {
  test(`web and literature searches read as linked, paged results at ${width}px`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/__test/operation-tools', (route) => route.fulfill({ json: fixture }));
    await page.route('**/v1/**', (route) => route.fulfill({ json: {} }));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/tests/review/tool-operations.html');
    const row = (id: string) => page.locator(`#tool-${id}`);
    const opener = (id: string, label: string) =>
      row(id).getByRole('button', {
        name: width < 480 ? `Expand ${label}` : `Show result for ${label}`,
        exact: true,
      });

    // The query is said once, with the producer's own count and source.
    await expect(row('web-search')).toContainText('for “GNSS station drift Basin and Range”');
    await expect(row('web-search')).toContainText('24 results from Exa');
    await opener('web-search', 'Search web').click();
    await expect(row('web-search')).toContainText('The search moved to the next source');
    await expect(
      row('web-search').getByRole('link', {
        name: 'Station drift study 1: GNSS velocities across the Basin and Range',
      }),
    ).toHaveAttribute('href', 'https://research.example.org/drift/1');
    await expect(row('web-search')).toContainText('1–8 of 24');
    await expect(row('web-search').getByText(/^Station drift study 9:/u)).toHaveCount(0);
    await row('web-search').getByRole('button', { name: 'Next', exact: true }).click();
    await expect(row('web-search').getByText(/^Station drift study 9:/u)).toBeVisible();
    await row('web-search')
      .getByRole('button', { name: 'Full answer from the search source' })
      .click();
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText(
      '/workspace/.clio/search/exa-answer.json',
    );

    await opener('web-search-failed', 'Search web').click();
    await expect(row('web-search-failed').getByRole('alert')).toContainText(
      'Every enabled source is cooling down or failed.',
    );

    await expect(
      row('fetch-local').getByRole('link', { name: 'Basin and Range GNSS network' }),
    ).toHaveAttribute('href', 'https://network.example.org/basin');
    await opener('fetch-local', 'Read').click();
    await expect(
      row('fetch-local').getByRole('heading', { name: 'Basin and Range GNSS network' }),
    ).toBeVisible();
    await opener('fetch-hosted', 'Read').click();
    await expect(row('fetch-hosted')).toContainText('read through a hosted reader');
    await expect(row('fetch-hosted')).toContainText('Strain rates exceed 20 nanostrain per year.');
    await opener('fetch-failed', 'Read').click();
    await expect(row('fetch-failed').getByRole('alert')).toContainText(
      'The page could not be read.',
    );
    await row('fetch-failed').getByRole('button', { name: 'Saved PDF' }).click();
    await expect(page.getByRole('region', { name: 'Opened entity' })).toHaveText(
      '/workspace/.clio/downloads/scan.pdf',
    );

    await expect(row('literature-search')).toContainText('for “interseismic strain GNSS”');
    await expect(row('literature-search')).toContainText('30 works from OpenAlex, Crossref, arXiv');
    await opener('literature-search', 'Search literature').click();
    await expect(row('literature-search')).toContainText('the others answered');
    await expect(row('literature-search')).toContainText('1–8 of 30');
    await expect(row('literature-search')).toContainText('found in OpenAlex, Crossref');

    await expect(row('literature-lookup')).toContainText(
      'Interseismic strain accumulation study 1',
    );
    await opener('literature-lookup', 'Look up').click();
    await expect(row('literature-lookup')).toContainText('References (40)');
    await expect(row('literature-lookup')).toContainText('1–8 of 40');
    await expect(row('literature-lookup')).toContainText('Cited by (12)');
    await expect(
      row('literature-lookup').getByRole('link', {
        name: 'is preprint of: 10.48550/arXiv.2601.0001',
      }),
    ).toHaveAttribute('href', 'https://doi.org/10.48550/arXiv.2601.0001');

    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThan(2);
    expect(errors).toEqual([]);
    await page.screenshot({ path: test.info().outputPath(`search-${width}.png`), fullPage: true });
  });
}
