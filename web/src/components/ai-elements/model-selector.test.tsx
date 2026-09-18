import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModelSelectorLogo } from './model-selector';

describe('ModelSelectorLogo', () => {
  it('uses packaged provider artwork without a network dependency', () => {
    render(<ModelSelectorLogo provider="amazon-bedrock" />);

    expect(screen.getByRole('img', { name: 'amazon-bedrock logo' })).toHaveAttribute(
      'src',
      '/provider-logos/amazon-bedrock.svg',
    );
  });

  it('uses the packaged generic artwork for unknown providers and failed assets', () => {
    const { rerender } = render(<ModelSelectorLogo provider="future-provider" />);
    const unknown = screen.getByRole('img', { name: 'future-provider logo' });
    expect(unknown).toHaveAttribute('src', '/provider-logos/generic.svg');

    rerender(<ModelSelectorLogo provider="google" />);
    const known = screen.getByRole('img', { name: 'google logo' });
    fireEvent.error(known);
    expect(known).toHaveAttribute('src', '/provider-logos/generic.svg');
  });
});
