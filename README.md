# TSPL Viewer

A browser-based previewer for TSPL (TSC Printer Language) labels. Write TSPL in
the editor and see the rendered label update in the preview.

## Run

Open `index.html` in a modern browser. There is no build step or local server
required. JsBarcode and qrcode-generator are loaded from CDNs, so barcode and
QR-code rendering requires an internet connection.

## Features

- Live preview with adjustable zoom
- TSPL dimensions in millimeters or raw printer dots
- Text using built-in bitmap fonts or TTF/OTF font names
- Boxes, bars, 1D barcodes, and QR codes
- Add BMP images by dropping them onto the page or choosing files, then
  reference them with `PUTBMP`
- A bundled sample image is loaded automatically for the initial example
- Parse warnings and errors in the status bar
- Argument hints under the editor: put the cursor on a command to see what
  each argument means, with the one under the cursor highlighted

Coordinates use printer dots (8 dots/mm at 203 DPI). The preview supports
`SIZE`, `GAP`, `DIRECTION`, `CLS`, `TEXT`, `BLOCK`, `BAR`, `BOX`, `BARCODE`,
`QRCODE`, `PUTBMP`, and `PRINT`. `GAP` and `PRINT` do not affect the visual preview.

## Image references

The viewer supports BMP images only. The initial example uses
`assets/default-image.bmp`, which is included with the project and loaded
automatically. Add other `.bmp` files with drag-and-drop or **Add files**, then
use their filenames in `PUTBMP` commands, for example:

```tspl
PUTBMP 350, 220, "logo.bmp"
```

Images are kept in the current page session and are not uploaded or saved by
the viewer.
