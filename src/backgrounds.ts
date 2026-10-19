import type { BackgroundStage } from './types';

/** Project a reviewed source-image floor through the same bottom-aligned cover crop as CSS. */
export function projectStage(stage: BackgroundStage | undefined, width: number, height: number) {
  if (!stage) {
    // Uploaded art has no reviewed floor. Keep a predictable foreground placement.
    return { floor: height * 0.79, scale: Math.min(1.55, height / 260), min: 18, max: 82, focusX: 50 };
  }
  const zoom = Math.max(width / stage.width, height / stage.height);
  const imageWidth = stage.width * zoom;
  const imageHeight = stage.height * zoom;
  const focusX = stage.focusX ?? 0.5;
  const offsetX = (width - imageWidth) * focusX;
  const floor = height - imageHeight * (1 - stage.floor);
  const scale = (imageHeight * stage.ponyHeight) / 84;
  // Leave room for the body and tail, even in a narrow phone crop.
  const edge = Math.min(30, ((60 * scale + 8) / width) * 100);
  const min = Math.max(edge, ((stage.walk[0] * imageWidth + offsetX) / width) * 100);
  const max = Math.min(100 - edge, ((stage.walk[1] * imageWidth + offsetX) / width) * 100);
  return { floor, scale, min: Math.min(min, max - 5), max, focusX: focusX * 100 };
}
