/**
 * Demo/fixture data (demo) for offline rendering and visual tests; not used against a live backend.
 */
import type { Message, PermissionRequest } from '@clio/core';
import type { SidebarSession } from '../components/Sidebar.js';
import { demoMessagesByName } from './demoMessages.js';
import { demoPermission } from './demoPermission.js';
import { demoSessions } from './demoSessions.js';

export interface DemoFixtures {
  sessions: SidebarSession[];
  byName: Record<string, Message[]>;
  permission: PermissionRequest;
}

export function fixturesForDemo(): DemoFixtures {
  return {
    sessions: demoSessions(),
    byName: demoMessagesByName(),
    permission: demoPermission(),
  };
}
