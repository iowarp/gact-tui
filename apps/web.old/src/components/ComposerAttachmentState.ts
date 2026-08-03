/**
 * State container for Composer Attachment.
 */
import { createSignal, type Setter } from 'solid-js';
import { createComposerUploads, type UploadFile } from './ComposerUploads.js';

export interface ComposerAttachmentStateOptions {
  uploadFile: () => UploadFile | undefined;
  imageAttachCapable: () => boolean | undefined;
  setText: Setter<string>;
}

export function createComposerAttachmentState(options: ComposerAttachmentStateOptions) {
  const [attachMenuOpen, setAttachMenuOpen] = createSignal(false);
  const [dragging, setDragging] = createSignal(false);
  let fileInputRef: HTMLInputElement | undefined;
  let imageInputRef: HTMLInputElement | undefined;

  const uploads = createComposerUploads({
    uploadFile: options.uploadFile,
  });

  const imageAttachAllowed = () => options.imageAttachCapable() !== false;

  function openUpload() {
    setAttachMenuOpen(false);
    fileInputRef?.click();
  }

  function openImageUpload() {
    if (!imageAttachAllowed()) return;
    setAttachMenuOpen(false);
    imageInputRef?.click();
  }

  function mentionWorkspaceFile() {
    setAttachMenuOpen(false);
    options.setText((t) => (t === '' || t.endsWith(' ') || t.endsWith('@') ? t + '@' : t + ' @'));
  }

  function onFilesPicked(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement;
    void uploads.addUploadedFiles(Array.from(input.files ?? []));
    input.value = '';
  }

  function onDragOver(e: DragEvent) {
    const types = Array.from(e.dataTransfer?.types ?? []);
    if (types.includes('Files') || types.includes('application/x-gact-path')) {
      e.preventDefault();
      setDragging(true);
    }
  }

  function onDragLeave(_: DragEvent) {
    setDragging(false);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    const refPath = e.dataTransfer?.getData('application/x-gact-path');
    if (refPath) {
      options.setText((t) => (t === '' || t.endsWith(' ') ? t : t + ' ') + '@' + refPath + ' ');
      return;
    }
    void uploads.addUploadedFiles(Array.from(e.dataTransfer?.files ?? []));
  }

  return {
    attachMenuOpen,
    setAttachMenuOpen,
    dragging,
    uploads,
    imageAttachAllowed,
    setFileInputRef: (el: HTMLInputElement) => {
      fileInputRef = el;
    },
    setImageInputRef: (el: HTMLInputElement) => {
      imageInputRef = el;
    },
    openUpload,
    openImageUpload,
    mentionWorkspaceFile,
    onFilesPicked,
    onDragOver,
    onDragLeave,
    onDrop,
  };
}
