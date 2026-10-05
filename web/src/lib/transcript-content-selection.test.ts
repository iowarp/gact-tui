import { afterEach, expect, it } from 'vitest';
import { bindTranscriptText, transcriptContentSelection } from './transcript-content-selection';

afterEach(() => {
  window.getSelection()?.removeAllRanges();
  document.body.innerHTML = '';
});

function select(source: string, rendered: string, start: number, end: number) {
  document.body.innerHTML =
    '<div data-session-id="s" data-message-id="m"><p data-content-revision="rev"></p></div>';
  const element = document.querySelector('p')!;
  element.textContent = rendered;
  bindTranscriptText(element, { source, partId: 'p', revision: 'rev', field: 'text' });
  const range = document.createRange();
  range.setStart(element.firstChild!, start);
  range.setEnd(element.firstChild!, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
  return transcriptContentSelection(selection);
}

it('uses the actual repeated occurrence and converts Unicode offsets to code points', () => {
  expect(select('🧭 **north** then north', '🧭 north then north', 14, 19)?.selection).toEqual({
    kind: 'text',
    start: 17,
    end: 22,
  });
});

it('refuses coordinates when rendered content includes unaccounted-for text', () => {
  expect(select('first north', 'first north extra', 6, 11)).toBeUndefined();
});

it('does not keep a binding when a previously final part starts streaming', () => {
  select('north', 'north', 0, 5);
  bindTranscriptText(document.querySelector('p'), undefined);
  expect(transcriptContentSelection(window.getSelection())).toBeUndefined();
});
