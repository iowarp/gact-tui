/** The same text without its code marks, for a tooltip or an accessible name. */
export function plainInlineCode(text: string): string {
  return text.replace(/`([^`\n]+)`/gu, '$1');
}
