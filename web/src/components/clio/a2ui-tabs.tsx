import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas, componentId } from '@a2ui/web_core/v0_9';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { SurfaceQuestionTabs } from '@/lib/a2ui/question-navigation';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isBoundToPath } from './selection-state';
import { t } from '@lingui/core/macro';

/**
 * The tab a person picked, by surface and component id. A server re-render
 * can rebuild the surface and remount the Tabs, which would otherwise reopen
 * the first tab and hide an error on the one they were filling in.
 */
const pickedTabs = new Map<string, string>();
const PICKED_TABS_LIMIT = 200;

function rememberPickedTab(key: string, child: string) {
  pickedTabs.delete(key);
  pickedTabs.set(key, child);
  if (pickedTabs.size > PICKED_TABS_LIMIT) {
    const oldest = pickedTabs.keys().next().value;
    if (oldest !== undefined) pickedTabs.delete(oldest);
  }
}

/** Workspace Tabs add one declared binding; the upstream Basic catalog stays immutable. */
export const ClioTabs = createComponentImplementation(
  {
    name: 'Tabs',
    schema: z
      .object({
        tabs: z
          .array(z.object({ title: CommonSchemas.DynamicString, child: componentId() }).strict())
          .min(1),
        activeTab: CommonSchemas.DynamicString.optional(),
        accessibility: CommonSchemas.AccessibilityAttributes.optional(),
        weight: z.number().optional(),
      })
      .strict(),
  },
  ({ props, context, buildChild }) => {
    const pickKey = `${context.dataContext.surface.id}\u0000${context.componentModel.id}`;
    const [local, setLocalState] = useState<string | undefined>(() => pickedTabs.get(pickKey));
    const setLocal = useCallback(
      (child: string) => {
        rememberPickedTab(pickKey, child);
        setLocalState(child);
      },
      [pickKey],
    );
    const navigation = useContext(SurfaceQuestionTabs);
    const requestedChild = navigation?.tabs.get(context.componentModel.id);
    const handledRequest = useRef<number | undefined>(undefined);
    const bound = isBoundToPath(context.componentModel.properties.activeTab);
    const setActiveTab = props.setActiveTab as unknown as ((value: string) => void) | undefined;
    useEffect(() => {
      if (!requestedChild || !navigation || handledRequest.current === navigation.request) return;
      handledRequest.current = navigation.request;
      if (bound) setActiveTab?.(requestedChild);
      else setLocal(requestedChild);
    }, [bound, navigation, setActiveTab, setLocal, requestedChild]);
    const picked = props.tabs.some((tab) => tab.child === local) ? local : undefined;
    const selected = bound ? props.activeTab : (picked ?? props.activeTab);
    const active = props.tabs.some((tab) => tab.child === selected)
      ? selected
      : props.tabs[0]!.child;
    const invalid = selected !== undefined && !props.tabs.some((tab) => tab.child === selected);
    return (
      <div
        data-a2ui-component-id={context.componentModel.id}
        data-visual-state={invalid ? 'failed' : 'ready'}
      >
        {invalid && <p role="alert">{t`The selected dashboard tab is unavailable.`}</p>}
        <Tabs
          value={active}
          onValueChange={(value) => {
            if (bound) (props.setActiveTab as unknown as (value: string) => void)?.(value);
            else setLocal(value);
          }}
        >
          <TabsList
            variant="line"
            className="max-w-full flex-wrap justify-start group-data-horizontal/tabs:h-auto"
          >
            {props.tabs.map((tab) => (
              <TabsTrigger key={tab.child} value={tab.child} className="h-8 flex-none">
                {context.dataContext.resolveDynamicValue<string>(tab.title)}
              </TabsTrigger>
            ))}
          </TabsList>
          {props.tabs.map((tab) => (
            <TabsContent key={tab.child} value={tab.child}>
              {buildChild(tab.child)}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    );
  },
);
