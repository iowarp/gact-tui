import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas, componentId } from '@a2ui/web_core/v0_9';
import { useState } from 'react';
import { z } from 'zod';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { isBoundToPath } from './selection-state';

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
    const [local, setLocal] = useState<string>();
    const bound = isBoundToPath(context.componentModel.properties.activeTab);
    const selected = bound ? props.activeTab : (local ?? props.activeTab);
    const active = props.tabs.some((tab) => tab.child === selected)
      ? selected
      : props.tabs[0]!.child;
    const invalid = selected !== undefined && !props.tabs.some((tab) => tab.child === selected);
    return (
      <div
        data-a2ui-component-id={context.componentModel.id}
        data-visual-state={invalid ? 'failed' : 'ready'}
      >
        {invalid && <p role="alert">The selected dashboard tab is unavailable.</p>}
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
