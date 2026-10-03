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
    const [{ toCanvas }] = await Promise.all([
      import("html-to-image"),
      handle.ready,
      document.fonts.ready,
    ]);
    const source = await toCanvas(handle.element, {
      canvasWidth: 240,
      canvasHeight: Math.max(1, Math.round((240 * presentation.height) / presentation.width)),
      pixelRatio: 1,
      backgroundColor: "#fff",
      skipFonts: true,
    });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) return "";
    // A cookie must fit the preview, room credentials, title, and encryption overhead.
    for (let width = 240; width >= 30; width = Math.floor(width * 0.75)) {
      canvas.width = width;
      canvas.height = Math.max(1, Math.round((width * source.height) / source.width));
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const thumbnail = canvas.toDataURL("image/webp", 0.45);
      if (thumbnail.length <= 1800) return thumbnail;
    }
    return "";
  } finally {
    handle.dispose();
    container.remove();
  }
}
