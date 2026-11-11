import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { DocumentViewControls } from './document-view-controls';

afterEach(cleanup);

function DocumentViews({ markdown }: { markdown: boolean }) {
  const [view, setView] = useState('preview');
  return (
    <Tabs value={view} onValueChange={setView}>
      <DocumentViewControls markdown={markdown} value={view} onChange={setView} />
      <TabsContent value="preview">Rendered document</TabsContent>
      <TabsContent value="raw">Original Markdown</TabsContent>
    </Tabs>
  );
}

it('switches between reading and source as segmented modes', async () => {
  const user = userEvent.setup();
  render(<DocumentViews markdown />);
  const modes = screen.getByRole('tablist', { name: 'File representations' });
  expect(within(modes).getByRole('tab', { name: 'Read document' })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await user.click(within(modes).getByRole('tab', { name: 'Source' }));
  expect(screen.getByText('Original Markdown')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Document actions' })).toBeNull();
  expect(screen.queryByText('Document safety')).toBeNull();
});

it('offers no mode switch for an Office document with only a reading view', () => {
  render(<DocumentViews markdown={false} />);
  expect(screen.queryByRole('tablist', { name: 'File representations' })).toBeNull();
  expect(screen.getByText('Rendered document')).toBeVisible();
});
