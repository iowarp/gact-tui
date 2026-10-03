/** Stable anchors for the gallery, including its two distinct slider components. */
export function galleryComponentSlug(name: string): string {
  if (name === 'clio.slider.v1') return 'numeric-slider';
  return name.startsWith('clio.') ? name.slice(5, -3).replaceAll('.', '-')
    : name.replace(/([a-z])([A-Z])/gu, '$1-$2').toLowerCase();
}

/** Resolve a known component; unrelated anchors and malformed escapes are ignored. */
export function galleryComponentFromHash(hash: string, names: readonly string[]): string | undefined {
  let value: string;
  try { value = decodeURIComponent(hash.replace(/^#/u, '')).toLowerCase(); }
  catch { return undefined; }
  return names.find((name) => galleryComponentSlug(name) === value || name.toLowerCase() === value);
}
