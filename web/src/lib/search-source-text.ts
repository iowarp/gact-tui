import { ph, t } from '@lingui/core/macro';
import { vocab } from '@/lib/brand-vocabulary';

/**
 * The search catalog's English texts (``clio_agent/search/catalog.py``), in the reader's
 * language. Matched on the exact English the service sends; any other text reads as sent.
 */
function knownSearchSourceText(value: string): string | undefined {
  // The two texts that name the agent match whatever it is called.
  if (/^A \S+ search service your site runs \(search\.service\.url\)\.$/u.test(value))
    return t`A ${ph({ agent: vocab.agent })} search service your site runs (search.service.url).`;
  if (/^A free key \(\$1 a day budget\); \S+ can request one with your email\.$/u.test(value))
    return t`A free key ($1 a day budget); ${ph({ agent: vocab.agent })} can request one with your email.`;
  switch (value) {
    // What each source is.
    case 'Its own web index; filters by date, site and excluded sites.':
      return t`Its own web index; filters by date, site and excluded sites.`;
    case 'Its own web index; filters by date, site and kind (papers, news, PDF).':
      return t`Its own web index; filters by date, site and kind (papers, news, PDF).`;
    case 'Web search with research and PDF categories and full page text.':
      return t`Web search with research and PDF categories and full page text.`;
    case 'Its own web index; filters by date and excluded sites.':
      return t`Its own web index; filters by date and excluded sites.`;
    case 'Web search for agents; the free tier is its faster, lighter mode.':
      return t`Web search for agents; the free tier is its faster, lighter mode.`;
    case 'Works across every field, with citations and open-access links.':
      return t`Works across every field, with citations and open-access links.`;
    case 'DOI metadata for journals, preprints and their links.':
      return t`DOI metadata for journals, preprints and their links.`;
    case 'Preprints in physics, computing, mathematics and more.':
      return t`Preprints in physics, computing, mathematics and more.`;
    case 'Life-science literature and preprints, with full text where open.':
      return t`Life-science literature and preprints, with full text where open.`;
    case 'U.S. Department of Energy reports and papers.':
      return t`U.S. Department of Energy reports and papers.`;
    case 'Open citation links: what a work cites and who cites it.':
      return t`Open citation links: what a work cites and who cites it.`;
    case 'DOIs for datasets and software.':
      return t`DOIs for datasets and software.`;
    case 'Papers across fields with citation data.':
      return t`Papers across fields with citation data.`;
    // What it allows without a key.
    case '1,000 searches per hour, shared by everyone on your network':
      return t`1,000 searches per hour, shared by everyone on your network`;
    case '100 searches per day, shared by everyone on your network':
      return t`100 searches per day, shared by everyone on your network`;
    case 'Set by the service':
      return t`Set by the service`;
    case 'About 100 searches a day per network without a key; single-work lookups are free':
      return t`About 100 searches a day per network without a key; single-work lookups are free`;
    case 'No daily limit; paced':
      return t`No daily limit; paced`;
    case 'One request every 3 seconds':
      return t`One request every 3 seconds`;
    case 'No key':
      return t`No key needed`;
    case 'Needs your key':
      return t`Needs your key`;
    // What a key adds.
    case 'A private allowance (100,000 requests a month free).':
      return t`A private allowance (100,000 requests a month free).`;
    case 'Your own monthly allowance, and deeper search modes.':
      return t`Your own monthly allowance, and deeper search modes.`;
    case '1,000 credits a month on a free key.':
      return t`1,000 credits a month on a free key.`;
    case 'A private allowance and site allowlists.':
      return t`A private allowance and site allowlists.`;
    case 'Higher-quality search mode and date and site filters.':
      return t`Higher-quality search mode and date and site filters.`;
    case "The service's access token, if it needs one.":
      return t`The service’s access token, if it needs one.`;
    case 'Turns the source on.':
      return t`Turns the source on.`;
    default:
      return undefined;
  }
}

export function searchSourceText(value: string): string;
export function searchSourceText(value: string | undefined): string | undefined;
export function searchSourceText(value: string | undefined): string | undefined {
  if (!value) return value;
  return knownSearchSourceText(value.trim()) ?? value;
}
