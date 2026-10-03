import { describe, expect, it } from 'vitest';
import { sentDataReferences } from './sent-data-references';
import { messageTextWithAnnotations } from './composer-annotations';

const markdown = '**Storm tracks**\nDataset: Hurricanes.\n\nZone: 12 selected observations.\n\n```json\n{"dataUri":"artifact:test","selectedRows":[1,2]}\n```';
const annotation = { id: 'selection', kind: 'data-zone-quote' as const, title: 'Storm tracks', summary: '12 selected observations', markdown };

describe('sentDataReferences', () => {
  it('keeps sent region captures compact while preserving their complete context', () => {
    const capture = 'Region capture of Storm tracks. The attached image has labelled boxes. S1: The bend near the Bahamas.\n\n```json\n{"surface":"tracks","regions":[{"label":"S1","box":{"x":0.2,"y":0.4,"width":0.1,"height":0.2},"comment":"The bend near the Bahamas."}]}\n```';
    const sent = capture.split('\n').map((line) => `> ${line}`).join('\n') + '\n\nMake a map figure of this bend.';
    expect(sentDataReferences(sent)).toEqual({ references: [{ title: 'Storm tracks', summary: '1 labelled region.', markdown: capture }], text: 'Make a map figure of this bend.' });
  });
  it('projects the actual composer format and preserves the full reference and question', () => {
    const sent = messageTextWithAnnotations([annotation], 'What changed here?');
    expect(sentDataReferences(sent)).toEqual({ references: [{ title: 'Storm tracks', summary: '12 selected observations.', markdown }], text: 'What changed here?' });
    expect(sent).toContain('"selectedRows":[1,2]');
  });
  it('supports multiple references and reference-only messages', () => {
    const projected = sentDataReferences(messageTextWithAnnotations([annotation, annotation], ''));
    expect(projected.references).toHaveLength(2);
    expect(projected.text).toBe('');
  });
  it.each(['> ordinary quote\n\nA question', '> **Not a generated reference**', messageTextWithAnnotations([{ ...annotation, markdown: markdown.replace('{"dataUri":"artifact:test","selectedRows":[1,2]}', 'invalid') }], 'Question')])('leaves ordinary quotes and malformed references intact', (text) => {
    expect(sentDataReferences(text)).toEqual({ references: [], text });
  });
});
