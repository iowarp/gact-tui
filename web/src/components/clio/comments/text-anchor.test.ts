import { afterEach, describe, expect, it } from 'vitest';
import { textQuoteFromSelection, textQuoteRange } from './text-anchor';

afterEach(() => {
  document.body.innerHTML = '';
  window.getSelection()?.removeAllRanges();
});

function select(node: Node, start: number, end: number) {
  const range = document.createRange();
  range.setStart(node, start);
  range.setEnd(node, end);
  const selection = window.getSelection()!;
  selection.removeAllRanges();
  selection.addRange(range);
}

describe('text-quote anchors', () => {
  it('quote a source view as the file reads, without its line numbers', () => {
    document.body.innerHTML = `
      <div id="host"><ol>
        <li data-line="1"><span data-comment-skip="">1</span><span>\\section{Background}</span></li>
        <li data-line="2"><span data-comment-skip="">!</span><span data-comment-skip="">2</span><span>A checkpoint is a bulk write.</span></li>
        <li data-line="3"><span data-comment-skip="">3</span><span>Its cost is the stall.</span></li>
      </ol></div>`;
    const host = document.getElementById('host')!;
    const line = host.querySelector('[data-line="2"] span:last-child')!.firstChild!;
    select(line, 2, 12);
    const anchor = textQuoteFromSelection(host)!;
    expect(anchor.exact).toBe('checkpoint');
    expect(anchor.prefix?.trim()).toBe('\\section{Background} A');
    expect(anchor.suffix?.trim()).toBe('is a bulk write. Its cost is the stall.');
    expect(anchor.start).toBe(anchor.prefix!.length);
  });

  it('keep plain rendered text as it was', () => {
    document.body.innerHTML = '<div id="host"><p>One two</p><p>three four</p></div>';
    const host = document.getElementById('host')!;
    select(host.querySelector('p:last-child')!.firstChild!, 0, 5);
    const anchor = textQuoteFromSelection(host)!;
    expect(anchor).toMatchObject({ exact: 'three', prefix: 'One two', suffix: ' four', start: 7 });
  });

  it('find a quote again where it was made, past the line numbers', () => {
    document.body.innerHTML = `
      <div id="host"><ol>
        <li data-line="1"><span data-comment-skip="">1</span><span>A burst is a write.</span></li>
        <li data-line="2"><span data-comment-skip="">2</span><span>Another burst is a write.</span></li>
      </ol></div>`;
    const host = document.getElementById('host')!;
    const second = host.querySelector('[data-line="2"] span:last-child')!.firstChild!;
    select(second, 8, 13);
    const anchor = textQuoteFromSelection(host)!;
    expect(anchor.exact).toBe('burst');
    const range = textQuoteRange(host, anchor)!;
    // The second "burst", not the first: the nearest to where the mark was made.
    expect(range.startContainer).toBe(second);
    expect([range.startOffset, range.endOffset]).toEqual([8, 13]);
    expect(range.toString()).toBe('burst');
  });

  it('find a quote that runs across lines and nodes, and nothing once it is gone', () => {
    document.body.innerHTML =
      '<div id="host"><p data-line="1">Checkpoints are <em>large</em></p><p data-line="2">bursts here.</p></div>';
    const host = document.getElementById('host')!;
    const anchor = { profile: 'text-quote' as const, exact: 'large bursts', start: 16 };
    const range = textQuoteRange(host, anchor)!;
    expect(range.startContainer.textContent).toBe('large');
    expect(range.endContainer.textContent).toBe('bursts here.');
    expect(range.endOffset).toBe(6);
    host.querySelector('em')!.textContent = 'small';
    expect(textQuoteRange(host, anchor)).toBeUndefined();
  });
});
