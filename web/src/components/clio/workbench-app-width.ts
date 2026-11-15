/**
 * How wide the canvas opens for an app view the person has not sized yet.
 *
 * The canvas starts at 40% of the window, which suits lists. An app view is a
 * whole application (a molecule viewer, a ParaView scene), and at 40% of a
 * 1440 px window its frame is about 524 px: some views pick a cramped phone
 * layout below 600 px and one draws nothing at all. So while an app tab is shown,
 * a canvas the person never resized opens at half the window, as long as the
 * conversation keeps its 400 px beside the folded left bar. Once the person drags
 * the divider, their width is kept for every tab.
 */
export const APP_TAB_SHARE = 0.5;
const FOLDED_NAVIGATION_WIDTH = 56;
const MIN_CONVERSATION_WIDTH = 400;

export function appTabShare(share: number, windowWidth: number, personSized: boolean): number {
  if (personSized || share >= APP_TAB_SHARE || windowWidth <= 0) return share;
  const room = (windowWidth - FOLDED_NAVIGATION_WIDTH - MIN_CONVERSATION_WIDTH) / windowWidth;
  return Math.max(share, Math.min(APP_TAB_SHARE, Math.floor(room * 1000) / 1000));
}
