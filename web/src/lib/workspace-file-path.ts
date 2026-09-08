/** Match absolute tool paths to the explorer's workspace-relative identities. */
export function workspaceFilePath(path: string, root?: string): string {
  const normalized = path.replace(/\\/gu, '/');
  if (!root) return normalized;
  const prefix = root.replace(/\\/gu, '/').replace(/\/+$/u, '') + '/';
  const windows = /^[a-z]:\//iu.test(prefix) || prefix.startsWith('//');
  const candidate = windows ? normalized.toLocaleLowerCase() : normalized;
  const boundary = windows ? prefix.toLocaleLowerCase() : prefix;
  return candidate.startsWith(boundary) ? normalized.slice(prefix.length) : normalized;
}
