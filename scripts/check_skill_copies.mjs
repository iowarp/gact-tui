import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// The a2ui-component-design skill is vendored twice: .claude/skills for Claude
// Code and .agents/skills for Codex. clio-schemas owns the original and runs the
// same byte-identity check on its copies; the two copies here must never drift.

const root = resolve(import.meta.dirname, '..');
const claude = resolve(root, '.claude/skills/a2ui-component-design/SKILL.md');
const codex = resolve(root, '.agents/skills/a2ui-component-design/SKILL.md');
const failures = [];

let claudeBytes;
let codexBytes;
try {
  claudeBytes = readFileSync(claude);
  codexBytes = readFileSync(codex);
} catch (error) {
  failures.push(`Both skill copies must exist: ${error.message}`);
}
if (claudeBytes && codexBytes) {
  if (!claudeBytes.equals(codexBytes)) {
    failures.push('.claude and .agents copies of a2ui-component-design/SKILL.md differ.');
  }
  const text = claudeBytes.toString('utf8');
  if (
    !text.startsWith('---\n') ||
    !text.includes('name: a2ui-component-design') ||
    !text.includes('description:')
  ) {
    failures.push(
      'a2ui-component-design/SKILL.md must start with frontmatter declaring its name and description.',
    );
  }
}

if (failures.length) {
  console.error(`Skill copy check failed:\n${failures.join('\n')}`);
  process.exit(1);
}
console.log('Skill copy check passed.');
