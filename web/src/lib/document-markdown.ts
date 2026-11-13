const CONVERTED_BULLET_MARKERS = /([*-]|\d+[.)])(\s+)[\uF0A7\uF0B7\uF0D8](?:\s+)?/gmu;

export const DOCUMENT_MARKDOWN_CLASS_NAME =
  // `[&>*+*]` would compile to a universal sibling selector that restyles whole lists on any insert.
  'min-w-0 max-w-none space-y-2 text-sm leading-6 [overflow-wrap:anywhere] [&_table]:w-max [&_table]:min-w-full [&_table]:[overflow-wrap:normal] [&>:where(:not(:first-child))]:!mt-2 [&_h1]:!mb-2 [&_h1]:!mt-5 [&_h1]:!text-2xl [&_h1:first-child]:!mt-0 [&_h2]:!mb-1.5 [&_h2]:!mt-4 [&_h2]:!text-xl [&_h3]:!mb-1 [&_h3]:!mt-3 [&_h3]:!text-lg [&_h4]:!mb-1 [&_h4]:!mt-3 [&_ol]:!my-1.5 [&_ol]:!list-outside [&_ol]:!pl-6 [&_ul]:!my-1.5 [&_ul]:!list-outside [&_ul]:!pl-6 [&_li]:!py-0.5 [&_li]:!pl-0.5 [&_li>p]:inline';

export function normalizeConvertedMarkdown(markdown: string): string {
  return markdown.replace(CONVERTED_BULLET_MARKERS, '$1$2');
}

/** The viewers' one type scale: 13px body, headings on the brand's heading face, 12px code; inline code in the accent (frame-bar `.md code`). */
export const READ_TYPE_SCALE =
  'text-ui leading-[1.55] [&_:is(h1,h2,h3,h4)]:!font-heading [&_:is(h1,h2,h3,h4)]:!font-semibold [&_h1]:!text-welcome [&_h2]:!text-title [&_h3]:!text-h3 [&_h4]:!text-ui [&_code]:!text-meta [&_[data-streamdown=inline-code]]:!text-accent-foreground';
