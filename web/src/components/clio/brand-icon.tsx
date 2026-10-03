import { brand } from '@brand';
import type { CSSProperties } from 'react';

/** A brand-supplied, theme-colored icon; legacy brands retain their logo/glyph. */
export function BrandIcon({ className, label }: { className?: string; label?: string }) {
  const image =
    brand.logoImage ??
    (brand.logoSvg ? `data:image/svg+xml,${encodeURIComponent(brand.logoSvg)}` : null);
  if (brand.iconSvg) {
    const mask = `url("data:image/svg+xml,${encodeURIComponent(brand.iconSvg)}")`;
    const style: CSSProperties = {
      display: 'inline-block',
      backgroundColor: 'currentColor',
      maskImage: mask,
      WebkitMaskImage: mask,
      maskSize: 'contain',
      WebkitMaskSize: 'contain',
      maskRepeat: 'no-repeat',
      WebkitMaskRepeat: 'no-repeat',
      maskPosition: 'center',
      WebkitMaskPosition: 'center',
    };
    return (
      <span
        aria-hidden={label ? undefined : true}
        aria-label={label}
        className={className}
        role={label ? 'img' : undefined}
        style={style}
      />
    );
  }
  return image ? (
    <img
      alt={label ?? ''}
      className={className}
      draggable={false}
      src={image}
      style={{ objectFit: 'contain' }}
    />
  ) : (
    <span aria-hidden={label ? undefined : true} aria-label={label} className={className}>
      {brand.markGlyph}
    </span>
  );
}
