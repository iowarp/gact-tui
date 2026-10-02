import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { customBrand } = vi.hoisted(() => ({
  customBrand: { iconSvg: '', logoImage: '', logoSvg: '', markGlyph: 'B' },
}));
vi.mock('@brand', () => ({ brand: customBrand }));
import { BrandIcon } from './brand-icon';

beforeEach(() => {
  Object.assign(customBrand, { iconSvg: '', logoImage: '', logoSvg: '', markGlyph: 'B' });
});
describe('BrandIcon', () => {
  it('uses a supplied SVG as a theme-colored mask with an accessible name', () => {
    customBrand.iconSvg = '<svg><path d="M0 0h4v4z"/></svg>';
    render(<BrandIcon label="Product" className="size-6" />);
    const icon = screen.getByRole('img', { name: 'Product' });
    expect(icon.style.maskImage).toContain('data:image/svg+xml');
    expect(icon.style.backgroundColor).toBe('currentcolor');
    expect(icon).not.toHaveAttribute('aria-hidden');
  });
  it('preserves legacy raster brands and decorative accessibility', () => {
    customBrand.logoImage = 'data:image/png;base64,example';
    const { container } = render(<BrandIcon />);
    expect(container.querySelector('img')).toHaveAttribute('src', customBrand.logoImage);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
  });
  it('retains the configured glyph when no assets exist', () => {
    render(<BrandIcon />);
    expect(screen.getByText('B')).toHaveAttribute('aria-hidden', 'true');
  });
});
