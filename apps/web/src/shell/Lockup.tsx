import type { ReactElement } from 'react';
import './lockup.css';

interface LockupBrand {
  wordmark: string;
  tagline: string;
  taglineAccent: string;
  homeUrl: string | null;
  taglineAccentUrl: string | null;
  markGlyph: string;
  logoImage: string | null;
}

interface LockupProps {
  brand: LockupBrand;
}

/** Brand lockup for the workspace rail. */
export function Lockup({ brand }: LockupProps): ReactElement {
  const accentIndex =
    brand.taglineAccent.length > 0 ? brand.tagline.indexOf(brand.taglineAccent) : -1;
  const logo = brand.logoImage ? (
    <img className="shell-lockup__logo-image" src={brand.logoImage} alt="" />
  ) : (
    <span className="shell-lockup__mark" aria-hidden="true">
      {brand.markGlyph}
    </span>
  );
  const wordmark = [...brand.wordmark].map((character, index) => (
    <span key={`${character}-${index}`}>{character}</span>
  ));

  return (
    <div className="shell-lockup">
      {brand.homeUrl ? (
        <a className="shell-lockup__logo" href={brand.homeUrl}>
          {logo}
        </a>
      ) : (
        <span className="shell-lockup__logo">{logo}</span>
      )}

      <span className="shell-lockup__text">
        {brand.homeUrl ? (
          <a className="shell-lockup__wordmark" href={brand.homeUrl} aria-label={brand.wordmark}>
            {wordmark}
          </a>
        ) : (
          <span className="shell-lockup__wordmark">{wordmark}</span>
        )}
        {brand.tagline ? (
          <span className="shell-lockup__tagline">
            {accentIndex < 0 ? (
              brand.tagline
            ) : (
              <>
                {brand.tagline.slice(0, accentIndex)}
                {brand.taglineAccentUrl ? (
                  <a className="shell-lockup__tagline-accent" href={brand.taglineAccentUrl}>
                    {brand.taglineAccent}
                  </a>
                ) : (
                  <span className="shell-lockup__tagline-accent">{brand.taglineAccent}</span>
                )}
                {brand.tagline.slice(accentIndex + brand.taglineAccent.length)}
              </>
            )}
          </span>
        ) : null}
      </span>
    </div>
  );
}
