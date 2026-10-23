/**
 * Why a process environment variable name cannot be used, or '' when it can.
 * Names may hold most characters (Windows allows `ProgramFiles(x86)`), but not
 * whitespace or `=`; a name starting with `#` is a comment line pasted in.
 */
export function environmentNameProblem(name: string): string {
  if (!name) return 'needs a name';
  if (name.startsWith('#')) return 'starts with #, which marks a comment';
  if (/\s/u.test(name)) return 'contains a space';
  if (name.includes('=')) return 'contains =';
  return '';
}

/** A `# ...` line in pasted NAME=value text is a comment, not a variable. */
export function isEnvironmentComment(line: string): boolean {
  return line.trim().startsWith('#');
}
