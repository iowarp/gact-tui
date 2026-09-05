import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const requiredImports = {
  'web/src/components/clio/conversation.tsx': [
    '@/components/ai-elements/conversation',
    '@/components/ai-elements/message',
    './conversation-message-blocks',
  ],
  'web/src/components/clio/conversation-message-blocks.tsx': [
    '@/components/ai-elements/code-block',
    '@/components/ai-elements/plan',
    './artifact-card',
    './grounded-message-response',
    './conversation-process-sequence',
  ],
  'web/src/components/clio/conversation-process-sequence.tsx': [
    '@/components/ai-elements/reasoning',
    '@/components/ai-elements/task',
    './grounded-message-response',
    './subagent-card',
    './tool-invocation',
  ],
  // Chain mode moved to ConversationTurn; the ChainOfThought composition is required there.
  'web/src/components/clio/conversation-turn.tsx': [
    '@/components/ai-elements/chain-of-thought',
    '@/components/ai-elements/reasoning',
    './grounded-message-response',
    './subagent-card',
    './tool-invocation',
  ],
  'web/src/components/clio/grounded-message-response.tsx': [
    '@/components/ai-elements/message',
    '@/components/ai-elements/sources',
  ],
  'web/src/components/clio/composer.tsx': [
    '@/components/ai-elements/model-selector',
    '@/components/ai-elements/prompt-input',
  ],
  'web/src/components/clio/tool-invocation.tsx': ['@/components/ai-elements/tool'],
  'web/src/components/clio/artifact-card.tsx': [
    '@/components/ai-elements/artifact',
    '@/components/ai-elements/attachments',
  ],
  'web/src/components/clio/resource-viewers.tsx': ['@/components/ai-elements/code-block'],
  'web/src/components/clio/subagent-card.tsx': ['@/components/theokit/sub-agent-dispatch'],
  'web/src/components/clio/pending-interactions.tsx': ['@/components/ai-elements/confirmation'],
  'web/src/components/clio/workbench.tsx': ['@/components/ui/tabs', './workbench-resource-browser'],
  'web/src/components/clio/workbench-resource-browser.tsx': [
    '@/components/ai-elements/file-tree',
    './artifact-card',
    './resource-viewers',
  ],
  'web/src/components/clio/observability-dock.tsx': [
    '@/components/ui/tabs',
    './observability-activity',
  ],
  'web/src/components/clio/observability-activity.tsx': ['@/components/reui/timeline'],
  'web/src/components/clio/observability-evidence.tsx': [
    '@/components/ai-elements/code-block',
    '@/components/reui/frame',
    './artifact-card',
  ],
  'web/src/components/clio/inspector.tsx': [
    '@/components/ai-elements/context',
    '@/components/ai-elements/file-tree',
    '@/components/reui/timeline',
    './artifact-card',
  ],
  'web/src/components/clio/a2ui-catalog.tsx': [
    '@/components/ai-elements/confirmation',
    '@/components/reui/frame',
    './a2ui-artifact',
    './a2ui-code-view',
  ],
  'web/src/components/clio/a2ui-code-view.tsx': ['@/components/ai-elements/code-block'],
  'web/src/components/clio/a2ui-artifact.tsx': ['./artifact-card'],
  'web/src/components/clio/data-table.tsx': [
    '@/components/reui/data-grid/data-grid',
    './data-grid-table',
  ],
  'web/src/routes/runs-page.tsx': [
    '@/components/clio/data-grid-table',
    '@/components/reui/data-grid/data-grid',
  ],
  'web/src/components/clio/settings-session-defaults.tsx': ['@/components/ui/select'],
  'web/src/components/clio/settings-models.tsx': ['@/components/ui/select'],
  'web/src/components/clio/settings-prompts.tsx': [
    '@/components/ai-elements/code-block',
    '@/components/reui/frame',
  ],
  'web/src/components/clio/document-workspace.tsx': [
    '@/components/ai-elements/code-block',
    '@/components/ai-elements/message',
    '@/components/reui/timeline',
  ],
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function imports(source, moduleName) {
  const escaped = escapeRegExp(moduleName);
  return (
    new RegExp(`from\\s+['"]${escaped}['"]`, 'u').test(source) ||
    new RegExp(`import\\(\\s*['"]${escaped}['"]\\s*\\)`, 'u').test(source)
  );
}

const failures = [];
for (const [relativePath, modules] of Object.entries(requiredImports)) {
  const source = readFileSync(resolve(root, relativePath), 'utf8');
  for (const moduleName of modules) {
    if (!imports(source, moduleName)) failures.push(`${relativePath}: missing ${moduleName}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  console.error(
    'A major CLIO surface lost its sourced component composition. Update the surface or document and review a deliberate replacement before changing this ratchet.',
  );
  process.exitCode = 1;
} else {
  const surfaceCount = Object.keys(requiredImports).length;
  console.log(`Frontend component-reuse ratchet passed (${surfaceCount} major surfaces).`);
}
