/**
 * Keep shell commands in question text literal.
 *
 * MCP elicitations and tool questions are plain strings, and servers often paste
 * the command they will run after a sentence ("Command (sha256 …):\nsh -c '…'").
 * Rendered as Markdown, `$HOME"…R="$` reads as a formula, `- key:` lines become
 * bullets and line breaks collapse. This fences runs of shell lines so they render
 * as written, and escapes shell `$` in prose, while TeX in prose keeps rendering.
 */

// Words that rarely begin a prose line in lower case.
const COMMAND =
  /^(?:\$\s+)?(?:sh|bash|zsh|sudo|mkdir|printf|ssh|scp|rsync|srun|sbatch|salloc|squeue|scancel|mpirun|mpiexec|spack|jarvis|uv|uvx|pip3?|python3?|git|curl|wget|tar|chmod|grep|sed|awk|cmake|docker|apptainer|singularity)\s+\S/u;
// Words that also read as English, so they need a shell-shaped argument.
const WEAK_COMMAND =
  /^(?:\$\s+)?(?:env|exec|export|cd|echo|rm|cp|mv|ln|cat|ls|find|make|module|source|test)\s+(?:-{1,2}[A-Za-z]|["'$~/%.]|\S*[/=]\S*)/u;
const SHELL_KEYWORD =
  /^(?:(?:if|while|until)\s+(?:\[|!|test\s)|for\s+[A-Za-z_]\w*\s+in\b|case\s.+\sin$|(?:then|else|fi|do|done|esac)(?:\s*;|$))/u;
const SHELL_TEST = /^\[\[?\s/u;
const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=(?:["'$]|[^\s=])/u;
// Constructs that occur in shell but not in prose TeX.
const SHELL_SYNTAX =
  /\s\|\|\s|\d?>&\d|>\s*\/dev\/null|;;\s*$|\$\{[A-Za-z_0-9:#!?@*-]|"\$[A-Za-z_]/u;
const SHELL_DOLLAR = /(?<!\\)\$(?=\{[A-Za-z_0-9:#!?@*-])|(?<=")\$(?=[A-Za-z_])/gu;
const FENCE = /^ {0,3}(`{3,}|~{3,})/u;

function startsCommand(line: string): boolean {
  const text = line.trim();
  return (
    text.startsWith('#!') ||
    COMMAND.test(text) ||
    WEAK_COMMAND.test(text) ||
    SHELL_KEYWORD.test(text) ||
    SHELL_TEST.test(text) ||
    ASSIGNMENT.test(text)
  );
}

function isShellLine(line: string): boolean {
  return startsCommand(line) || SHELL_SYNTAX.test(line);
}

type Quote = '' | "'" | '"';

/** The quote still open after reading `line` as shell, starting inside `quote`. */
function quoteAfter(line: string, quote: Quote): Quote {
  let open = quote;
  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (open === "'") {
      if (char === "'") open = '';
    } else if (char === '\\') {
      index++;
    } else if (open === '"') {
      if (char === '"') open = '';
    } else if (char === "'" || char === '"') {
      open = char;
    } else if (char === '#' && (index === 0 || /\s/u.test(line[index - 1]))) {
      break;
    }
  }
  return open;
}

/** Escape shell `$` outside inline code spans, which already render literally. */
function escapeProse(line: string): string {
  if (/^(?: {4}|\t)/u.test(line)) return line;
  return line
    .split(/(`+[^`]*`+)/u)
    .map((part, index) => (index % 2 ? part : part.replace(SHELL_DOLLAR, '\\$')))
    .join('');
}

function fenced(lines: string[]): string[] {
  let longest = 0;
  for (const run of lines.join('\n').match(/`+/gu) ?? []) longest = Math.max(longest, run.length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return [fence, ...lines, fence];
}

/** Fence shell command lines and escape shell `$` in prose, leaving existing code alone. */
export function literalCommandText(markdown: string): string {
  const lines = markdown.split(/\r?\n/u);
  const output: string[] = [];
  let fence: string | undefined;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const marker = line.match(FENCE)?.[1];
    if (fence || marker) {
      if (!fence) fence = marker;
      else if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = undefined;
      output.push(line);
      index++;
      continue;
    }
    if (!startsCommand(line)) {
      output.push(escapeProse(line));
      index++;
      continue;
    }
    // A command keeps its following lines while a quote or a trailing backslash
    // is open (a multi-line `sh -c '…'`), and while the next lines are shell too.
    const block: string[] = [];
    let quote: Quote = '';
    while (index < lines.length) {
      const current = lines[index];
      const continues = quote !== '' || /\\$/u.test(block[block.length - 1] ?? '');
      if (block.length && !continues && (!current.trim() || !isShellLine(current))) break;
      block.push(current);
      quote = quoteAfter(current, quote);
      index++;
    }
    if (quote) {
      // A quote that never closes was an apostrophe, not a multi-line argument.
      let kept = 1;
      while (kept < block.length && block[kept].trim() && isShellLine(block[kept])) kept++;
      index -= block.length - kept;
      block.length = kept;
    }
    output.push(...fenced(block));
  }
  return output.join('\n');
}

export interface TrailingCommand {
  /** The question's text before the command. */
  prose: string;
  command: string;
  /** The digest the server named for it ("Command (sha256 bd9a?):"). */
  digest?: string;
}

const COMMAND_LEAD = /\s*Command \(sha256 ([0-9a-f]{8,64})\):\s*$/iu;

/**
 * A command the question ends with, apart from its prose: the card shows it as the
 * command block the person approves (relay's "Command (sha256 ?):" tail), not as text
 * inside the question's capped, scrolling block.
 */
export function trailingCommand(text: string): TrailingCommand | undefined {
  const fencedText = literalCommandText(text).split('\n');
  // The last line closes a fence literalCommandText opened for a command.
  const close = fencedText[fencedText.length - 1];
  if (!close || !/^`{3,}$/u.test(close)) return undefined;
  const open = fencedText.lastIndexOf(close, fencedText.length - 2);
  if (open < 0) return undefined;
  const command = fencedText.slice(open + 1, -1).join('\n');
  // A fence the producer wrote itself is Markdown, not a pasted command.
  if (!command.trim() || !text.trimEnd().endsWith(command.trimEnd())) return undefined;
  let prose = text.slice(0, text.trimEnd().length - command.trimEnd().length).trimEnd();
  const lead = prose.match(COMMAND_LEAD);
  if (lead) prose = prose.slice(0, lead.index).trimEnd();
  return { prose, command, digest: lead?.[1] };
}
