/** Splits a name so the tail (file name, extension or last digits) stays visible. */
export function splitForMiddleTruncation(text: string, tailLength = 14): [string, string] {
  if (text.length <= tailLength + 4) return [text, ''];
  const slash = Math.max(text.lastIndexOf('/'), text.lastIndexOf('\\'));
  const fileName = slash >= 0 ? text.slice(slash + 1) : '';
  const cut = fileName && fileName.length <= tailLength * 2 ? slash + 1 : text.length - tailLength;
  return [text.slice(0, cut), text.slice(cut)];
}
