import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ModelSelectorLogo } from './model-selector';

describe('ModelSelectorLogo', () => {
  it('renders provider marks without a network or asset-path dependency', () => {
    render(<ModelSelectorLogo provider="amazon-bedrock" />);

    expect(screen.getByRole('img', { name: 'amazon-bedrock logo' })).toHaveTextContent('AWS');
  });

  it('uses a compact text mark for providers without a dedicated mark', () => {
    const { rerender } = render(<ModelSelectorLogo provider="future-provider" />);
    const unknown = screen.getByRole('img', { name: 'future-provider logo' });
    expect(unknown).toHaveTextContent('FU');

    rerender(<ModelSelectorLogo provider="google" />);
    const known = screen.getByRole('img', { name: 'google logo' });
    expect(known).toHaveTextContent('G');
  });
});
