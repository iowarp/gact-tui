import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { ForcedTheme } from '../../src/theme/forced-theme';
import '../../src/index.css';
import { MarkdownText } from '../../src/components/ai-elements/markdown';
import { ContentMarkdown } from '../../src/components/clio/content-markdown';

const savedResponse = String.raw`For an incompressible Newtonian fluid, the Navier–Stokes momentum equation is

\[
\rho\left(\frac{\partial \mathbf{u}}{\partial t} + (\mathbf{u}\cdot\nabla)\mathbf{u}\right)
= -\nabla p + \mu\nabla^2\mathbf{u} + \mathbf{f}.
\]

The incompressibility condition is

\[\nabla\cdot\mathbf{u}=0.\]

Here \(\mathbf{u}\) is velocity, \(t\) is time, \(\rho\) is density, \(p\) is pressure, \(\mu\) is dynamic viscosity and \(\mathbf{f}\) is force per unit volume.`;

function Review() {
  const [complete, setComplete] = useState(false);
  const theme = new URLSearchParams(location.search).get('theme') === 'dark' ? 'dark' : 'light';
  return (
    <ForcedTheme theme={theme}>
      <main className="min-h-dvh bg-background px-6 py-6 text-foreground">
        <div className="mx-auto max-w-3xl space-y-6">
          <header className="border-b pb-4">
            <h1 className="text-xl font-semibold">Math in a CLIO response</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Renderer review fixture. Seeded response text, no model inference.
            </p>
          </header>
          <section aria-label="Saved response" className="min-w-0">
            <p className="mb-4 text-sm font-medium text-primary">CLIO</p>
            <ContentMarkdown mode="static">{savedResponse}</ContentMarkdown>
          </section>
          <section aria-label="Streaming response" className="border-t pt-4">
            <h2 className="mb-3 font-medium">While a response arrives</h2>
            <ContentMarkdown isAnimating={!complete}>
              {complete ? String.raw`The energy is \(E=mc^2\).` : String.raw`The energy is \(E=mc`}
            </ContentMarkdown>
            <button
              type="button"
              onClick={() => setComplete((value) => !value)}
              className="mt-3 rounded-md border px-3 py-2 text-sm"
            >
              {complete ? 'Restart streaming fixture' : 'Complete streaming fixture'}
            </button>
          </section>
          <section aria-label="Literal examples" className="border-t pt-4">
            <h2 className="mb-3 font-medium">Inline formulas, currency and code</h2>
            <MarkdownText mode="static">
              {
                'Inline formula: \\(x^2\\). Code-style notation: `x^2`. Cost: $20 and $30.\n\nLiteral TeX source for editing:\n\n```tex\n\\[x^2\\]\n```\n\nExisting inline syntax: $$x^2$$.\n\n$$\nE=mc^2\n$$'
              }
            </MarkdownText>
          </section>
          <section aria-label="Multiline equation" className="border-t pt-4">
            <MarkdownText>
              {String.raw`A multiline display with a blank line:

\[
\begin{aligned}
x &= 1 \\

y &= 2
\end{aligned}
\]`}
            </MarkdownText>
          </section>
          <section aria-label="Display in prose" className="border-t pt-4">
            <ContentMarkdown>
              {'Before \\[x_1=2\\] after.\n\n\\[\r\nx=1\r\n\\]  \r\n\r\nLast.'}
            </ContentMarkdown>
          </section>
        </div>
      </main>
    </ForcedTheme>
  );
}

createRoot(document.getElementById('root')!).render(<Review />);
