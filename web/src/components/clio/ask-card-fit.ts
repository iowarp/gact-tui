/**
 * The height a capped card needs with every part that gives up height at its floor (a scrolling
 * body or option list at none, a script at its few lines). The dock lets a card past its 45% cap
 * up to that, so the parts that keep their height (a permission's options) stay in view.
 */
export function publishAskCardNeed(card: HTMLElement) {
  const code = card.querySelector<HTMLElement>(':scope > [data-slot=ask-code]');
  const codeYields = Boolean(code && getComputedStyle(code).flexShrink !== '0');
  if (code) fitAskCode(card, code);
  let slack = 0;
  for (const child of card.children) {
    if (!(child instanceof HTMLElement)) continue;
    const style = getComputedStyle(child);
    if (style.position === 'absolute' || style.position === 'fixed' || style.flexShrink === '0')
      continue;
    // Beside a script, which gives way first, the facts count whole: the card grows to show
    // them while it has room, and only a card at its ceiling holds them at their floor.
    if (codeYields && child.dataset.slot === 'ask-body') {
      slack += child.offsetHeight - child.scrollHeight;
      continue;
    }
    const floor = Number.parseFloat(style.minHeight);
    if (Number.isFinite(floor)) slack += Math.max(0, child.offsetHeight - floor);
  }
  // A pixel over beside a script, so facts at their content height never share the shrink.
  const need =
    card.offsetHeight + card.scrollHeight - card.clientHeight - slack + (codeYields ? 1 : 0);
  const value = `${Math.ceil(need)}px`;
  if (card.style.getPropertyValue('--ask-card-need') !== value)
    card.style.setProperty('--ask-card-need', value);
}

/** Each script's own floor, remembered while the fit binds it. */
const codeFloors = new WeakMap<HTMLElement, number>();

/**
 * A script's floor without its fit. A restyle under a size container lands only with the next
 * frame, so the fit is never lifted to read it: the floor is kept from a pass it did not bind.
 */
function codeFloor(code: HTMLElement) {
  const floor = Number.parseFloat(getComputedStyle(code).minHeight) || 0;
  const fit = Number.parseFloat(code.style.getPropertyValue('--ask-code-fit'));
  if (!(floor >= fit - 0.5)) codeFloors.set(code, floor);
  return codeFloors.get(code) ?? floor;
}

/** Room kept under the first option, so its label clears the card's bottom fade. */
const OPTION_FADE_ROOM = 12;

/**
 * A card at its ceiling shows, at rest, its facts at their floor and its first option whole: the
 * script gives way first. Publishes the code's floor (`--ask-code-fit`) as the whole lines that
 * leave that room, down to only its header and footer.
 */
function fitAskCode(card: HTMLElement, code: HTMLElement) {
  const ceiling = Number.parseFloat(getComputedStyle(card).getPropertyValue('--ask-card-ceiling'));
  const option = card.querySelector<HTMLElement>(':scope > [data-slot=ask-options] > *');
  const pre = code.querySelector<HTMLElement>(':scope > pre');
  if (!Number.isFinite(ceiling) || !option || !pre) {
    code.style.removeProperty('--ask-code-fit');
    code.removeAttribute('data-code-folded');
    return;
  }
  const style = getComputedStyle(card);
  const borderTop = Number.parseFloat(style.borderTopWidth);
  const borderBottom = Number.parseFloat(style.borderBottomWidth);
  const top = card.getBoundingClientRect().top + borderTop - card.scrollTop;
  const body = card.querySelector<HTMLElement>(':scope > [data-slot=ask-body]');
  const bodyFloor = body ? Number.parseFloat(getComputedStyle(body).minHeight) || 0 : 0;
  const bodyOver = body ? Math.max(0, body.offsetHeight - bodyFloor) : 0;
  const others =
    option.getBoundingClientRect().bottom - top - code.offsetHeight - bodyOver + OPTION_FADE_ROOM;
  const room = ceiling - borderTop - borderBottom - others;
  // Each logical line's bottom in the preview, padding included: a wrapped line counts whole.
  // A folded preview keeps its layout out of flow, so its lines still measure.
  const preTop = pre.getBoundingClientRect().top;
  const padBottom = Number.parseFloat(getComputedStyle(pre).paddingBottom);
  const ends = [...pre.querySelectorAll('code')].map(
    (line) => line.getBoundingClientRect().bottom - preTop + padBottom,
  );
  const codeStyle = getComputedStyle(code);
  let chrome =
    Number.parseFloat(codeStyle.borderTopWidth) + Number.parseFloat(codeStyle.borderBottomWidth);
  for (const part of code.children)
    if (part !== pre && part instanceof HTMLElement) chrome += part.offsetHeight;
  const linesFor = (space: number) => {
    let count = 0;
    while (count < ends.length && chrome + (ends[count] ?? 0) <= space + 0.5) count += 1;
    return count;
  };
  let lines = linesFor(room);
  const inner = ceiling - borderTop - borderBottom;
  const last = [...card.children].findLast(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && !/^(absolute|fixed)$/.test(getComputedStyle(child).position),
  );
  const content = last
    ? last.getBoundingClientRect().bottom +
      Number.parseFloat(getComputedStyle(last).marginBottom) -
      top +
      Number.parseFloat(style.paddingBottom)
    : card.scrollHeight;
  // When only the facts would be clipped to fit the ceiling, the script gives that up instead.
  // Measured against the code's own floor, not its fitted one, so the answer cannot feed back.
  if (body) {
    const bodyContent = body.scrollHeight;
    const rest = content - code.offsetHeight - body.offsetHeight + bodyContent;
    const shortfall = rest + codeFloor(code) - inner;
    if (shortfall > 0 && shortfall <= bodyContent - bodyFloor) {
      const whole = linesFor(inner - rest);
      if (whole > 0) lines = Math.min(lines, whole);
    }
  }
  // A card that scrolls even with its script folded keeps the script's first line, so nothing is
  // approved unseen, while the first option stays whole (its fade room given up).
  if (lines === 0 && content - code.offsetHeight - bodyOver + chrome > inner + 0.5)
    lines = Math.min(1, linesFor(room + OPTION_FADE_ROOM));
  // Without room for one line the preview keeps its name and Open bar, not a sliver of code.
  code.toggleAttribute('data-code-folded', lines === 0);
  const fit = `${Math.ceil(chrome + (lines > 0 ? (ends[lines - 1] ?? 0) : 0))}px`;
  if (code.style.getPropertyValue('--ask-code-fit') !== fit)
    code.style.setProperty('--ask-code-fit', fit);
}

/**
 * A body's content height, so its floor never exceeds what it holds. Text that grows inside a
 * body held at its floor resizes nothing the card observes, so the card's need is renewed too.
 */
export function publishAskBodyContent(body: HTMLElement) {
  const content = `${body.scrollHeight}px`;
  if (body.style.getPropertyValue('--ask-body-content') === content) return;
  body.style.setProperty('--ask-body-content', content);
  const card = body.parentElement;
  if (card?.dataset.slot === 'ask-card') publishAskCardNeed(card);
}
