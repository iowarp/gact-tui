import { formatFieldValue, legendTicks, turbo } from './mesh-viewport-colormap';
import type { MeshLegendState } from './mesh-viewport-legend';

/**
 * Compose a report-ready PNG: the rendered view on a white ground, the
 * view's title and state line, and the color scale when a field is shown.
 */
export function composeSnapshot(
  view: HTMLCanvasElement,
  heading: string,
  detail: string,
  legend: MeshLegendState | undefined,
): Promise<Blob> {
  const scale = view.width / Math.max(1, view.clientWidth || view.width);
  const pad = Math.round(16 * scale);
  const titleSize = Math.round(15 * scale);
  const textSize = Math.round(12 * scale);
  const legendHeight = legend ? Math.round(56 * scale) : 0;
  const header = pad + titleSize + textSize + Math.round(10 * scale);
  const canvas = document.createElement('canvas');
  canvas.width = view.width;
  canvas.height = header + view.height + legendHeight + pad;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('This browser cannot create an image.'));
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f172a';
  ctx.font = `600 ${titleSize}px system-ui, sans-serif`;
  ctx.fillText(heading, pad, pad + titleSize);
  ctx.fillStyle = '#475569';
  ctx.font = `${textSize}px system-ui, sans-serif`;
  ctx.fillText(detail, pad, pad + titleSize + textSize + Math.round(4 * scale));
  ctx.drawImage(view, 0, header);
  if (legend) {
    const top = header + view.height + Math.round(8 * scale);
    const width = canvas.width - pad * 2;
    ctx.fillStyle = '#0f172a';
    ctx.font = `500 ${textSize}px system-ui, sans-serif`;
    ctx.fillText(
      `${legend.field.label}${legend.field.unit ? ` (${legend.field.unit})` : ''}`,
      pad,
      top + textSize,
    );
    const barTop = top + textSize + Math.round(6 * scale);
    const barHeight = Math.round(10 * scale);
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = turbo(x / Math.max(1, width - 1));
      ctx.fillStyle = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
      ctx.fillRect(pad + x, barTop, 1, barHeight);
    }
    ctx.fillStyle = '#475569';
    ctx.font = `${textSize}px ui-monospace, monospace`;
    const ticks = legendTicks(legend.min, legend.max);
    ticks.forEach((tick, index) => {
      const label = formatFieldValue(tick);
      const x = pad + (width * index) / Math.max(1, ticks.length - 1);
      const measured = ctx.measureText(label).width;
      const left = Math.min(Math.max(pad, x - measured / 2), pad + width - measured);
      ctx.fillText(label, left, barTop + barHeight + textSize + Math.round(4 * scale));
    });
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('The image could not be encoded.'))),
      'image/png',
    ),
  );
}

/** Save a blob through a temporary link; the browser or desktop shell picks the location. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
