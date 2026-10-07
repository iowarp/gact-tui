/** Read the renderer shipped with this frontend; no credentials enter the archive. */
export async function loadSessionReviewRenderer(): Promise<{
  javascript: string;
  stylesheet: string;
}> {
  const read = async (file: string): Promise<string> => {
    const response = await fetch(new URL(`/${file}`, window.location.href));
    if (!response.ok) throw new Error('The offline review renderer could not be loaded.');
    const value = await response.text();
    if (value.trimStart().startsWith('<'))
      throw new Error('The offline review renderer is missing from this UI build.');
    return value;
  };
  const [javascript, stylesheet] = await Promise.all([
    read('offline-review.js'),
    read('offline-review.css'),
  ]);
  return { javascript, stylesheet };
}
