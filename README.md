<div align="center">

<h1>Figma Strokes</h1>

<hr>

<p><strong>Outlines for raster images; a Figma plugin written in plain TypeScript.</strong><br>
Adds a stroke around an image that follows the picture's alpha silhouette,<br>
not the rectangle it sits in. No framework, no image library, no network. Open source, offline, and yours.</p>

<p>
<img alt="100% TypeScript" src="https://img.shields.io/badge/100%25-TypeScript-3178c6?style=flat-square&logo=typescript&logoColor=white">
<img alt="Figma plugin" src="https://img.shields.io/badge/Figma-plugin-a259ff?style=flat-square&logo=figma&logoColor=white">
<img alt="dependencies" src="https://img.shields.io/badge/deps-typescript%20%C2%B7%20esbuild-555?style=flat-square">
<img alt="license MIT" src="https://img.shields.io/badge/license-MIT-2ea44f?style=flat-square">
<img alt="status early alpha" src="https://img.shields.io/badge/status-early%20alpha-d9a21b?style=flat-square">
</p>

<img src="docs/cover.png" alt="Animation: a 3D-style Eiffel Tower image on a dark card with a white outline following its silhouette, the stroke width growing from 2 to 5 and back" width="300">

<p><em>Rendered by the plugin's own stroke code (<code>node scripts/cover.mjs</code>).</em></p>

</div>

Select one image, pick a width and a color, press Create Stroke, and a new layer appears next to it with the outline. That's the whole idea.

Figma strokes vectors natively, but a stroke on an image layer only follows the rectangle, not the picture inside it. This plugin traces what is actually visible in the image instead.

## Getting it running

```sh
npm install
npm run build
```

Then in Figma: **Plugins → Development → Import plugin from manifest…** and pick `manifest.json` from this folder. Select an image, run *Figma Strokes*, press Create Stroke.

`dist/` is gitignored, so you need to build before Figma can load it.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm run watch` | rebuild on every change |
| `npm test` | unit tests (node's built-in test runner) |
| `npm run typecheck` | `tsc --noEmit` |

### Poking at the UI without Figma

The UI is one self-contained HTML file and only talks to the plugin thread through `postMessage`, so you can open `dist/ui.html` straight in a browser. The width field, the color picker and the preview all work there; with no plugin thread behind it there is no selection, so Create Stroke stays disabled. Useful for CSS tweaks; not a substitute for testing in Figma.

## Using it

- **Width**: a whole number from 1 to 200, in document units. Drag the *Width* label left or right to change it; hold Shift to move in steps of 10.
- **Color**: the swatch opens a picker with a saturation/brightness area, a hue slider and preset swatches. Where the browser supports the EyeDropper API there is also an eyedropper button. The HEX field next to the swatch accepts `#RGB` and `#RRGGBB`.
- **Preview**: the image you have selected, stroked with the same code that produces the real result and drawn at its true proportion, so a thin stroke on a large image looks thin. When image and stroke do not fit the box at full size the preview shrinks and says "Preview at N%". With nothing usable selected it shows a bundled sample image instead.
- **Create Stroke**: makes a new layer named `<source name> — Stroke`, 32 units to the right of the source, and selects it. The source is left untouched and the panel stays open.

Changing settings never writes to the document; only Create Stroke does.

## What gets a stroke

Yes:

- Exactly one selected rectangle whose only visible fill is an image (normal blend, full opacity).

No (the panel says why and Create Stroke stays disabled):

- Vectors, shapes, text, frames and groups.
- Several layers selected at once.
- Images with extra fills, strokes, effects, reduced opacity or a blend mode.

Also no (Create Stroke reports the reason and adds nothing to the document):

- Fully transparent images.
- Results that would exceed 4096 px on a side or 8 megapixels.

Worth knowing:

- The output is a raster image, not an editable vector stroke.
- A fully opaque image gets a rectangular outline, because its silhouette is the rectangle.
- The export is 2x, and falls back to 1x when 2x does not fit the limits above.

## How it's built

```
manifest.json            Figma manifest (dynamic-page, no network)
scripts/build.mjs        esbuild: src/main.ts → dist/main.js, src/ui/* → dist/ui.html
scripts/cover.mjs        renders docs/cover.png (animated) from docs/cover-source.png
src/main.ts              plugin thread: selection checks, export, job lifecycle, creates the layer
src/shared/messages.ts   message protocol between the two sides, with runtime guards
src/image/validation.ts  width and HEX parsing, size limits, export planning (scale, padding)
src/image/stroke.ts      distance transform and stroke compositing on raw RGBA pixels
src/ui/index.html        panel markup
src/ui/main.ts           panel logic: fields, preview, render jobs, messages
src/ui/scrub.ts          drag-the-label number scrubbing
src/ui/picker.ts         color picker (+ picker.css)
src/ui/preview.ts        preview layout: fits the stroked sample into the box
src/ui/preview-sample.png  bundled sample image for the preview
tests/                   unit tests for stroke, validation, scrub and preview
```

A few things worth knowing if you dig in:

- The plugin thread owns the document; the iframe does the pixel work. The plugin thread exports the source as PNG, the panel draws the stroke on a canvas and sends the result back.
- The stroke uses an exact Euclidean distance transform in two passes, so a wide stroke costs the same as a thin one.
- Pixels with an alpha of at least 50 % form the silhouette. The original pixels are composited on top unchanged.
- Every job carries a request id and a selection revision. If the selection or the source changes in the meantime, the result is dropped.
- One job runs at a time.

## Status

v0.1.0, early alpha. It builds, type-checks and passes its unit tests, and the panel has been exercised in a browser. In Figma the panel opens and picks up the selection; creating a stroke has not been verified there yet.

Open questions: whether creating the layer is a single Undo step, how rotated or cropped sources and sources inside Auto Layout or scaled parents behave, how the eyedropper behaves in Figma desktop, and how it performs on large images.

## License

MIT. See [LICENSE](LICENSE).

This is an independent project; it is not affiliated with or endorsed by Figma.
