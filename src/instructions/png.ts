// src/instructions/png.ts
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const VIEW_BOX = /viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/;

export function pngSize(svg: string, widthPx: number): { width: number; height: number } {
  const m = VIEW_BOX.exec(svg);
  const w = Number(m?.[3] ?? "1");
  const h = Number(m?.[4] ?? "1");
  return { width: widthPx, height: Math.round((widthPx * h) / Math.max(w, 1e-9)) };
}

/** Draws the SVG on a white canvas and returns a PNG (spec §8.3 "PNG download per layer"). */
export async function svgToPng(svg: string, widthPx = 1600): Promise<Blob> {
  const { width, height } = pngSize(svg, widthPx);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Couldn't draw the layer picture."));
    img.src = svgDataUrl(svg);
  });
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Drawing on a canvas isn't available in this browser.");
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("PNG export failed."));
      }
    }, "image/png");
  });
}
