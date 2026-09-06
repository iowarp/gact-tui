/** Observe a card response whose error is already retained on that card. */
export function respondFromControl(response: Promise<void>): void {
  void response.catch(() => {
    // The owning interaction card renders the retained failure in place.
  });
}
