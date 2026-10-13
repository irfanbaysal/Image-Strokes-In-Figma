# Image Stroke

A Figma plugin that adds an outward stroke to an image, following the image's alpha
silhouette instead of its bounding box.

## What it does

- Works on exactly one selected image rectangle.
- Draws an outward stroke that follows the alpha silhouette of the image.
- Stroke width is 1 to 200, in document units.
- Stroke color is opaque.
- The result is a new raster layer named `<source name> — Stroke`, placed 32 units to the
  right of the source.
- The source layer is left untouched.

## Development

```sh
npm install
npm run build      # writes dist/main.js and dist/ui.html
npm run watch      # rebuilds on change
npm run typecheck
npm test
```

## Import into Figma

1. Run `npm run build`.
2. In Figma, open Plugins > Development > Import plugin from manifest.
3. Pick `manifest.json` from this folder.

## Known limits

- The source must have a single visible image fill with normal blend. Extra fills, strokes
  or effects on the source are not supported.
- The output is a raster layer, not an editable vector stroke.
- The result is at most 4096 px per axis and 8 megapixels.
- The export is 2x when it fits those limits and falls back to 1x otherwise.
- Fully transparent images are rejected.
- A fully opaque image gets a rectangular stroke.
