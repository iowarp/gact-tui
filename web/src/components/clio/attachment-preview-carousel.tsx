import type { ReactNode } from 'react';
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
 * Only the selected preview is mounted so PDF, video, and image readers do not
 * all allocate their backing data when a message contains several resources.
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
        opts={{ startIndex: selectedIndex }}
        setApi={setMainApi}
      >
        <CarouselContent className="-ml-0 h-full">
          {items.map((item, index) => (
            <CarouselItem
              aria-label={`${index + 1} of ${items.length}: ${item.label}`}
              className="h-full pl-0"
              key={item.id}
            >
              {index === selectedIndex ? item.renderPreview() : null}
            </CarouselItem>
          ))}
        </CarouselContent>
        {items.length > 1 ? (
          <>
            <CarouselPrevious
              aria-label="Previous attachment"
              className="left-3 bg-background/90 shadow-sm backdrop-blur-sm"
            />
            <CarouselNext
              aria-label="Next attachment"
              className="right-3 bg-background/90 shadow-sm backdrop-blur-sm"
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
                  onClick={() => {
                    onValueChange(item.id);
                    mainApi?.scrollTo(index);
                  }}
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
