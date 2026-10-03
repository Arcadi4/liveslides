import { renderSlide, type PresentationData } from "@aiden0z/pptx-renderer";

/** Snapshot the first slide once, without retaining the deck or its media URLs. */
export async function createThumbnail(presentation: PresentationData): Promise<string> {
  const slide = presentation.slides[0];
  if (!slide) return "";
  const handle = renderSlide(presentation, slide);
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-100000px;top:0;pointer-events:none;";
  container.setAttribute("aria-hidden", "true");
  container.appendChild(handle.element);
  document.body.appendChild(container);
  try {
    const [{ toCanvas }] = await Promise.all([import("html-to-image"), handle.ready]);
    await document.fonts.ready;
    // Cover the widest recent card (448 CSS pixels) at 2x display density.
    const width = 896;
    const canvas = await toCanvas(handle.element, {
      canvasWidth: width,
      canvasHeight: Math.max(1, Math.round((width * presentation.height) / presentation.width)),
      pixelRatio: 1,
      skipFonts: true,
    });
    return canvas.toDataURL("image/webp", 0.9);
  } finally {
    handle.dispose();
    container.remove();
  }
}
