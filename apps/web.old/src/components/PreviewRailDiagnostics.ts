/**
 * Preview Rail Diagnostics: helpers. Key export `imageFailureHint`.
 */
import type { ContextFileContent } from '@clio/core';
import { humanSize } from '../presentationUtils.js';
import { imageMimeForPath } from './PreviewRailFileTypes.js';

export { humanSize };

function decodedBytePrefix(content: ContextFileContent | null, max = 80): string {
  if (!content) return '';
  try {
    const bin = atob(content.data);
    const bytes = new Uint8Array(Math.min(bin.length, max));
    for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return '';
  }
}

function sourceMediaType(content: ContextFileContent): string {
  return (content.source_media_type || content.media_type || '').toLowerCase();
}

export function imageFailureHint(
  content: ContextFileContent | null,
  listedSize: number | undefined,
): string {
  if (!content) return 'The image could not be decoded.';
  const inferredImageType = imageMimeForPath(content.path);
  const declaredType = (content.media_type || '').toLowerCase();
  const sourceType = sourceMediaType(content);
  const sizeMismatch =
    typeof listedSize === 'number' &&
    typeof content.size === 'number' &&
    listedSize !== content.size;
  const prefix = decodedBytePrefix(content).trimStart();
  if (
    inferredImageType &&
    sourceType &&
    !sourceType.startsWith('image/') &&
    sourceType !== declaredType
  ) {
    return sizeMismatch
      ? `Backend read returned ${content.source_media_type} for a ${inferredImageType} file and transformed the bytes (${humanSize(content.size)} read, ${humanSize(listedSize)} listed).`
      : `Backend read returned ${content.source_media_type} for a ${inferredImageType} file, so the browser could not trust the bytes as an image.`;
  }
  if (inferredImageType && declaredType && !declaredType.startsWith('image/')) {
    return sizeMismatch
      ? `Backend read labeled this image as ${content.media_type} and returned ${humanSize(content.size)} for a ${humanSize(listedSize)} file.`
      : `Backend read labeled this image as ${content.media_type}, so the returned bytes could not be trusted as ${inferredImageType}.`;
  }
  if (prefix.startsWith('{') || prefix.startsWith('[')) {
    return sizeMismatch
      ? `Backend read returned JSON/text instead of image bytes (${humanSize(content.size)} read, ${humanSize(listedSize)} listed).`
      : 'Backend read returned JSON/text instead of image bytes.';
  }
  if (sizeMismatch) {
    return `Backend read size differs from the file listing (${humanSize(content.size)} read, ${humanSize(listedSize)} listed).`;
  }
  return 'The file is labeled as an image, but the returned bytes do not decode as one.';
}
