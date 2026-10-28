/** Match absolute tool paths to the explorer's workspace-relative identities. */
export function workspaceFilePath(path: string, root?: string): string {
  const normalized = path.replace(/\\/gu, '/');
  if (!root) return normalized;
  const prefix = root.replace(/\\/gu, '/').replace(/\/+$/u, '') + '/';
  const windows = /^[a-z]:\//iu.test(prefix) || prefix.startsWith('//');
  // URL-form Windows paths may retain the slash before their drive letter.
  // Strip it only for comparison with a known Windows drive workspace, and
  // return a relative identity only after the complete root boundary matches.
  const comparable =
    /^[a-z]:\//iu.test(prefix) && /^\/[a-z]:\//iu.test(normalized)
      ? normalized.slice(1)
      : normalized;
  const candidate = windows ? comparable.toLocaleLowerCase() : comparable;
  const boundary = windows ? prefix.toLocaleLowerCase() : prefix;
  return candidate.startsWith(boundary) ? comparable.slice(prefix.length) : normalized;
}
