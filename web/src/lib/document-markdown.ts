const CONVERTED_BULLET_MARKERS = /([*-]|\d+[.)])(\s+)[\uF0A7\uF0B7\uF0D8](?:\s+)?/gmu;

export const DOCUMENT_MARKDOWN_CLASS_NAME =
  'min-w-0 max-w-none text-sm leading-6 [overflow-wrap:anywhere] [&>*+*]:!mt-3 [&_h1]:!mb-3 [&_h1]:!mt-7 [&_h2]:!mb-2 [&_h2]:!mt-6 [&_h3]:!mb-2 [&_h3]:!mt-5 [&_ol]:!my-2 [&_ol]:list-outside [&_ol]:pl-6 [&_ul]:!my-2 [&_ul]:list-outside [&_ul]:pl-6 [&_li]:!my-0.5 [&_li]:pl-1 [&_li>p]:inline';

export function normalizeConvertedMarkdown(markdown: string): string {
  return markdown.replace(CONVERTED_BULLET_MARKERS, '$1$2');
}
