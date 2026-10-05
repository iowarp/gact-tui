import { vocab } from '@/lib/brand-vocabulary';

/** Keep recovery advice readable while preserving the diagnostic for inspection. */
export function marketplaceErrorSummary(error: string): string {
  if (error.includes('unknown tool reference:')) {
    const blueprint = /Blueprint "([^"]+)"/u.exec(error)?.[1];
    return `${blueprint || 'A blueprint'} needs tools that are not available on this ${vocab.agent}. Set up its connected services, then retry. Existing installations were kept.`;
  }
  if (error.includes('local_edits_present'))
    return 'Some installed blueprints have your edits. Review those changes before reloading.';
  if (error.includes('already registered'))
    return 'This marketplace is already in your list. Open its settings to change it or retry.';
  if (/git.*(?:clone|fetch)|repository not found|could not read.*repository/iu.test(error))
    return `The repository could not be opened. Check its address and access from this ${vocab.agent}.`;
  return error.length > 180 || error.includes('\n')
    ? 'The marketplace could not finish loading. Open the details below to see what needs attention.'
    : error;
}
