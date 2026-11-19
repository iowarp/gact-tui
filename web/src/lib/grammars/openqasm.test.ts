import { type BundledLanguage, createHighlighter } from 'shiki';
import { describe, expect, it } from 'vitest';
import openqasm from './openqasm';

const SOURCE = `OPENQASM 3.0;
include "stdgates.inc";
// Bell pair
qubit[2] q;
bit[2] c;
gate bell a, b { h a; cx a, b; }
rz(pi / 4) $0;
ctrl @ x q[0], q[1];
c = measure q;`;

async function scopesOf(code: string) {
  const highlighter = await createHighlighter({ langs: [openqasm], themes: [] });
  // A custom grammar is not one of shiki's bundled names; code-block.tsx widens it the same way.
  const lang = 'openqasm' as BundledLanguage;
  const lines = highlighter.codeToTokensBase(code, { lang, includeExplanation: true });
  const scopes = new Map<string, string>();
  for (const token of lines.flat()) {
    for (const part of token.explanation ?? []) {
      const scope = part.scopes.at(-1)?.scopeName;
      if (scope && part.content.trim()) scopes.set(part.content.trim(), scope);
    }
  }
  highlighter.dispose();
  return scopes;
}

describe('OpenQASM grammar', () => {
  it('colours keywords, types, gates, constants, qubits and comments', async () => {
    const scopes = await scopesOf(SOURCE);
    expect(scopes.get('OPENQASM')).toBe('keyword.control.openqasm');
    expect(scopes.get('stdgates.inc')).toBe('string.quoted.double.openqasm');
    expect(scopes.get('// Bell pair')).toBe('comment.line.double-slash.openqasm');
    expect(scopes.get('qubit')).toBe('storage.type.openqasm');
    expect(scopes.get('bell')).toBe('entity.name.function.openqasm');
    expect(scopes.get('cx')).toBe('support.function.gate.openqasm');
    expect(scopes.get('pi')).toBe('constant.language.openqasm');
    expect(scopes.get('$0')).toBe('variable.other.constant.physical-qubit.openqasm');
    expect(scopes.get('ctrl')).toBe('storage.modifier.openqasm');
    expect(scopes.get('measure')).toBe('keyword.operator.word.openqasm');
    expect(scopes.get('3.0')).toBe('constant.numeric.openqasm');
  });

  it('leaves register names that contain a gate name plain', async () => {
    const scopes = await scopesOf('qubit[3] hx;\nh hx[0];');
    expect(scopes.get('hx')).toBe('source.openqasm');
  });
});
