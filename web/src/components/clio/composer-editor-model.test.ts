import { afterEach, describe, expect, it } from 'vitest';
import { collectPlainText, editorCaretOffset, focusEditorAtOffset } from './composer-editor-model';

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

function editor(html: string): HTMLDivElement {
  const root = document.createElement('div');
  root.contentEditable = 'true';
  root.innerHTML = html;
  document.body.append(root);
  return root;
}

describe('composer plain text', () => {
  it.each([
    ['first<div><br></div><div>second</div><div><br></div>', 'first\n\nsecond\n'],
    ['first<div>second</div>', 'first\nsecond'],
    ['<div>first</div><div>second</div>', 'first\nsecond'],
    ['<div><br></div><div>second</div>', '\nsecond'],
    ['first<div><br></div><div><br></div><div>fourth</div>', 'first\n\n\nfourth'],
    ['<div>first</div>second', 'first\nsecond'],
    ['first<br>second<br>', 'first\nsecond'],
    ['first<br><div>second</div>', 'first\nsecond'],
    ['<br>', ''],
    ['<div><br></div>', ''],
    ['<div><div>first</div><div>second</div></div><div>third</div>', 'first\nsecond\nthird'],
  ])('preserves browser line structure for %s', (html, expected) => {
    expect(collectPlainText(editor(html).childNodes)).toBe(expected);
  });

  it('preserves pasted plain text, indentation and blank lines without adding a suffix', () => {
    const root = editor('');
    const text = 'Review this:\n\n```python\nif ready:\n    save()\n```\n';
    root.append(document.createTextNode(text));
    expect(collectPlainText(root.childNodes)).toBe(text);
  });

  it('keeps reference offsets and caret measurements on the submitted text scale', () => {
    const root = editor(
      'first<div><br></div><div><span data-reference-token="source">Source</span>next</div>',
    );
    const tokens: Array<[string, number]> = [];
    expect(collectPlainText(root.childNodes, (id, offset) => tokens.push([id, offset]))).toBe(
      'first\n\nnext',
    );
    expect(tokens).toEqual([['source', 7]]);
    const text = root.lastElementChild!.lastChild!;
    const range = document.createRange();
    range.setStart(text, 2);
    range.collapse(true);
    window.getSelection()!.addRange(range);
    expect(editorCaretOffset(root)).toBe(9);

    // Controlled rendering uses direct text nodes; placing the caret after a
    // zero-width reference must still use the same offset.
    const direct = editor('');
    direct.append(document.createTextNode('first\n\n'));
    const token = document.createElement('span');
    token.dataset.referenceToken = 'source';
    token.contentEditable = 'false';
    token.textContent = 'Source';
    direct.append(token, document.createTextNode('next'));
    focusEditorAtOffset(direct, 7);
    expect(editorCaretOffset(direct)).toBe(7);
  });
});
