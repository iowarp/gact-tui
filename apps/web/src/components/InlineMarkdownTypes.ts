/**
 * Type definitions for Inline Markdown.
 */
export type Block =
  | { kind: 'text'; body: string }
  | { kind: 'code'; lang: string | null; body: string }
  | { kind: 'heading'; level: 1 | 2 | 3; body: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'quote'; body: string }
  | { kind: 'hr' };

export interface InlineToken {
  kind: 'plain' | 'bold' | 'italic' | 'code' | 'link' | 'strike' | 'highlight';
  text: string;
  href?: string;
}
