import { describe, expect, it } from 'vitest';
import { literalCommandText } from './literal-command-text';

const ASK = [
  'Submit a resource_graph job? The site is guarded. Command (sha256 bd9a595bb85d83e3):',
  `sh -c 'S="$HOME"/.clio-relay/site; R="$HOME"/.clio-relay/site/root`,
  '[ -x "$JB" ] || { echo "not placed" >&2; exit 69; }',
  `printf %s '"'"'name: site_net`,
  'pkgs:',
  '- pkg_type: builtin.resource_graph',
  `'"'"' > "$S/site_net.yaml"`,
  'case "${1:-}" in',
  '  "") ;;',
  'esac',
  `' site_net debug`,
].join('\n');

describe('literalCommandText', () => {
  it('fences a pasted shell command so it renders as written', () => {
    const out = literalCommandText(ASK);
    const [prose, rest] = out.split('\n```\n');
    expect(prose).toBe(ASK.split('\n')[0]);
    expect(rest).toBe(`${ASK.split('\n').slice(1).join('\n')}\n\`\`\``);
  });

  it('leaves prose and TeX untouched', () => {
    for (const text of [
      'Run for up to five minutes and make sure the mesh is ready.',
      'The change is \\(\\Delta A\\) and $E=mc^2$ holds.',
      'It costs $5 or $10, see `uv run pytest`.',
      '```bash\nsh -c "$HOME"\n```',
    ]) {
      expect(literalCommandText(text)).toBe(text);
    }
  });

  it('escapes shell variables in prose so they are not read as math', () => {
    expect(literalCommandText('Files go under "$HOME/.clio" and "${SCRATCH}".')).toBe(
      'Files go under "\\$HOME/.clio" and "\\${SCRATCH}".',
    );
  });
});