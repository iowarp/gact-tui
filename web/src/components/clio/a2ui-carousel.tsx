import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas, componentId, type ResolvedChildRef } from '@a2ui/web_core/v0_9';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { z } from 'zod';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel';
import { a2uiAccessibilityLabel, a2uiAccessibilityProps } from './a2ui-accessibility';
import { dataViewFlexStyle } from './data-view-layout';
import { isBoundToPath } from './selection-state';
import { t, ph } from '@lingui/core/macro';

/** One selected child at a time; media use their existing authenticated viewers. */
export const ClioCarousel = createComponentImplementation(
  {
    name: 'Carousel',
    schema: z
      .object({
        children: z.array(componentId()).min(1),
        activeChild: CommonSchemas.DynamicString.optional(),
        accessibility: CommonSchemas.AccessibilityAttributes.optional(),
        weight: z.number().optional(),
      })
      .strict(),
  },
  ({ props, context, buildChild }) => {
    const [local, setLocal] = useState<string>();
    const [api, setApi] = useState<CarouselApi>();
    const children = props.children as Array<string | ResolvedChildRef>;
    const childId = (child: string | ResolvedChildRef) =>
      typeof child === 'string' ? child : child.id;
    const bound = isBoundToPath(context.componentModel.properties.activeChild);
    const requested = bound ? props.activeChild : (local ?? props.activeChild);
    const found = children.findIndex((child) => childId(child) === requested);
    const index = found < 0 ? 0 : found;
    const invalid = requested !== undefined && found < 0;

    useEffect(() => {
      api?.scrollTo(index, true);
    }, [api, index, children.length, requested]);

    function select(next: number) {
      const child = children[next];
      if (!child) return;
      if (bound) (props.setActiveChild as unknown as (value: string) => void)?.(childId(child));
      else setLocal(childId(child));
      // Content mounts only when selected; jump instead of animating blank neighbors.
      api?.scrollTo(next, true);
    }

    function navigate(event: KeyboardEvent<HTMLDivElement>) {
      const target = event.target as HTMLElement;
      // Inputs, video controls and analytical views keep their own arrow keys.
      if (
        target !== event.currentTarget &&
        !target.closest('[data-slot="carousel-previous"], [data-slot="carousel-next"]')
      )
        return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        select(index + (event.key === 'ArrowLeft' ? -1 : 1));
      }
    }

    // Bound updates can select a slide without a click on this carousel.
    const selectedChild = children[index]!;
    const selectedId = childId(selectedChild);
    return (
      <Carousel
        {...a2uiAccessibilityProps(props.accessibility)}
        aria-label={a2uiAccessibilityLabel(props.accessibility) || t`Carousel`}
        className="min-w-0 space-y-2"
        data-a2ui-component-id={context.componentModel.id}
        data-visual-state={invalid ? 'failed' : 'ready'}
        onKeyDownCapture={navigate}
        opts={{ startIndex: index, watchDrag: false }}
        setApi={setApi}
        style={dataViewFlexStyle(props.weight)}
        tabIndex={0}
      >
        {invalid && <p role="alert">{t`The selected slide is unavailable.`}</p>}
        <div className="flex items-center justify-end gap-1">
          <span
            aria-live="polite"
            aria-atomic="true"
            className="mr-1 text-xs tabular-nums text-muted-foreground"
          >
            {t`${ph({ position: index + 1 })} of ${ph({ total: children.length })}`}
          </span>
          <CarouselPrevious
            className="static inset-auto my-0"
            disabled={index === 0}
            onClick={() => select(index - 1)}
            variant="ghost"
          />
          <CarouselNext
            className="static inset-auto my-0"
            disabled={index === children.length - 1}
            onClick={() => select(index + 1)}
            variant="ghost"
          />
        </div>
        <CarouselContent className="-ml-0">
          {children.map((child, position) => (
            <CarouselItem
              aria-label={t`${ph({ position: position + 1 })} of ${ph({ total: children.length })}`}
              aria-hidden={position !== index}
              className="pl-0"
              key={`${childId(child)}:${position}`}
            >
              {position === index ? (
                <div key={selectedId}>
                  {buildChild(
                    selectedId,
                    typeof selectedChild === 'string' ? undefined : selectedChild.basePath,
                  )}
                </div>
              ) : null}
            </CarouselItem>
          ))}
        </CarouselContent>
      </Carousel>
    );
  },
);
