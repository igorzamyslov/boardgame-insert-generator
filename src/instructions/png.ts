// src/instructions/png.ts
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const VIEW_BOX = /viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/;

/** Canvases beyond this size fail on some browsers (iOS Safari); a tall plan is scaled down. */
export const MAX_PNG_HEIGHT_PX = 4096;

export function pngSize(svg: string, widthPx: number): { width: number; height: number } {
  const m = VIEW_BOX.exec(svg);
  const w = Number(m?.[3] ?? "1");
  const h = Number(m?.[4] ?? "1");
  const height = Math.round((widthPx * h) / Math.max(w, 1e-9));
  if (height <= MAX_PNG_HEIGHT_PX) {
    return { width: widthPx, height };
  }
  return {
    width: Math.max(1, Math.round((widthPx * MAX_PNG_HEIGHT_PX) / height)),
    height: MAX_PNG_HEIGHT_PX,
  };
}

/**
 * Gives the root element the pixel size the picture is drawn at. Without it a browser rasterises
 * at the SVG's own width and height and then scales that bitmap (blurry in Safari).
 */
export function withPixelSize(svg: string, width: number, height: number): string {
  return svg.replace(/^<svg\b[^>]*>?/, (tag) => {
    const rest = tag.slice("<svg".length).replace(/\s(?:width|height)="[^"]*"/g, "");
    return `<svg width="${width}" height="${height}"${rest}`;
  });
}

/** Draws the SVG on a white canvas and returns a PNG (spec §8.3 "PNG download per layer"). */
export async function svgToPng(svg: string, widthPx = 1600): Promise<Blob> {
  const { width, height } = pngSize(svg, widthPx);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Couldn't draw the layer picture."));
    img.src = svgDataUrl(withPixelSize(svg, width, height));
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
