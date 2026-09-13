import type { KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import {
  Carousel,
  type CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import { cn } from '@/lib/utils';

export interface AttachmentPreviewCarouselItem {
  id: string;
  label: string;
  renderPreview: () => ReactNode;
  renderThumbnail: () => ReactNode;
}

interface AttachmentPreviewCarouselProps {
  className?: string;
  items: readonly AttachmentPreviewCarouselItem[];
  onValueChange: (id: string) => void;
  value: string;
}

/**
 * Synchronizes a full attachment preview with a draggable thumbnail rail.
 * The selected preview and its immediate neighbors are mounted so drag and
 * arrow transitions remain continuous without allocating every heavy reader.
 */
export function AttachmentPreviewCarousel({
  className,
  items,
  onValueChange,
  value,
}: AttachmentPreviewCarouselProps) {
  const [mainApi, setMainApi] = useState<CarouselApi>();
  const [thumbnailApi, setThumbnailApi] = useState<CarouselApi>();
  const selectedIndex = Math.max(
    0,
    items.findIndex((item) => item.id === value),
  );

  const selectIndex = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item) return;
      onValueChange(item.id);
      mainApi?.scrollTo(index);
      thumbnailApi?.scrollTo(index);
    },
    [items, mainApi, onValueChange, thumbnailApi],
  );

  const handlePreviewKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement;
      const ownsArrowKeys =
        target === event.currentTarget ||
        Boolean(target.closest('[data-slot="carousel-previous"], [data-slot="carousel-next"]'));
      if (!ownsArrowKeys) return;
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        selectIndex(selectedIndex - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        selectIndex(selectedIndex + 1);
      }
    },
    [selectIndex, selectedIndex],
  );

  const focusPreviewCarousel = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, select, textarea, [contenteditable="true"]')) return;
    event.currentTarget.focus({ preventScroll: true });
  }, []);

  const selectMainSlide = useCallback(() => {
    if (!mainApi) return;
    // A hidden or not-yet-measured carousel reports a single inert snap even
    // when it contains several items. Keep the controlled selection instead
    // of incorrectly resetting it to the first attachment.
    if (items.length > 1 && !mainApi.canScrollPrev() && !mainApi.canScrollNext()) return;
    const index = mainApi.selectedScrollSnap();
    const item = items[index];
    if (!item) return;
    onValueChange(item.id);
    thumbnailApi?.scrollTo(index);
  }, [items, mainApi, onValueChange, thumbnailApi]);

  useEffect(() => {
    if (!mainApi) return;
    selectMainSlide();
    mainApi.on('select', selectMainSlide);
    mainApi.on('reInit', selectMainSlide);
    return () => {
      mainApi.off('select', selectMainSlide);
      mainApi.off('reInit', selectMainSlide);
    };
  }, [mainApi, selectMainSlide]);

  useEffect(() => {
    if (!mainApi || items.length === 0) return;
    if (mainApi.selectedScrollSnap() !== selectedIndex) mainApi.scrollTo(selectedIndex);
    thumbnailApi?.scrollTo(selectedIndex);
  }, [items.length, mainApi, selectedIndex, thumbnailApi]);

  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        'grid min-h-0 grid-rows-[minmax(0,1fr)_auto] gap-3',
        items.length === 1 && 'grid-rows-[minmax(0,1fr)]',
        className,
      )}
      data-slot="attachment-preview-carousel"
    >
      <Carousel
        aria-label="Attachment previews"
        className="h-full min-h-0 [&_[data-slot=carousel-content]]:h-full"
        onKeyDownCapture={handlePreviewKeyDown}
        onPointerDown={focusPreviewCarousel}
        opts={{ startIndex: selectedIndex }}
        setApi={setMainApi}
        tabIndex={0}
      >
        <CarouselContent className="-ml-0 h-full">
          {items.map((item, index) => (
            <CarouselItem
              aria-label={`${index + 1} of ${items.length}: ${item.label}`}
              className="h-full pl-0"
              key={item.id}
            >
              {Math.abs(index - selectedIndex) <= 1 ? item.renderPreview() : null}
            </CarouselItem>
          ))}
        </CarouselContent>
        {items.length > 1 ? (
          <>
            <CarouselPrevious
              aria-label="Previous attachment"
              className="left-3 bg-background/90 shadow-sm backdrop-blur-sm"
              disabled={selectedIndex === 0}
              onClick={() => selectIndex(selectedIndex - 1)}
            />
            <CarouselNext
              aria-label="Next attachment"
              className="right-3 bg-background/90 shadow-sm backdrop-blur-sm"
              disabled={selectedIndex === items.length - 1}
              onClick={() => selectIndex(selectedIndex + 1)}
            />
          </>
        ) : null}
      </Carousel>

      {items.length > 1 ? (
        <Carousel
          aria-label="Choose an attachment"
          className="w-full"
          opts={{ containScroll: 'keepSnaps', dragFree: true, startIndex: selectedIndex }}
          setApi={setThumbnailApi}
        >
          <CarouselContent className="-ml-2 flex-row px-1">
            {items.map((item, index) => (
              <CarouselItem className="basis-24 pl-2 sm:basis-28" key={item.id}>
                <button
                  aria-current={index === selectedIndex ? 'true' : undefined}
                  aria-label={`Show ${item.label}`}
                  className={cn(
                    'block w-full rounded-lg border-2 p-0.5 text-left opacity-55 transition-opacity',
                    'hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    index === selectedIndex && 'border-primary opacity-100',
                    index !== selectedIndex && 'border-transparent',
                  )}
                  onClick={() => selectIndex(index)}
                  type="button"
                >
                  {item.renderThumbnail()}
                </button>
              </CarouselItem>
            ))}
          </CarouselContent>
        </Carousel>
      ) : null}
    </div>
  );
}
