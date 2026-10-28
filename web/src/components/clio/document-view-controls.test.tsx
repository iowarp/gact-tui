import { cleanup, render, screen } from '@testing-library/react';
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
      <DocumentViewControls markdown={markdown} reviewCount={2} value={view} onChange={setView} />
      <TabsContent value="preview">Rendered document</TabsContent>
      <TabsContent value="raw">Original Markdown</TabsContent>
      <TabsContent value="reviews">Document reviews</TabsContent>
      <TabsContent value="policy">Document safety details</TabsContent>
    </Tabs>
  );
}

it('keeps the selected view and every document detail available through the compact menu', async () => {
  const user = userEvent.setup();
  render(<DocumentViews markdown />);
  await user.click(screen.getByRole('button', { name: 'File representations' }));
  expect(screen.getByRole('menuitemradio', { name: 'Read document' })).toBeChecked();
  await user.click(screen.getByRole('menuitemradio', { name: 'Source' }));
  expect(screen.getByText('Original Markdown')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'File representations' }));
  expect(screen.getByRole('menuitemradio', { name: 'Source' })).toBeChecked();
  expect(screen.queryByRole('menuitemradio', { name: 'Reviews, 2' })).toBeNull();
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Document actions' }));
  expect(screen.getByRole('menuitemcheckbox', { name: 'Reviews, 2' })).toBeVisible();
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Document safety' }));
  expect(screen.getByText('Document safety details')).toBeVisible();
});

it('offers only applicable views for an Office document', async () => {
  const user = userEvent.setup();
  render(<DocumentViews markdown={false} />);
  expect(screen.queryByRole('button', { name: 'File representations' })).toBeNull();
  expect(screen.queryByRole('menuitemradio', { name: 'Source' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Document actions' }));
  await user.click(screen.getByRole('menuitemcheckbox', { name: 'Reviews, 2' }));
  expect(screen.getByText('Document reviews')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Read document' }));
  expect(screen.getByText('Rendered document')).toBeVisible();
});
