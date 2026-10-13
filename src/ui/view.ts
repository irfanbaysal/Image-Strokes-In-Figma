export interface Size { width: number; height: number }
export interface Point { x: number; y: number }
export interface View { zoom: number; x: number; y: number }

export const ZOOM_MIN = 1;
export const ZOOM_MAX = 8;
export const KEEP_VISIBLE = 24;
export const IDENTITY_VIEW: View = Object.freeze({ zoom: 1, x: 0, y: 0 });

function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom));
}

function clampOffset(value: number, imageExtent: number, boxExtent: number, zoom: number): number {
  if (!Number.isFinite(value)) return 0;
  const limit = Math.max(0, (imageExtent * zoom + boxExtent) / 2 - KEEP_VISIBLE);
  return Math.max(-limit, Math.min(limit, value)) + 0;
}

export function clampView(view: View, box: Size, image: Size): View {
  const zoom = clampZoom(view.zoom);
  if (zoom === 1) return { zoom, x: 0, y: 0 };
  return {
    zoom,
    x: clampOffset(view.x, image.width, box.width, zoom),
    y: clampOffset(view.y, image.height, box.height, zoom),
  };
}

export function zoomAt(view: View, factor: number, point: Point, box: Size, image: Size): View {
  const from = clampZoom(view.zoom);
  const zoom = clampZoom(from * factor);
  const k = zoom / from;
  const x = Number.isFinite(view.x) ? view.x : 0;
  const y = Number.isFinite(view.y) ? view.y : 0;
  return clampView(
    { zoom, x: point.x - (point.x - x) * k, y: point.y - (point.y - y) * k },
    box,
    image,
  );
}

export function panBy(view: View, dx: number, dy: number, box: Size, image: Size): View {
  return clampView({ zoom: view.zoom, x: view.x + dx, y: view.y + dy }, box, image);
}
