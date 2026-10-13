# Changelog

Technical changes per release. Versions follow [Semantic Versioning](https://semver.org/); while the major version is 0, minor releases may change the message protocol between the plugin thread and the panel.

## [0.2.0] - 2026-10-14

### Added

- Vector output. `Create As Vector` traces the image's alpha silhouette into a vector path, gives it a native Figma stroke (centered, weight twice the chosen width, round joins and caps, same color as the fill) and groups it under a clone of the source image.
- `src/image/trace.ts`: marching squares on the alpha channel at the 50 % iso-level with linearly interpolated crossings. The sample grid is padded with one ring of zeros so shapes touching the border close; saddle cells are resolved by the average of their four corners; segments are linked into loops through a map, in linear time. Outer boundaries and holes come out with opposite winding.
- `src/image/simplify.ts`: closed-polygon Ramer-Douglas-Peucker (iterative, explicit stack), a signed-area filter that drops contours under 2 px², a budget of 6000 points that doubles the tolerance up to six times before giving up, and a writer for absolute `M` / `L` / `Z` path data rounded to two decimals.
- `planVectorExport` in `src/image/validation.ts`: export planning for jobs that need no room for a stroke (2 px padding, scale 2 then 1, same size limits as the image output).
- `isVectorPathData` in `src/image/validation.ts`: a single-pass scanner that accepts only `M x y L x y ... Z` subpaths of at least three points, plain decimals, single spaces, at most 400,000 characters. The plugin thread re-validates every path with it before touching the document.
- Message protocol: `OutputKind` (`'image' | 'vector'`) and the `vector-result` message from the panel to the plugin thread.
- `scripts/vector-figure.mjs`: renders `docs/features/vector.png` from the tracing code with headless Chrome.
- Unit tests for tracing, simplification, path validation and the new protocol fields (51 tests before, 78 now).

### Changed

- The single `Create Stroke` button is replaced by `Create As Image` and `Create As Vector`. Enter in the Width or HEX field triggers the image output.
- Message protocol: `create-request` and `source-ready` now carry a required `output` field. A panel and a plugin thread from different versions do not interoperate.
- A result of the wrong kind for the running job (`render-result` for a vector job, `vector-result` for an image job) fails the job instead of being applied.
- `planExport` and `planVectorExport` share one internal planner; `planExport` returns the same values as before.
- The vector result is selected, remembered as the plugin's own output and committed as one undo step, the same way the image result is.
- Cover art, cover animation and feature screenshots regenerated from a new source image.

## [0.1.0] - 2026-10-13

### Added

- Figma plugin scaffold: TypeScript, esbuild, `@figma/plugin-typings`, a build that bundles the plugin thread to `dist/main.js` and inlines the panel script and styles into a single `dist/ui.html`. No runtime dependencies, no network access (`networkAccess: none`, `documentAccess: dynamic-page`).
- Image output: the source is exported as PNG by the plugin thread, the panel computes the stroke on a canvas and sends the PNG back, and the plugin thread places it as a new layer 32 units to the right of the source. The source layer is never modified.
- `src/image/stroke.ts`: exact two-pass Euclidean distance transform (Felzenszwalb-Huttenlocher) on the alpha mask, stroke coverage `clamp(radius + 0.5 - distance, 0, 1)`, original pixels composited source-over in straight alpha.
- `src/image/validation.ts`: width parsing (integers 1 to 200, no clamping), HEX parsing (`#RGB`, `#RRGGBB`), export planning with a 2x scale that falls back to 1x, limits of 4096 px per side and 8 megapixels.
- `src/shared/messages.ts`: typed message protocol with runtime guards on both sides. Every job carries a request id and a selection revision; a result is dropped when the selection or the source snapshot (size, fills, transform) changed in the meantime. One job runs at a time, with a 30 s timeout.
- Selection handling: exactly one visible rectangle with a single visible image fill, normal blend, full opacity, no strokes or effects; every other selection gets a specific message.
- Panel: width field with drag-to-scrub on its label (`src/ui/scrub.ts`), a built-in color picker with saturation/value area, hue slider, presets and an optional eyedropper (`src/ui/picker.ts`), HEX field, status line.
- Live preview of the selected image: the plugin thread sends a thumbnail (`selection-preview`), the panel strokes it with the same `renderStroke` code at its true proportion (`src/ui/preview.ts`), redraws coalesced through `requestAnimationFrame`.
- Preview zoom (1x to 8x, towards the cursor) and pan (`src/ui/view.ts`), with an offscreen buffer enlarged by the stroke radius so strokes of parts outside the view still draw.
- Empty state: the preview reads `Select an Image` when nothing usable is selected.
- `scripts/cover.mjs` (animated PNG cover, own APNG encoder) and `scripts/screenshots.mjs` (headless Chrome screenshots of the built panel).
- Unit tests with node's built-in runner for stroke rendering, validation, protocol guards, scrub, preview layout and view math.

### Fixed

- The preview stroke was clipped at the top and bottom of the preview at its widest setting.
- The preview drew at 1.087x while claiming to be 1:1; the canvas now maps one unit to one CSS pixel and the caption states the real percentage.
- The color picker popover overflowed its own padding by 2 px.
- The color picker opened over the preview and hid it; it now opens below the color row.
- The preview canvas was smaller than its box, so a zoomed image was cut off short of the border.
- The saturation/value area used a crosshair cursor; it now uses the default arrow.

[0.2.0]: https://github.com/irfanbaysal/Image-Strokes-In-Figma/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/irfanbaysal/Image-Strokes-In-Figma/releases/tag/v0.1.0
