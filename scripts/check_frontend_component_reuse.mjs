import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

const requiredImports = {
  'web/src/components/clio/conversation.tsx': [
    '@/components/ai-elements/conversation',
    './conversation-message-row',
  ],
  // The per-message Message/MessageContent/MessageActions composition moved
  // here when conversation.tsx was split by behavior (2026-09-12); the
  // sourced component is still composed, just from this file now.
  'web/src/components/clio/conversation-message-row.tsx': ['@/components/ai-elements/message'],
  'web/src/components/clio/conversation-message-blocks.tsx': [
    '@/components/ai-elements/plan',
    './artifact-card',
    './transcript-text-block',
    './conversation-process-sequence',
  ],
  // The transcript's diff card moved here from conversation-message-blocks.
  'web/src/components/clio/transcript-diff-card.tsx': ['@/components/ai-elements/code-block'],
  // Source text rendering now owns the stable part/revision selection binding.
  'web/src/components/clio/transcript-text-block.tsx': [
    './grounded-message-response',
    './sent-reference-message',
    './streaming-text',
  ],
  // RC1 transcript: a task is one activity row with its detail in the opened body.
  'web/src/components/clio/conversation-process-sequence.tsx': [
    './transcript-task-row',
    './grounded-message-response',
    './transcript-reasoning-passage',
    './transcript-reasoning',
    './subagent-card',
    './tool-invocation',
  ],
  // Chain mode moved to ConversationTurn. RC1 transcript: a step's activity reads as
  // flat activity rows (no fold header), so ChainOfThought is no longer composed here.
  'web/src/components/clio/conversation-turn.tsx': [
    './transcript-iteration-text',
    './subagent-card',
    './tool-invocation',
  ],
  // Both modes and residual blocks share full reasoning passages. The October 10
  // review deliberately replaces preview disclosures with grounded prose while
  // retaining original selection bindings and the sourced MessageResponse chain.
  'web/src/components/clio/transcript-iteration-text.tsx': [
    './transcript-reasoning-passage',
    './transcript-reasoning',
    './grounded-message-response',
  ],
  'web/src/components/clio/transcript-reasoning-passage.tsx': [
    './transcript-reasoning',
    './grounded-message-response',
  ],
  'web/src/components/clio/tool-details-content.tsx': [
    '@/components/ui/collapsible',
    './result-dialog-content',
  ],
  'web/src/components/clio/grounded-message-response.tsx': [
    '@/components/ai-elements/message',
    '@/components/ai-elements/sources',
  ],
  'web/src/components/clio/composer.tsx': ['@/components/ai-elements/prompt-input'],
  'web/src/components/clio/composer-model-control.tsx': ['./composer-model-label'],
  // The composer and session defaults share the provider/model trigger so both
  // names retain space and the sourced logo, button and tooltip stay composed.
  'web/src/components/clio/composer-model-label.tsx': [
    '@/components/ai-elements/model-selector',
    '@/components/ui/button',
    '@/components/ui/tooltip',
  ],
  // RC1 transcript: the ⓘ dialog follows the spec's technical-details layout on the shared
  // dialog frame and facts grid: line-numbered code and a terminal tail for an error.
  'web/src/components/clio/tool-technical-details.tsx': [
    './primitives/dialog-frame',
    './primitives/key-value-grid',
    './json-line',
  ],
  'web/src/components/clio/artifact-card.tsx': [
    '@/components/ai-elements/artifact',
    '@/components/ai-elements/attachments',
  ],
  // Text-file rendering moved to the shared file-text-view (#681), which composes
  // CodeBlock and renders Markdown through content-markdown's MessageResponse.
  'web/src/components/clio/resource-viewers.tsx': ['./file-text-view'],
  'web/src/components/clio/file-text-view.tsx': [
    '@/components/ai-elements/code-block',
    './content-markdown',
  ],
  'web/src/components/clio/content-markdown.tsx': ['@/components/ai-elements/message'],
  // RC1 transcript: a delegation is one activity row, not a dispatch card.
  'web/src/components/clio/subagent-card.tsx': ['./activity-row'],
  // RC1 decision cards (conversation-states v24) deliberately replace the
  // Queue pager and Button/Select scope picker: every docked decision is one
  // AskCard with numbered scope buttons and an in-card pager. AskCard owns the
  // sourced Button and TechnicalDetails composition. Reviewed side by side
  // against the spec in light/dark at 1280 and 768.
  'web/src/components/clio/pending-interactions.tsx': ['./ask-card-keys', './permission-response'],
  'web/src/components/clio/permission-response.tsx': ['./ask-card'],
  'web/src/components/clio/ask-card.tsx': ['@/components/ui/button', './technical-details'],
  'web/src/components/clio/workbench.tsx': ['@/components/ui/tabs', './workbench-list-column'],
  'web/src/components/clio/workbench-list-column.tsx': ['./workbench-resource-browser'],
  'web/src/components/clio/workbench-tab-content.tsx': ['./workbench-resource-browser'],
  // The Files list is a windowed flat tree built from the file-tree row parts.
  'web/src/components/clio/workbench-file-tree.tsx': ['@/components/ai-elements/file-tree'],
  'web/src/components/clio/workbench-resource-browser.tsx': [
    './workbench-file-tree',
    './artifact-card',
    './resource-viewers',
  ],
  'web/src/components/clio/observability-dock.tsx': [
    '@/components/ui/tabs',
    './observability-activity',
  ],
  // web/src/components/clio/observability-activity.tsx has no entry here:
  // ClioActivityTimeline replaced the reui Timeline row-list with a bespoke
  // git-style causal graph (SVG connector paths across stable agent-strand
  // lanes); Timeline's linear-item model can't represent concurrent strands,
  // so no sourced component composes this view (reviewed 2026-09-12).
  // a2ui-catalog.tsx moved to web/src/lib/a2ui/kernel-catalog.tsx
  // (docs/design/a2ui-compat-campaign-2026-09.md S6): the registry-driven
  // catalog wiring lives beside the DOM-free registry it feeds, not under
  // components/clio.
  // G16 deliberately removed the nested ReUI Frame here: the generated
  // surface already owns its visual boundary, and Frame/Grid now use type
  // hierarchy without adding another card around every child.
  'web/src/lib/a2ui/kernel-catalog.tsx': [
    '@/components/ai-elements/confirmation',
    '@/components/clio/a2ui-artifact',
    '@/components/clio/a2ui-code-view',
  ],
  'web/src/components/clio/a2ui-code-view.tsx': ['@/components/ai-elements/code-block'],
  'web/src/components/clio/a2ui-artifact.tsx': ['./artifact-card'],
  'web/src/components/clio/data-table.tsx': [
    '@/components/reui/data-grid/data-grid',
    './data-grid-table',
  ],
  // File tables (CSV, TSV, JSON records) use the dense spec grid: a line-number
  // gutter and one virtualized scroll instead of the paginated card table.
  'web/src/components/clio/csv-view.tsx': ['./file-data-grid'],
  'web/src/components/clio/file-data-grid.tsx': ['./primitives/dense-grid'],
  // RC1 S4 deliberately replaces the runs DataGrid with grouped rows on the
  // shared ListRow primitive (fixed status/source/workspace/state/time columns,
  // details in a popover) so runs align with the conversation rail and bell.
  // Reviewed at 1680/1280/1024/768 in light and dark (docs/design/rc1-campaign.md).
  'web/src/routes/runs-page.tsx': [
    '@/components/clio/run-list-row',
    '@/components/clio/run-actions',
  ],
  'web/src/components/clio/run-list-row.tsx': ['@/components/clio/primitives/list-row'],
  // The default model is chosen through the shared Settings picker field, which names it.
  'web/src/components/clio/settings-session-defaults.tsx': [
    '@/components/ui/select',
    './model-select-field',
  ],
  // Every Settings model choice opens the shared picker through this field.
  'web/src/components/clio/model-select-field.tsx': ['./model-picker'],
  'web/src/components/clio/settings-prompt-editor.tsx': ['@/components/ai-elements/code-block'],
  // Its readable view is the shared file-text-view (#681); the LaTeX source keeps CodeBlock.
  // The ReUI Timeline of the old Reviews tab is replaced by the shared comment thread list
  // and the one comment session every viewer uses (clio-agent comments plan, rules 1 and 2;
  // the Review selection dialog and Reviews tab are deleted there).
  'web/src/components/clio/document-workspace.tsx': [
    '@/components/ai-elements/code-block',
    './comments/comment-session',
    './comments/comment-thread-list',
    './file-text-view',
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
