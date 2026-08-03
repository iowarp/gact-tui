import { createRoot } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { createComposerUploads, type UploadFile } from '../../src/components/ComposerUploads.js';

function file(name: string, body = 'content', type = 'text/plain'): File {
  return new File([body], name, { type });
}

describe('Composer upload state', () => {
  it('adds an upload chip and resolves it with the backend path', async () => {
    await createRoot(async (dispose) => {
      const uploads = createComposerUploads({
        createId: () => 'upload-1',
        uploadFile: () => async (f) => ({ path: `ws/${f.name}` }),
      });

      await uploads.addUploadedFiles([file('a.txt')]);

      expect(uploads.attachments()).toEqual([
        {
          id: 'upload-1',
          name: 'a.txt',
          size: 7,
          mimeType: 'text/plain',
          kind: 'upload',
          pending: false,
          path: 'ws/a.txt',
        },
      ]);
      dispose();
    });
  });

  it('keeps failed upload sources available for retry', async () => {
    await createRoot(async (dispose) => {
      let calls = 0;
      const upload: UploadFile = async (f) => {
        calls += 1;
        if (calls === 1) throw new Error('network down');
        return { path: `ws/${f.name}` };
      };
      const uploads = createComposerUploads({
        createId: () => 'upload-1',
        uploadFile: () => upload,
      });

      await uploads.addUploadedFiles([file('b.txt')]);
      expect(uploads.attachments()[0]?.error).toBe('network down');

      uploads.retryUpload('upload-1');
      await Promise.resolve();
      await Promise.resolve();

      expect(calls).toBe(2);
      expect(uploads.attachments()[0]).toMatchObject({
        id: 'upload-1',
        pending: false,
        path: 'ws/b.txt',
        error: undefined,
      });
      dispose();
    });
  });

  it('removes upload chips and clears attachments', async () => {
    await createRoot(async (dispose) => {
      let nextId = 0;
      const uploads = createComposerUploads({
        createId: () => `upload-${++nextId}`,
        uploadFile: () => async (f) => ({ path: `ws/${f.name}` }),
      });

      await uploads.addUploadedFiles([file('a.txt'), file('b.txt')]);
      uploads.removeAttachment('upload-1');
      expect(uploads.attachments().map((a) => a.id)).toEqual(['upload-2']);

      uploads.clearAttachments();
      expect(uploads.attachments()).toEqual([]);
      dispose();
    });
  });
});
