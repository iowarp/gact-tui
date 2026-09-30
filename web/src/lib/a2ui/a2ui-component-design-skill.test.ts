import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `a2ui-component-design` skill: Claude Code and Codex copies must never
 * drift. clio-schemas is the canonical source (issue #1533); this repo
 * vendors its own copies under `.claude/skills` (Claude Code) and
 * `.agents/skills` (Codex) and runs the same byte-identity check clio-schemas
 * runs on its own originals (`tests/test_a2ui_component_design_skill.py`).
 */

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const CLAUDE_SKILL_PATH = resolve(
  REPO_ROOT,
  '.claude/skills/a2ui-component-design/SKILL.md',
);
const CODEX_SKILL_PATH = resolve(REPO_ROOT, '.agents/skills/a2ui-component-design/SKILL.md');

describe('a2ui-component-design skill', () => {
  it('exists under both the Claude Code and Codex skill directories', () => {
    expect(() => readFileSync(CLAUDE_SKILL_PATH)).not.toThrow();
    expect(() => readFileSync(CODEX_SKILL_PATH)).not.toThrow();
  });

  it('keeps the Claude Code and Codex copies byte-identical', () => {
    const claudeBytes = readFileSync(CLAUDE_SKILL_PATH);
    const codexBytes = readFileSync(CODEX_SKILL_PATH);
    expect(claudeBytes.equals(codexBytes)).toBe(true);
  });

  it('declares its frontmatter name, not an empty placeholder', () => {
    const text = readFileSync(CLAUDE_SKILL_PATH, 'utf8');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('name: a2ui-component-design');
    expect(text).toContain('description:');
  });
});
