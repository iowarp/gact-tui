/**
 * Type definitions and helpers for Composer Uploads. Key export `UploadFile`.
 */
import { createSignal } from 'solid-js';
import type { AttachedFile } from './ComposerAttachments.js';

export type UploadFile = (file: File) => Promise<{ path?: string } | void>;

export function createComposerUploads(options: {
  uploadFile: () => UploadFile | undefined;
  createId?: () => string;
}) {
  const [attachments, setAttachments] = createSignal<AttachedFile[]>([]);
  const uploadSources = new Map<string, File>();
  const createId = options.createId ?? cryptoRandomId;

  async function uploadOne(id: string, file: File) {
    const uploadFile = options.uploadFile();
    if (!uploadFile) return;
    setAttachments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, pending: true, error: undefined } : a)),
    );
    try {
      const res = await uploadFile(file);
      const path = res && typeof res === 'object' ? res.path : undefined;
      uploadSources.delete(id);
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, pending: false, ...(path ? { path } : {}) } : a)),
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setAttachments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, pending: false, error: msg } : a)),
      );
    }
  }

  async function addUploadedFiles(files: File[]) {
    if (files.length === 0 || !options.uploadFile()) return;
    for (const file of files) {
      const id = createId();
      uploadSources.set(id, file);
      setAttachments((prev) => [
        ...prev,
        {
          id,
          name: file.name,
          size: file.size,
          mimeType: file.type || 'application/octet-stream',
          kind: 'upload',
          pending: true,
        },
      ]);
      await uploadOne(id, file);
    }
  }

  function retryUpload(id: string) {
    const file = uploadSources.get(id);
    if (file) void uploadOne(id, file);
  }

  function removeAttachment(id: string) {
    uploadSources.delete(id);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  function clearAttachments() {
    setAttachments([]);
  }

  return {
    attachments,
    addUploadedFiles,
    retryUpload,
    removeAttachment,
    clearAttachments,
  };
}

function cryptoRandomId(): string {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buf = new Uint8Array(6);
    crypto.getRandomValues(buf);
    return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return Math.random().toString(36).slice(2, 12);
}
