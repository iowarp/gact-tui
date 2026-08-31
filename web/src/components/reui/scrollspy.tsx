import type { ReactNode, RefObject } from 'react';
import { useCallback, useEffect, useRef } from 'react';

export interface ScrollspyProps {
  children: ReactNode;
  targetRef?: RefObject<Document | HTMLElement | null | undefined>;
  onUpdate?: (id: string) => void;
  offset?: number;
  smooth?: boolean;
  className?: string;
  dataAttribute?: string;
  history?: boolean;
  navigate?: boolean;
  refreshKey?: string | number;
}

/** ReUI Scrollspy, vendored through the configured @reui registry. */
export function Scrollspy({
  children,
  targetRef,
  onUpdate,
  className,
  offset = 0,
  smooth = true,
  dataAttribute = 'scrollspy',
  history = true,
  navigate = true,
  refreshKey,
}: ScrollspyProps) {
  const selfRef = useRef<HTMLDivElement | null>(null);
  const anchorElementsRef = useRef<Element[]>([]);
  const previousIdRef = useRef<string | undefined>(undefined);

  const setActiveSection = useCallback(
    (sectionId: string | null, force = false) => {
      if (!sectionId) return;
      for (const item of anchorElementsRef.current) {
        const id = item.getAttribute(`data-${dataAttribute}-anchor`);
        if (id === sectionId) item.setAttribute('data-active', 'true');
        else item.removeAttribute('data-active');
      }
      onUpdate?.(sectionId);
      if (history && (force || previousIdRef.current !== sectionId)) {
        window.history.replaceState({}, '', `#${sectionId}`);
      }
      previousIdRef.current = sectionId;
    },
    [dataAttribute, history, onUpdate],
  );

  const handleScroll = useCallback(() => {
    if (anchorElementsRef.current.length === 0) return;
    let scrollElement =
      targetRef?.current === document
        ? document.documentElement
        : (targetRef?.current as HTMLElement | null | undefined);
    if (!scrollElement) return;
    const viewport = scrollElement.querySelector('[data-slot="scroll-area-viewport"]');
    if (viewport instanceof HTMLElement) scrollElement = viewport;
    const scrollTop =
      scrollElement === document.documentElement
        ? window.scrollY || document.documentElement.scrollTop
        : scrollElement.scrollTop;
    let activeIndex = 0;
    let minimumDelta = Number.POSITIVE_INFINITY;
    anchorElementsRef.current.forEach((anchor, index) => {
      const sectionId = anchor.getAttribute(`data-${dataAttribute}-anchor`);
      const section = sectionId ? document.getElementById(sectionId) : null;
      if (!section) return;
      const dataOffset = anchor.getAttribute(`data-${dataAttribute}-offset`);
      const customOffset = dataOffset ? Number.parseInt(dataOffset, 10) : offset;
      const delta = Math.abs(section.offsetTop - customOffset - scrollTop);
      if (section.offsetTop - customOffset <= scrollTop && delta < minimumDelta) {
        minimumDelta = delta;
        activeIndex = index;
      }
    });
    if (scrollTop + scrollElement.clientHeight >= scrollElement.scrollHeight - 2) {
      activeIndex = anchorElementsRef.current.length - 1;
    }
    setActiveSection(
      anchorElementsRef.current[activeIndex]?.getAttribute(`data-${dataAttribute}-anchor`) ?? null,
    );
  }, [dataAttribute, offset, setActiveSection, targetRef]);

  const scrollTo = useCallback(
    (anchor: HTMLElement) => (event?: Event) => {
      event?.preventDefault();
      const sectionId = anchor.getAttribute(`data-${dataAttribute}-anchor`)?.replace('#', '');
      const section = sectionId ? document.getElementById(sectionId) : null;
      if (!sectionId || !section) return;
      let target: HTMLElement | Window | null =
        targetRef?.current === document ? window : (targetRef?.current as HTMLElement | null);
      if (target instanceof HTMLElement) {
        const viewport = target.querySelector('[data-slot="scroll-area-viewport"]');
        if (viewport instanceof HTMLElement) target = viewport;
      }
      const dataOffset = anchor.getAttribute(`data-${dataAttribute}-offset`);
      const customOffset = dataOffset ? Number.parseInt(dataOffset, 10) : offset;
      target?.scrollTo({ behavior: smooth ? 'smooth' : 'auto', left: 0, top: section.offsetTop - customOffset });
      setActiveSection(sectionId, true);
    },
    [dataAttribute, offset, setActiveSection, smooth, targetRef],
  );

  useEffect(() => {
    anchorElementsRef.current = selfRef.current
      ? Array.from(selfRef.current.querySelectorAll(`[data-${dataAttribute}-anchor]`))
      : [];
    const cleanups = navigate ? anchorElementsRef.current.map((item) => {
      const handler = scrollTo(item as HTMLElement);
      item.addEventListener('click', handler);
      return () => item.removeEventListener('click', handler);
    }) : [];
    const onScroll = (event: Event) => {
      const target = targetRef?.current === document ? window : targetRef?.current;
      if (
        target === window ||
        (target instanceof HTMLElement && target.contains(event.target as Node))
      ) {
        handleScroll();
      }
    };
    window.addEventListener('scroll', onScroll, true);
    const frame = window.requestAnimationFrame(handleScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.cancelAnimationFrame(frame);
      for (const cleanup of cleanups) cleanup();
    };
  }, [dataAttribute, handleScroll, navigate, refreshKey, scrollTo, targetRef]);

  return (
    <div className={className} data-slot="scrollspy" ref={selfRef}>
      {children}
    </div>
  );
}
