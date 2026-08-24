import type { ReactNode } from 'react';
import {
  Frame,
  FrameDescription,
  FrameFooter,
  FrameHeader,
  FramePanel,
  FrameTitle,
} from '@/components/reui/frame';

interface ClioSettingsSectionProps {
  children: ReactNode;
  description: ReactNode;
  footer?: ReactNode;
  title: ReactNode;
}

/** A flat settings composition built from the sourced ReUI Frame primitives. */
export function ClioSettingsSection({
  children,
  description,
  footer,
  title,
}: ClioSettingsSectionProps) {
  return (
    <Frame className="gap-3 bg-transparent p-0" spacing="lg" variant="ghost">
      <FrameHeader className="px-0 py-0">
        <FrameTitle className="flex items-center gap-2">{title}</FrameTitle>
        <FrameDescription>{description}</FrameDescription>
      </FrameHeader>
      <FramePanel className="border-0 bg-transparent p-0 shadow-none before:hidden">
        {children}
      </FramePanel>
      {footer ? <FrameFooter className="items-start px-0 py-0">{footer}</FrameFooter> : null}
    </Frame>
  );
}
