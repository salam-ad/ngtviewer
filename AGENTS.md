# AGENTS.md

Guidance for AI coding agents (Copilot, Claude, Cursor, etc.) working in this repository.

## Project

**ngtviewer** — a browser-based TSPL (TSC Printer Language) label viewer. You write TSPL on the left, the rendered label appears on the right. No build, no server: open `index.html` in a browser.

## Stack & Constraints

- **Vanilla HTML/CSS/JS only.** No bundlers, no transpilers, no `npm install` step. Do not introduce frameworks, TypeScript, or build tooling unless the user explicitly asks.
- **No runtime dependencies installed locally.** Two libraries are loaded from CDN via `<script>` tags in `index.html`:
  - [JsBarcode](https://github.com/lindell/JsBarcode) — 1D barcodes
  - [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) — QR codes
- **Strict mode** (`"use strict";`) at the top of `app.js`.
- **Browser-only globals.** Don't add Node-specific APIs.

## File Layout

```
/index.html      Page shell, two-pane layout, CDN scripts.
/styles.css      Dark theme, two-pane grid, images panel, drop-zone styles.
/app.js          Parser, renderer, image registry, event wiring. ~500 lines.
```

Session/agent scratch files live outside the repo (e.g. `~/.copilot/session-state/<id>/`); do not commit them.

## Architecture

`app.js` is structured top-to-bottom in clearly labeled sections:

1. **Constants** — `DPMM` (8 dots/mm = 203 DPI), `FONT_HEIGHTS`, `FONT_STYLE_SUFFIXES`.
2. **Default sample TSPL** — preloaded in the editor on first open.
3. **Utilities** — `mm()`, `setStatus()`, font-name parsing (`parseFontRef`, `ptToDots`).
4. **Tokenizer** — `tokenizeArgs()` is quoted-string aware. Never use `split(',')` on a TSPL argument list; quoted strings can contain commas.
5. **Parser** — `parseTSPL()` returns `{ cmds, errors }`. Each command becomes a plain object `{ cmd, ...fields }`. Unknown commands produce a warning but do not abort.
6. **Image Registry** — `imageRegistry: Map<lowercaseName, { img, displayName }>` for `PUTBMP` lookups. Drag-drop or file-input registers images.
7. **Renderer** — one `drawXxx()` per command type. `render(parsed)` walks the command list, applying `applyDirection()` before each visual draw call.
8. **Argument Hints** — `COMMAND_HELP` documents each command's `args`, `optional` args, and `content`. `analyzeCursor()` finds the command/argument at the editor cursor and `renderArgHint()` fills the `#arg-hint` panel under the editor.
9. **Wiring** — DOMContentLoaded handler binds the editor, zoom slider, and drag-drop.

## Coordinate System

- All TSPL coords are in **dots** (1 mm = 8 dots @ 203 DPI).
- The canvas is sized in dots (`canvas.width = wDots`) and scaled visually via CSS (`canvas.style.width = wDots * zoom`).
- Origin is top-left, +x right, +y down — matches both TSPL default and the HTML canvas.

## Supported TSPL Commands

| Command   | Notes |
|-----------|-------|
| `SIZE`    | Accepts `mm` units or raw dots. |
| `GAP`     | Parsed, visually no-op. |
| `DIRECTION n[,m]` | n=0/1 flip, m=0/1 mirror. Applied as canvas transform per draw. |
| `CLS`     | Clears canvas to white (also resets transform). |
| `TEXT`    | Two modes: **bitmap** (font="1".."5", xmul/ymul are integer multipliers) and **TTF** (font ends in `.ttf`/`.otf` or xmul=0, then ymul is point size). Optional `alignment` before the content (0/1 left, 2 center, 3 right; x is the anchor, along the rotated axis). |
| `BLOCK`   | `x,y,width,height,font,rot,xmul,ymul,[space,][align,][fit,]"content"`. Word-wrapped to `width`, clipped to `height`; `fit=1` shrinks the font until it fits. Shares font handling with `TEXT` via `resolveFont()`. |
| `BAR`     | Filled rectangle. |
| `BOX`     | Stroked rectangle; stroke is inset so total extents match `x..x2` × `y..y2`. |
| `BARCODE` | Rendered via JsBarcode to an offscreen canvas, then blit with rotation. See `BARCODE_MAP` for TSPL→JsBarcode type mapping. Optional `alignment` before the data (same values as `TEXT`); `human` 1/2/3 = left/center/right human-readable text. |
| `QRCODE`  | Rendered via qrcode-generator to an offscreen canvas. |
| `PUTBMP`  | Looks up an image in the registry; missing → red `[missing image: name]`. |
| `PRINT`   | No-op for preview. |
| `;`-prefix and blank lines | Ignored. |

## Conventions for Adding New Commands

1. Add a `case "FOO":` to the parser's switch, pushing `{ cmd: "FOO", ...fields }`. Use `num()` for numerics (it strips unit suffixes like `mm`) and `str()` for quoted strings.
2. Add a `drawFoo(ctx, c)` function in the renderer section.
3. Add `case "FOO": applyDirection(ctx, direction, canvas.width, canvas.height); drawFoo(ctx, c); break;` to the render loop.
4. If the command has no visual effect (e.g. printer config), add it alongside `SIZE`/`GAP`/`PRINT` in the no-op switch arm.
5. Update `DEFAULT_TSPL` if it's a commonly used command worth showcasing.
6. Add a `COMMAND_HELP` entry so the argument-hint panel can describe it. Keep it in sync with the parser's argument order.

## Common Pitfalls

- **Don't** split TSPL args on commas naively — `TEXT 0,0,"3",0,1,1,"Hello, World"` has a comma inside the quoted string.
- **Don't** use `num(args[i]) || default` if `0` is a legal value (e.g. `xmul=0` is the TTF sentinel). Use `args[i] != null ? num(args[i]) : default`.
- **Don't** read content from a fixed index for `TEXT`/`BARCODE`/`BLOCK` — optional args (alignment etc.) shift it. Content is the last token.
- **Don't** forget `ctx.setTransform(1,0,0,1,0,0)` after the render loop — direction transforms must not leak.
- **Don't** introduce Node-only constructs (`require`, `process`, `fs`). The smoke-test snippets in `/tmp` are throwaway.
- **Don't** add ESM `import`/`export` — the scripts are loaded as classic scripts.

## Manual Verification

There is no automated test suite. To verify changes:

1. Open `index.html` in a browser (any modern Chromium/Firefox/Safari).
2. The default sample should render: bordered label with two text lines, a bar, a CODE128 barcode, and a QR code.
3. Edit the TSPL; the preview should re-render ~150 ms after typing stops.
4. For `PUTBMP`: drag an image onto the page, then reference it by filename.
5. Watch the bottom status bar — it shows parse warnings (yellow) and fatal errors (red).

For parser-only smoke tests you can run Node with indirect eval (see prior session notes), but it's optional.

## Coding Style

- 2-space indent, double-quoted strings, semicolons.
- Small focused functions; no classes.
- Comments only where intent isn't obvious from the code (e.g. TSPL-spec quirks, sentinel values).
- Keep `app.js` self-contained: no external state, no globals beyond what's already there (`zoom`, `imageRegistry`).

## Out of Scope (v1)

- Template variable substitution for `{Placeholder}` strings — they render literally.
- TSPL download commands (`DOWNLOAD`, `EOP`).
- Multi-label / page management.
- Print preview accuracy beyond ~1 dot.

If the user requests any of these, ask first whether they want it now or deferred.
