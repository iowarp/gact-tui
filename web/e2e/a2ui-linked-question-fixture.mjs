/** Simulated dashboard data for the real compiled workspace renderer. */
export function linkedQuestionSurface(sessionId) {
  const id = 'review-dashboard';
  const catalogId = 'https://iowarp.ai/a2ui/catalogs/clio-workspace/v1';
  return {
    id,
    session_id: sessionId,
    message_id: 'review-dashboard-message',
    part_id: 'review-dashboard-part',
    run_id: 'review-dashboard-run',
    catalog_id: catalogId,
    protocol_version: '0.9.1',
    revision: 3,
    state: 'ready',
    message_revisions: [1, 2, 3],
    messages: [
      { version: 'v0.9.1', createSurface: { surfaceId: id, catalogId } },
      {
        version: 'v0.9.1',
        updateComponents: {
          surfaceId: id,
          components: [
            { id: 'root', component: 'Column', children: ['title', 'sample', 'tabs'] },
            { id: 'title', component: 'Text', variant: 'h3', text: 'Research dashboard' },
            {
              id: 'sample',
              component: 'Text',
              text: 'Simulated review data. No files will be deleted.',
            },
            {
              id: 'tabs',
              component: 'Tabs',
              activeTab: { path: '/activeTab' },
              tabs: [
                { title: 'Overview', child: 'overview' },
                { title: 'Runs', child: 'runs' },
                { title: 'Metrics', child: 'metrics' },
                { title: 'Storage', child: 'storage' },
                { title: 'Decisions', child: 'decisions' },
              ],
            },
            { id: 'overview', component: 'Column', children: ['summary', 'project'] },
            {
              id: 'summary',
              component: 'Text',
              text: 'Keep exploring the dashboard while a decision waits.',
            },
            {
              id: 'project',
              component: 'TextField',
              label: 'Project name',
              value: { path: '/project' },
            },
            { id: 'runs', component: 'Text', text: '3 completed runs, 1 queued run.' },
            { id: 'metrics', component: 'Text', text: 'Latest run: 42 seconds.' },
            { id: 'storage', component: 'Text', text: '3 checkpoints are no longer used.' },
            {
              id: 'decisions',
              component: 'Column',
              children: ['decision-title', 'decision-detail', 'answer'],
            },
            {
              id: 'decision-title',
              component: 'Text',
              variant: 'h3',
              text: 'Delete 3 stale checkpoints?',
            },
            {
              id: 'decision-detail',
              component: 'Text',
              text: 'Review this decision here. Other tabs and draft values remain available.',
            },
            {
              id: 'answer',
              component: 'Button',
              child: 'answer-label',
              action: { event: { name: 'question.submit', context: { choice: 'keep' } } },
            },
            { id: 'answer-label', component: 'Text', text: 'Keep checkpoints' },
          ],
        },
      },
      {
        version: 'v0.9.1',
        updateDataModel: {
          surfaceId: id,
          path: '/',
          value: { project: 'Research review', activeTab: 'overview' },
        },
      },
    ],
  };
}
