export interface Size { width: number; height: number }

export interface PreviewLayout {
  scale: number;
  imageWidth: number;
  imageHeight: number;
  radius: number;
}

export function previewLayout(strokeWidth: number, box: Size, image: Size, margin = 3): PreviewLayout {
  const scale = Math.min(
    1,
    (box.height / 2 - margin) / (image.height / 2 + strokeWidth),
    (box.width / 2 - margin) / (image.width / 2 + strokeWidth),
  );
  return {
    scale,
    imageWidth: image.width * scale,
    imageHeight: image.height * scale,
    radius: strokeWidth * scale,
  };
}
