/**
 * Demo/fixture data (demo Messages) for offline rendering and visual tests; not used against a live backend.
 */
import type { Message } from '@clio/core';
import {
  normalDemoMessages,
  streamingDemoMessages,
  verboseDemoMessages,
} from './demoBaseMessages.js';
import { previewDemoMessages } from './demoPreviewMessages.js';
import { structuredDemoMessages } from './demoStructuredMessages.js';

export function demoMessagesByName(): Record<string, Message[]> {
  const normal = normalDemoMessages();
  const verbose = verboseDemoMessages(normal);
  return {
    normal,
    streaming: streamingDemoMessages(normal),
    verbose,
    summary: verbose,
    structured: structuredDemoMessages(),
    permission: normal,
    previews: previewDemoMessages(normal),
  };
}
