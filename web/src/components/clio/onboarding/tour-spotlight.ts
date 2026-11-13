/** A screen rectangle in viewport pixels. */
export interface TourBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Where the step card sits; its height is measured separately. */
export interface TourCardPlacement {
  top: number;
  left: number;
  width: number;
}

/**
 * A card with no room beside the spotlight stacks over part of it (a phone's
 * full-height practice stage). The lit area is then the larger part the card leaves
 * clear, above or below it, so the card never covers what the spotlight shows.
 */
export function clearOfCard(
  box: TourBox | undefined,
  card: TourCardPlacement | undefined,
  cardHeight: number,
  gap: number,
): TourBox | undefined {
  if (!box || !card) return box;
  const bottom = box.top + box.height;
  const cardBottom = card.top + cardHeight;
  const covers =
    card.left < box.left + box.width &&
    card.left + card.width > box.left &&
    card.top < bottom &&
    cardBottom > box.top;
  if (!covers) return box;
  const above = card.top - gap - box.top;
  const belowTop = cardBottom + gap;
  const below = bottom - belowTop;
  if (Math.max(above, below) <= 0) return box;
  return below >= above ? { ...box, top: belowTop, height: below } : { ...box, height: above };
}
