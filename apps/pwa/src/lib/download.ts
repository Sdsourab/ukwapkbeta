/** Triggers a browser download for in-memory data. Object URLs are revoked after use. */
export function downloadBlob(data: BlobPart, filename: string, type: string): void {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export function safeFilename(name: string, ext: string): string {
  const base = name.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'untitled';
  return `${base}.${ext}`;
}

export function dateStamp(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export async function readFileText(file: File, maxBytes = 200 * 1024 * 1024): Promise<string> {
  if (file.size > maxBytes) throw new Error(`That file is larger than ${Math.round(maxBytes / 1048576)} MB.`);
  return file.text();
}

/** Rasterises an SVG string to a PNG blob (browser only). */
export async function svgToPngBlob(svg: string, scale = 2): Promise<Blob> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Could not render the graph image.')); img.src = url; });
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available.');
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed.'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}
