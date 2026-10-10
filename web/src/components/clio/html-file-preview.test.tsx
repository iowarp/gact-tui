import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it } from 'vitest';
import { HtmlFilePreview } from './html-file-preview';
import { htmlPreviewDocument } from './html-preview-policy';

afterEach(cleanup);

it('retains authored CSS, animation and local SVG references in an isolated display copy', () => {
  const content = `<!doctype html><html><head><title>Cat</title><style>
    @keyframes roll { to { transform: rotate(360deg); } }
    .wheel { animation: roll 2s linear infinite; }
    </style></head><body><h1>Pedal!</h1><svg viewBox="0 0 100 100">
    <defs><circle id="wheel" cx="20" cy="20" r="10"/></defs>
    <use href="#wheel" class="wheel"/></svg></body></html>`;
  const document = new DOMParser().parseFromString(htmlPreviewDocument(content), 'text/html');
  expect(document.title).toBe('Cat');
  expect(document.querySelector('style:last-child')?.textContent).toContain('@keyframes roll');
  expect(document.querySelector('svg use')?.getAttribute('href')).toBe('#wheel');
  const policy = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  expect(policy?.getAttribute('content')).toContain("default-src 'none'");
  expect(policy?.getAttribute('content')).toContain("script-src 'none'");
  expect(document.head.children[1]).toBe(policy);
  render(<HtmlFilePreview name="cat.html" content={content} />);
  expect(
    screen.getByText(/Static preview · Scripts and external resources are disabled/),
  ).toBeVisible();
  expect(screen.getByTitle('HTML preview of cat.html')).toHaveAttribute('sandbox', '');
  expect(screen.getByTitle('HTML preview of cat.html')).toHaveAttribute(
    'referrerpolicy',
    'no-referrer',
  );
});

it('removes active content, navigation and external media while retaining embedded images', () => {
  const html = htmlPreviewDocument(`<html><head>
    <meta http-equiv="refresh" content="0;url=https://example.com/leave">
    <base href="https://example.com/"><link rel="stylesheet" href="remote.css">
    <script>window.top.location='https://example.com';</script></head><body onload="alert(1)">
    <a href="https://example.com/leave" target="_top">External</a>
    <img id="external" src="https://example.com/image.png" srcset="remote.png 2x">
    <img id="embedded" src="data:image/png;base64,AAAA">
    <iframe src="https://example.com"></iframe><object data="remote.pdf"></object>
    <form action="https://example.com"><button formaction="remote">Submit</button></form>
    <style>body { background-image: url(https://example.com/style.png); }</style>
    </body></html>`);
  const document = new DOMParser().parseFromString(html, 'text/html');
  expect(document.querySelectorAll('script,base,link,iframe,object,embed')).toHaveLength(0);
  expect(document.querySelectorAll('meta')).toHaveLength(2);
  expect(document.body.hasAttribute('onload')).toBe(false);
  expect(document.querySelector('a')?.hasAttribute('href')).toBe(false);
  expect(document.querySelector('#external')?.hasAttribute('src')).toBe(false);
  expect(document.querySelector('#external')?.hasAttribute('srcset')).toBe(false);
  expect(document.querySelector('#embedded')?.getAttribute('src')).toBe(
    'data:image/png;base64,AAAA',
  );
  expect(document.querySelector('form')?.hasAttribute('action')).toBe(false);
  expect(document.querySelector('button')?.hasAttribute('formaction')).toBe(false);
  // Author CSS stays readable; its external URLs are blocked by the first policy.
  expect(document.querySelector('meta[http-equiv]')?.getAttribute('content')).toContain(
    'img-src data: blob:',
  );
});

it('opens HTML source without sanitizing the original bytes shown or copied', async () => {
  const content = '<h1>Original</h1>\n<script>window.original = true;</script>\n';
  const { container } = render(<HtmlFilePreview name="report.htm" content={content} />);
  expect(screen.getByTitle('HTML preview of report.htm').getAttribute('srcdoc')).not.toContain(
    'window.original',
  );
  await userEvent.click(screen.getByRole('tab', { name: 'Source' }));
  expect(container.querySelector('[data-language="html"]')).toHaveTextContent(
    'window.original = true;',
  );
  expect(screen.getByRole('button', { name: 'Copy report.htm' })).toBeVisible();
  await userEvent.click(screen.getByRole('tab', { name: 'Preview' }));
  expect(screen.getByTitle('HTML preview of report.htm')).toBeVisible();
});
