/**
 * A matching message passage as Ctrl K quotes it: the words verbatim, without
 * the markdown that only styles them. Underscores always stay, because they
 * belong to names (`lineage_demo/pipeline.py`, `create_artifact`, `__init__`).
 */
export function messageSnippetText(text: string): string {
  return text
    .replaceAll(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replaceAll(/^\s{0,3}(?:#{1,6}|>|[-*+](?= )|\d+[.)](?= ))\s*/gmu, '')
    .replaceAll(/\*\*([^*\n]+)\*\*/gu, '$1')
    .replaceAll(/(?<![\w*])\*([^*\s][^*\n]*?)\*(?![\w*])/gu, '$1')
    .replaceAll(/`+/gu, '')
    .replaceAll(/\s+/gu, ' ')
    .trim();
}
