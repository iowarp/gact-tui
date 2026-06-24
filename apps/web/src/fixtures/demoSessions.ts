/**
 * Demo/fixture data (demo Sessions) for offline rendering and visual tests; not used against a live backend.
 */
import type { SidebarSession } from '../components/Sidebar.js';

export function demoSessions(): SidebarSession[] {
  return [
    { id: 's1', title: 'refactor logger', status: 'running', project: 'gact-tui', updatedAt: '2m' },
    { id: 's2', title: 'investigate flaky test', status: 'idle', project: 'gact-tui', updatedAt: '14m' },
    { id: 's3', title: 'awaiting policy review', status: 'waiting_permission', project: 'clio-agent', updatedAt: '1m' },
    { id: 's4', title: 'finished migration', status: 'finished', project: 'clio-agent', updatedAt: '1h' },
    { id: 's5', title: 'failed compose run', status: 'error', project: 'apps', updatedAt: '6h' },
  ];
}
