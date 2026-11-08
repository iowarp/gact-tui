// Markdown rendering of a perf report: budget verdicts first, then the slowest
// interactions, the large-data scenarios and process resources.

const cell = (value) => (value === null || value === undefined ? '—' : String(value));
const verdict = (pass) => (pass === null ? 'not measured' : pass ? 'within' : '**over**');

function table(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`),
  ].join('\n');
}

function processRows(label, groups) {
  return Object.entries(groups ?? {}).map(([name, group]) => [
    label,
    name,
    group.processes,
    group.rssMB,
    group.privateMB,
  ]);
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push('# UI performance report', '');
  lines.push(
    `Generated ${report.generatedAt} at commit \`${report.commit ?? 'unknown'}\` on ${report.machine.platform}, ` +
      `${report.machine.cpus} logical CPUs, ${report.machine.memoryGB} GB, Chromium ${report.browser}. ` +
      `Viewport ${report.options.viewport.width}×${report.options.viewport.height}, ${report.options.repeat} repetition(s), ` +
      `${report.options.idleSeconds}s idle windows. Machine-readable data: \`perf-report.json\`.`,
    '',
  );
  lines.push('## Budgets', '');
  lines.push(
    table(
      ['Budget', 'Actual', 'Budget', 'Verdict'],
      report.budgets.map((row) => [
        row.label,
        row.actual === null ? null : `${row.actual} ${row.unit}`,
        `${row.budget} ${row.unit}`,
        verdict(row.pass),
      ]),
    ),
    '',
  );
  lines.push('## Interaction latency by category (web)', '');
  lines.push(
    'readyMs: input event to the first frame with the expected UI visible. eventMs: Event Timing duration (input delay + handlers + next paint).',
    '',
  );
  lines.push(
    table(
      [
        'Category',
        'n',
        'ready p50',
        'ready p95',
        'ready max',
        'event p95',
        'long tasks (ms)',
        'CLS',
      ],
      Object.entries(report.summary).map(([category, row]) => [
        category,
        row.n,
        row.readyP50,
        row.readyP95,
        row.readyMax,
        row.eventP95,
        row.longTaskMs,
        row.cls,
      ]),
    ),
    '',
  );
  const steps = Object.values(report.scenarios).flatMap((scenario) => scenario.steps ?? []);
  const measured = steps.filter((step) => step.ok && typeof step.readyMs === 'number');
  lines.push('## Slowest interactions', '');
  lines.push(
    table(
      [
        'Scenario',
        'Interaction',
        'Category',
        'ready ms',
        'event ms',
        'settle ms',
        'long tasks ms',
        'worst frame script',
        'opened',
      ],
      measured
        .slice()
        .sort((a, b) => b.readyMs - a.readyMs)
        .slice(0, 25)
        .map((step) => {
          const script = step.worstFrame?.scripts?.[0];
          return [
            step.scenario,
            step.name,
            step.category,
            step.readyMs,
            step.eventMs,
            step.settleMs,
            step.longTaskMs,
            script
              ? `${Math.round(step.worstFrame.duration)} ms ${script.invoker ?? ''}`.trim()
              : null,
            step.matched ? `\`${step.matched.replace(/\|/gu, '/')}\`` : null,
          ];
        }),
    ),
    '',
  );
  const failed = steps.filter((step) => step.ok === false || step.skipped);
  if (failed.length) {
    lines.push('## Not measured', '');
    lines.push(
      table(
        ['Scenario', 'Interaction', 'Why'],
        failed.map((step) => [step.scenario, step.name, step.skipped ?? step.reason]),
      ),
      '',
    );
  }
  const loads = steps.filter((step) => step.category === 'load');
  lines.push('## Cold loads', '');
  lines.push(
    table(
      [
        'Scenario',
        'URL',
        'FCP',
        'LCP',
        'marks (ms from navigation)',
        'long tasks',
        'heap MB (GC)',
        'DOM nodes',
      ],
      loads.map((step) => [
        step.scenario,
        `\`${step.name.replace('cold load ', '').replace(/^https?:\/\/[^/]+/u, '')}\``,
        step.fcp,
        step.lcp,
        Object.entries(step.marks ?? {})
          .map(([name, value]) => `${name} ${value}`)
          .join(', '),
        `${step.longTaskCount} / ${step.longTaskMs} ms`,
        step.heapMB,
        step.nodes,
      ]),
    ),
    '',
  );
  const huge = report.scenarios['huge-conversation'];
  if (huge) {
    lines.push(`## Huge conversation (${report.options.hugeMessages} messages)`, '');
    lines.push(
      table(
        ['Checkpoint', 'JS heap MB', 'DOM nodes'],
        [
          ['tail rendered', huge.heap.tailMB, huge.heap.tailNodes],
          ['after scrolling up', huge.heap.scrolledMB, huge.heap.scrolledNodes],
          ['after away and back', huge.heap.returnMB, huge.heap.returnNodes],
        ],
      ),
      '',
    );
    lines.push(
      table(
        [
          'Phase',
          'API requests',
          'KB',
          'unbounded transcript reads',
          'messages in unbounded reads',
        ],
        Object.entries(huge.requests).map(([phase, row]) => [
          phase,
          row.count,
          row.kb,
          row.unboundedTranscriptReads,
          row.unboundedTranscriptMessages,
        ]),
      ),
      '',
    );
  }
  const many = report.scenarios['many-sessions'];
  if (many) {
    lines.push('## Many conversations (2000 across 51 workspaces)', '');
    lines.push(
      `Sidebar rendered ${many.sidebarRows} conversation links; heap ${many.heap.MB} MB, ${many.heap.nodes} DOM nodes; ` +
        `load fetched ${many.loadRequests.count} API requests (${many.loadRequests.kb} KB).`,
      '',
    );
  }
  const files = report.scenarios['large-files'];
  if (files) {
    lines.push('## Large files (5000-entry tree, 20 MB CSV and log)', '');
    lines.push(
      `Heap ${files.heap.beforeMB} MB before, ${files.heap.afterMB} MB after opening the files (${files.heap.nodes} DOM nodes); ` +
        `${files.requests.count} API requests, ${files.requests.kb} KB.`,
      '',
    );
    const opened = files.steps.filter((step) => step.settled);
    if (opened.length) {
      lines.push(
        table(
          [
            'File',
            'content ready ms',
            'heap MB (settled, GC)',
            'DOM nodes (settled)',
            'renderer RSS MB',
          ],
          opened.map((step) => [
            step.name.replace(/^open file /u, ''),
            step.ok === false ? `failed: ${step.reason}` : (step.readyMs ?? '—'),
            step.settled.heapMB ?? '—',
            step.settled.nodes ?? '—',
            step.settled.rendererRssMB ?? '—',
          ]),
        ),
        '',
      );
    }
  }
  lines.push('## Process resources', '');
  const rows = [];
  const interactions = report.scenarios.interactions;
  if (interactions) {
    rows.push(...processRows('web idle', interactions.processes.idle));
    rows.push(...processRows('web after journeys', interactions.processes.afterJourneys));
  }
  if (huge) rows.push(...processRows('web huge conversation scrolled', huge.processes.scrolled));
  if (many) rows.push(...processRows('web 2000 conversations', many.processes.loaded));
  if (files) rows.push(...processRows('web large files', files.processes.afterFiles));
  const desktop = report.scenarios.desktop;
  if (desktop && !desktop.skipped) {
    rows.push(...processRows('desktop startup', desktop.startupProcesses));
    rows.push(...processRows('desktop idle', desktop.idleProcesses));
    rows.push(...processRows('desktop after journeys', desktop.afterJourneyProcesses));
    rows.push(...processRows('desktop huge conversation', desktop.hugeProcesses));
  }
  const live = report.scenarios.live;
  if (live) {
    rows.push(...processRows('live idle', live.processes.idle));
    rows.push(...processRows('live after journeys', live.processes.afterJourneys));
  }
  lines.push(table(['When', 'Group', 'processes', 'RSS MB', 'private MB'], rows), '');
  if (interactions) {
    lines.push(
      `Idle CPU over ${report.options.idleSeconds}s on the running fixture conversation (% of one core): ` +
        Object.entries(interactions.processes.idleCpuPercent)
          .map(([name, value]) => `${name} ${value}%`)
          .join(', ') +
        '.',
      '',
    );
  }
  if (desktop?.skipped || desktop?.error)
    lines.push(`Desktop: ${desktop.skipped ?? desktop.error}`, '');
  for (const [journey, error] of Object.entries(desktop?.journeyErrors ?? {}))
    lines.push(`Desktop ${journey} journey stopped: ${error}`, '');
  if (interactions) {
    lines.push('## Requests during cold load (interactions scenario)', '');
    lines.push(
      table(
        ['Route', 'count', 'KB'],
        interactions.loadRequests.topRoutes.map((row) => [`\`${row.route}\``, row.count, row.kb]),
      ),
      '',
    );
  }
  const errors = Object.entries(report.scenarios).flatMap(([name, scenario]) =>
    (scenario.errors ?? []).map((error) => [name, error]),
  );
  if (errors.length) {
    lines.push('## Page errors', '');
    lines.push(table(['Scenario', 'Error'], errors.slice(0, 20)), '');
  }
  return `${lines.join('\n')}\n`;
}
