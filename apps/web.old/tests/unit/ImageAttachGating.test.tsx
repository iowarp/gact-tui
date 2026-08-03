/**
 * A2 — composer image-attach gating + transcript image placeholder.
 *
 * The image-attach affordance is gated on the backend's
 * `multimodal_image_parts` capability (only an explicit `false` disables;
 * an absent flag is treated as allowed). Text and generic file upload are
 * never blocked. The transcript renders an honest placeholder for image
 * parts when the backend can't accept them.
 */
import { render, screen, cleanup, fireEvent } from '@solidjs/testing-library';
import { afterEach, describe, expect, it } from 'vitest';
import { Composer } from '../../src/components/Composer.js';
import { Transcript } from '../../src/components/Transcript.js';
import type { Message } from '@clio/core';

afterEach(cleanup);

function renderComposer(imageAttachCapable: boolean | undefined) {
  return render(() => (
    <Composer
      attachmentsCapable={true}
      onUploadFile={async () => ({ path: 'ws/x.png' })}
      imageAttachCapable={imageAttachCapable}
      onSubmit={async () => undefined}
    />
  ));
}

describe('Composer image-attach gating (A2)', () => {
  it('shows the image-attach button when the capability is present', () => {
    renderComposer(true);
    fireEvent.click(screen.getByTestId('composer-attach'));
    expect(screen.getByTestId('composer-attach-image')).toBeTruthy();
    expect(screen.queryByTestId('composer-attach-image-disabled')).toBeNull();
    // Generic upload stays available regardless.
    expect(screen.getByTestId('composer-attach-upload')).toBeTruthy();
  });

  it('treats an absent capability flag as allowed', () => {
    renderComposer(undefined);
    fireEvent.click(screen.getByTestId('composer-attach'));
    expect(screen.getByTestId('composer-attach-image')).toBeTruthy();
  });

  it('disables the image-attach affordance (with tooltip) when capability is false', () => {
    renderComposer(false);
    fireEvent.click(screen.getByTestId('composer-attach'));
    const disabled = screen.getByTestId('composer-attach-image-disabled');
    expect(disabled).toBeTruthy();
    expect(disabled.getAttribute('title')).toContain("doesn't accept images");
    // The enabled button must not be present…
    expect(screen.queryByTestId('composer-attach-image')).toBeNull();
    // …but generic file upload and the text input remain usable.
    expect(screen.getByTestId('composer-attach-upload')).toBeTruthy();
    expect(screen.getByTestId('composer-input')).toBeTruthy();
  });
});

const IMG_MSG: Message = {
  id: 'm1',
  role: 'user',
  parts: [
    {
      type: 'image',
      source: { kind: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
    },
  ],
} as unknown as Message;

describe('Transcript image part gating (A2)', () => {
  it('renders the inline image when the backend supports image parts', () => {
    render(() => (
      <Transcript
        messages={[IMG_MSG]}
        density="verbose"
        imagePartsSupported={true}
      />
    ));
    expect(screen.getByTestId('trx-image')).toBeTruthy();
    expect(screen.queryByTestId('trx-image-unsupported')).toBeNull();
  });

  it('renders an honest placeholder when the backend lacks image support', () => {
    render(() => (
      <Transcript
        messages={[IMG_MSG]}
        density="verbose"
        imagePartsSupported={false}
      />
    ));
    const placeholder = screen.getByTestId('trx-image-unsupported');
    expect(placeholder.textContent).toContain('not supported by this backend');
    expect(screen.queryByTestId('trx-image')).toBeNull();
  });
});
