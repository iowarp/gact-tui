import type { Brand } from '@brand';
import { ExternalLink } from '@/components/ui/external-link';
import { cn } from '@/lib/utils';

interface BrandTaglineProps {
  brand: Pick<Brand, 'tagline' | 'taglineAccent' | 'taglineAccentUrl'>;
  className?: string;
}

/**
 * The brand's byline (e.g. "by the <organization>"). When the brand names an
 * accent inside the tagline and a URL for it, that accent is a link to the
 * organization, opened through the one external-link path (the OS browser in
 * the desktop shell, a new tab in a browser). Nothing here names a product: a
 * brand with no accent or no URL renders its tagline as plain text.
 */
export function BrandTagline({ brand, className }: BrandTaglineProps) {
  const { tagline, taglineAccent, taglineAccentUrl } = brand;
  if (!tagline) return null;
  const at = taglineAccent ? tagline.indexOf(taglineAccent) : -1;
  if (!taglineAccentUrl || at < 0) return <p className={className}>{tagline}</p>;
  return (
    <p className={className}>
      {tagline.slice(0, at)}
      <ExternalLink
        className={cn('underline-offset-2 hover:text-foreground hover:underline')}
        href={taglineAccentUrl}
      >
        {taglineAccent}
      </ExternalLink>
      {tagline.slice(at + taglineAccent.length)}
    </p>
  );
}
