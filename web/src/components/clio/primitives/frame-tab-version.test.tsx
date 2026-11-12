import { cleanup, render, screen } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { afterEach, describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { FrameTab } from './frame-bar';

afterEach(cleanup);

describe('a versioned frame tab', () => {
  it('keeps its version in the name when short of room shows only its icon', () => {
    render(
      <TooltipProvider>
        <div role="tablist">
          <FrameTab active compact icon={<FileText />} label="qa-notes.md" version="v2" />
          <FrameTab compact icon={<FileText />} label="qa-notes.md" version="v1" />
        </div>
      </TooltipProvider>,
    );
    expect(screen.getByRole('tab', { name: /^qa-notes\.md\s*v2$/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /^qa-notes\.md\s*v1$/ })).toBeTruthy();
  });
});