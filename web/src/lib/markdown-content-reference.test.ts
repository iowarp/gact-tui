import { describe, expect, it } from 'vitest';
import {
  CONTENT_REFERENCE_PATH,
  parseMarkdownContentReference,
  remarkContentReferences,
} from './markdown-content-reference';

describe('Markdown content references', () => {
  it('retains exact conversation and message identity', () => {
    expect(parseMarkdownContentReference('session://workspace/session#message-msg_1')).toEqual({
      kind: 'session',
      workspaceId: 'workspace',
      sessionId: 'session',
      messageId: 'msg_1',
    });
  });
  it('leaves a malformed Unicode reference unavailable without crashing the transcript', () => {
    const tree = { type: 'link', url: 'workspace-file:/data/\ud800.md' };
    expect(() => remarkContentReferences()(tree)).not.toThrow();
    expect(tree.url).toBe(CONTENT_REFERENCE_PATH);
    expect(parseMarkdownContentReference('')).toBeUndefined();
  });
  it('retains resource identity and an explicit workspace binding', () => {
    expect(parseMarkdownContentReference('resource://w/res_doc')).toEqual({
      kind: 'resource',
      id: 'res_doc',
      workspaceId: 'w',
    });
    expect(parseMarkdownContentReference('resource:res_doc')).toEqual({
      kind: 'resource',
      id: 'res_doc',
    });
  });
  it.each([
    ['workspace-file:/data/Signal%20values.csv', '/data/Signal values.csv'],
    ['workspace-file:D%3A%5CWorkspace%5CREADME.md', 'D:\\Workspace\\README.md'],
    ['workspace-file:data/%CE%BC.csv', 'data/μ.csv'],
    ['workspace-file:data/a%23b%3Fc.txt', 'data/a#b?c.txt'],
  ])('decodes the exact service-side path in %s', (uri, path) => {
    expect(parseMarkdownContentReference(uri)).toEqual({ kind: 'file', path });
  });

  it('opens an object inside a file by its locator', () => {
    expect(
      parseMarkdownContentReference('workspace-file:/w/era5/msl.nc?locator=%2FMSL'),
    ).toEqual({ kind: 'file', path: '/w/era5/msl.nc', locator: '/MSL' });
    expect(parseMarkdownContentReference('workspace-file:/w/a.h5?locator=entry')).toBeUndefined();
    expect(parseMarkdownContentReference('workspace-file:/w/a.h5?locator=%2Fa%00')).toBeUndefined();
  });

  it.each([
    'workspace-file:',
    'workspace-file:%ZZ',
    'workspace-file:%00private',
    'workspace-file:../private',
    'workspace-file:data/%2e%2e/private',
    'workspace-file:D%3A%5Cdata%5C..%5Cprivate',
    'workspace-file:data.csv#rows',
    'workspace-file:data.csv?download=1',
    'resource://other/not-a-resource',
    'resource://other/res_a/extra',
    'session://workspace/..',
    'session://workspace/%2e%2e',
    'session://workspace/session/extra',
    'session://workspace/session#unknown',
    'session://workspace/session#message-',
    'session://workspace/%00session',
    'https://example.com/readme.md',
  ])('rejects malformed or unsupported reference %s', (uri) => {
    expect(parseMarkdownContentReference(uri)).toBeUndefined();
  });

  it('does not reinterpret code, images or ordinary links as file citations', () => {
    const tree = {
      type: 'root',
      children: [
        { type: 'link', url: 'workspace-file:/data/README.md' },
        { type: 'link', url: 'https://example.com/README.md' },
        { type: 'inlineCode', url: 'workspace-file:/data/README.md' },
        { type: 'image', url: 'workspace-file:/data/image.png' },
      ],
    };
    remarkContentReferences()(tree);
    expect(tree.children[0].url).toBe(
      `${CONTENT_REFERENCE_PATH}${encodeURIComponent('workspace-file:/data/README.md')}`,
    );
    expect(tree.children.slice(1).map((node) => node.url)).toEqual([
      'https://example.com/README.md',
      'workspace-file:/data/README.md',
      'workspace-file:/data/image.png',
    ]);
  });
});
