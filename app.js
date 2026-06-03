"use strict";

// ---------- Constants ----------
const DPMM = 8; // dots per mm (203 DPI)

// TSPL built-in bitmap font cell heights in dots (per TSPL2 spec)
const FONT_HEIGHTS = { "1": 12, "2": 16, "3": 20, "4": 24, "5": 48 };

// Recognised weight/style suffixes used in TTF filenames (e.g. Roboto-BoldItalic.TTF)
const FONT_STYLE_SUFFIXES = {
  "thin":        { weight: "100", style: "normal" },
  "extralight":  { weight: "200", style: "normal" },
  "ultralight":  { weight: "200", style: "normal" },
  "light":       { weight: "300", style: "normal" },
  "regular":     { weight: "400", style: "normal" },
  "normal":      { weight: "400", style: "normal" },
  "medium":      { weight: "500", style: "normal" },
  "semibold":    { weight: "600", style: "normal" },
  "demibold":    { weight: "600", style: "normal" },
  "bold":        { weight: "700", style: "normal" },
  "extrabold":   { weight: "800", style: "normal" },
  "ultrabold":   { weight: "800", style: "normal" },
  "black":       { weight: "900", style: "normal" },
  "heavy":       { weight: "900", style: "normal" },
  "italic":      { weight: "400", style: "italic" },
  "oblique":     { weight: "400", style: "italic" },
  "thinitalic":      { weight: "100", style: "italic" },
  "lightitalic":     { weight: "300", style: "italic" },
  "mediumitalic":    { weight: "500", style: "italic" },
  "semibolditalic":  { weight: "600", style: "italic" },
  "bolditalic":      { weight: "700", style: "italic" },
  "extrabolditalic": { weight: "800", style: "italic" },
  "blackitalic":     { weight: "900", style: "italic" },
};

// Parse a TTF-ish font reference into { family, weight, style }.
// e.g. "Roboto-Bold.TTF" -> { family: "Roboto", weight: "700", style: "normal" }
function parseFontRef(name) {
  if (!name) return { family: "sans-serif", weight: "400", style: "normal" };
  let base = name.replace(/\.(ttf|otf|ttc|woff2?|fon)$/i, "");
  const parts = base.split(/[-_ ]+/);
  let weight = "400", style = "normal";
  if (parts.length > 1) {
    const tail = parts[parts.length - 1].toLowerCase();
    const m = FONT_STYLE_SUFFIXES[tail];
    if (m) {
      weight = m.weight;
      style = m.style;
      parts.pop();
    }
  }
  const family = parts.join(" ").trim() || "sans-serif";
  return { family, weight, style };
}

// Points (1/72 in) to dots @ 203 DPI
const ptToDots = (pt) => (pt * 203) / 72;

const DEFAULT_TSPL = `SIZE 60 mm, 40 mm
GAP 2 mm, 0 mm
CLS
TEXT 30, 25, "Roboto-Bold.TTF", 0, 0, 14, "Hello TSPL!"
TEXT 30, 60, "Roboto-Regular.TTF", 0, 0, 10, "{Address}"
TEXT 30, 90, "2", 0, 1, 1, "Bitmap font 2"
BOX 10, 10, 470, 310, 3
BAR 20, 130, 440, 4
BARCODE 20, 150, "128", 60, 1, 0, 2, 2, "123456789"
QRCODE 20, 220, L, 6, A, 0, "https://example.com"
PRINT 1, 1
`;

// ---------- Utilities ----------
const mm = (v) => v * DPMM;

function setStatus(msg, kind = "info") {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.classList.remove("error", "warn");
  if (kind === "error") el.classList.add("error");
  if (kind === "warn") el.classList.add("warn");
}

// ---------- Tokenizer (quoted-string aware) ----------
// Splits a TSPL argument string by commas, respecting "double quoted" segments.
// Returns an array of trimmed tokens. Quoted tokens keep an explicit marker.
function tokenizeArgs(s) {
  const out = [];
  let cur = "";
  let inQ = false;
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '"') {
      inQ = !inQ;
      if (!inQ) quoted = true; // mark this token as having been quoted
      continue;
    }
    if (c === "," && !inQ) {
      out.push({ value: cur.trim(), quoted });
      cur = "";
      quoted = false;
    } else {
      cur += c;
    }
  }
  out.push({ value: cur.trim(), quoted });
  return out;
}

// Parse a numeric token, stripping trailing units like "mm".
function num(tok) {
  if (tok == null) return 0;
  const v = (typeof tok === "string" ? tok : tok.value).trim();
  const m = v.match(/^-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

function hasUnitMm(tok) {
  if (tok == null) return false;
  const v = (typeof tok === "string" ? tok : tok.value).toLowerCase();
  return /mm\b/.test(v);
}

function str(tok) {
  if (tok == null) return "";
  return typeof tok === "string" ? tok : tok.value;
}

// ---------- Parser ----------
function parseTSPL(src) {
  const lines = src.split(/\r?\n/);
  const cmds = [];
  const errors = [];

  for (let lineNo = 0; lineNo < lines.length; lineNo++) {
    let line = lines[lineNo].trim();
    if (!line) continue;
    if (line.startsWith(";")) continue;

    // Split first whitespace into CMD and rest
    const idx = line.search(/\s/);
    let cmd, rest;
    if (idx === -1) { cmd = line; rest = ""; }
    else { cmd = line.slice(0, idx); rest = line.slice(idx + 1); }
    cmd = cmd.toUpperCase();

    const args = rest.length ? tokenizeArgs(rest) : [];

    try {
      switch (cmd) {
        case "SIZE": {
          // SIZE w[mm], h[mm]   OR   SIZE w,h  (dots when no mm)
          const w = num(args[0]);
          const h = num(args[1]);
          const wDots = hasUnitMm(args[0]) ? mm(w) : w;
          const hDots = hasUnitMm(args[1]) ? mm(h) : h;
          cmds.push({ cmd, wDots, hDots });
          break;
        }
        case "GAP": {
          cmds.push({ cmd }); // visual no-op
          break;
        }
        case "CLS": {
          cmds.push({ cmd });
          break;
        }
        case "BAR": {
          cmds.push({
            cmd,
            x: num(args[0]), y: num(args[1]),
            w: num(args[2]), h: num(args[3]),
          });
          break;
        }
        case "BOX": {
          cmds.push({
            cmd,
            x: num(args[0]), y: num(args[1]),
            x2: num(args[2]), y2: num(args[3]),
            t: num(args[4]) || 1,
          });
          break;
        }
        case "TEXT": {
          // TEXT x,y,"font",rot,xmul,ymul,"text"
          cmds.push({
            cmd,
            x: num(args[0]), y: num(args[1]),
            font: str(args[2]),
            rot: num(args[3]),
            xmul: num(args[4]) || 1,
            ymul: num(args[5]) || 1,
            text: str(args[6]),
          });
          break;
        }
        case "BARCODE": {
          // BARCODE x,y,"type",height,human,rot,narrow,wide,"data"
          cmds.push({
            cmd,
            x: num(args[0]), y: num(args[1]),
            type: str(args[2]),
            height: num(args[3]),
            human: num(args[4]),
            rot: num(args[5]),
            narrow: num(args[6]) || 2,
            wide: num(args[7]) || 2,
            data: str(args[8]),
          });
          break;
        }
        case "QRCODE": {
          // QRCODE x,y,ecc,cell,mode,rot,"data"
          cmds.push({
            cmd,
            x: num(args[0]), y: num(args[1]),
            ecc: str(args[2]) || "L",
            cell: num(args[3]) || 4,
            mode: str(args[4]) || "A",
            rot: num(args[5]),
            data: str(args[6]),
          });
          break;
        }
        case "PRINT": {
          cmds.push({ cmd }); // no-op for preview
          break;
        }
        default: {
          errors.push(`Line ${lineNo + 1}: unknown command "${cmd}" (skipped)`);
        }
      }
    } catch (e) {
      errors.push(`Line ${lineNo + 1}: ${e.message}`);
    }
  }

  return { cmds, errors };
}

// ---------- Renderer ----------
let zoom = 2;

function withRotation(ctx, x, y, deg, draw) {
  if (!deg) { draw(x, y); return; }
  const rad = (deg * Math.PI) / 180;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);
  draw(0, 0);
  ctx.restore();
}

function drawText(ctx, c) {
  // TTF mode: font name contains a "." (e.g. "Roboto-Bold.TTF") OR xmul == 0.
  // In TTF mode, arg6 (stored as c.ymul) is the point size, and arg5 (c.xmul) is x-scale (0 -> 1).
  const isTTF = /\./.test(c.font) || c.xmul === 0;

  let heightDots, xScale, yScale, cssFamily, cssWeight, cssStyle;

  if (isTTF) {
    const pt = c.ymul || 12;       // point size
    heightDots = ptToDots(pt);
    xScale = c.xmul && c.xmul !== 0 ? c.xmul : 1;
    yScale = 1;
    const ref = parseFontRef(c.font);
    cssFamily = `"${ref.family}", sans-serif`;
    cssWeight = ref.weight;
    cssStyle = ref.style;
  } else {
    const baseH = FONT_HEIGHTS[c.font] || 16;
    heightDots = baseH;
    xScale = c.xmul || 1;
    yScale = c.ymul || 1;
    cssFamily = `"SF Mono", Menlo, Consolas, monospace`;
    cssWeight = "400";
    cssStyle = "normal";
  }

  ctx.fillStyle = "#000";
  ctx.textBaseline = "top";

  withRotation(ctx, c.x, c.y, c.rot, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    if (xScale !== 1 || yScale !== 1) ctx.scale(xScale, yScale);
    ctx.font = `${cssStyle} ${cssWeight} ${heightDots}px ${cssFamily}`;
    ctx.fillText(c.text || "", 0, 0);
    ctx.restore();
  });
}

function drawBar(ctx, c) {
  ctx.fillStyle = "#000";
  ctx.fillRect(c.x, c.y, c.w, c.h);
}

function drawBox(ctx, c) {
  ctx.strokeStyle = "#000";
  ctx.lineWidth = c.t;
  // Align stroke so it sits inside the rectangle bounds
  const off = c.t / 2;
  ctx.strokeRect(c.x + off, c.y + off,
                 (c.x2 - c.x) - c.t, (c.y2 - c.y) - c.t);
}

// Map TSPL barcode type -> JsBarcode format
const BARCODE_MAP = {
  "128": "CODE128", "128M": "CODE128",
  "39": "CODE39", "93": "CODE93",
  "EAN13": "EAN13", "EAN8": "EAN8",
  "UPCA": "UPC", "UPCE": "UPC",
  "ITF": "ITF", "ITF14": "ITF14",
  "CODA": "codabar", "CODABAR": "codabar",
  "MSI": "MSI",
};

function drawBarcode(ctx, c) {
  const fmt = BARCODE_MAP[c.type.toUpperCase()] || "CODE128";
  const off = document.createElement("canvas");
  try {
    // narrow module width controls bar width
    JsBarcode(off, c.data || "", {
      format: fmt,
      width: c.narrow,
      height: c.height,
      displayValue: !!c.human,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
      fontSize: 14,
    });
  } catch (e) {
    // Bad data for chosen symbology
    ctx.fillStyle = "#c00";
    ctx.font = "12px monospace";
    ctx.fillText(`[barcode err: ${e.message}]`, c.x, c.y);
    return;
  }
  withRotation(ctx, c.x, c.y, c.rot, (x, y) => {
    ctx.drawImage(off, x, y);
  });
}

const ECC_MAP = { L: "L", M: "M", Q: "Q", H: "H" };

function drawQRCode(ctx, c) {
  const ecc = ECC_MAP[(c.ecc || "L").toUpperCase()] || "L";
  let qr;
  try {
    qr = qrcode(0, ecc);
    qr.addData(c.data || "");
    qr.make();
  } catch (e) {
    ctx.fillStyle = "#c00";
    ctx.font = "12px monospace";
    ctx.fillText(`[qr err: ${e.message}]`, c.x, c.y);
    return;
  }
  const count = qr.getModuleCount();
  const cell = c.cell || 4;
  const size = count * cell;
  const off = document.createElement("canvas");
  off.width = size; off.height = size;
  const octx = off.getContext("2d");
  octx.fillStyle = "#fff";
  octx.fillRect(0, 0, size, size);
  octx.fillStyle = "#000";
  for (let r = 0; r < count; r++) {
    for (let cc = 0; cc < count; cc++) {
      if (qr.isDark(r, cc)) octx.fillRect(cc * cell, r * cell, cell, cell);
    }
  }
  withRotation(ctx, c.x, c.y, c.rot, (x, y) => {
    ctx.drawImage(off, x, y);
  });
}

function render(parsed) {
  const canvas = document.getElementById("preview");
  const ctx = canvas.getContext("2d");

  // Determine canvas size from last SIZE command, else default 60x40 mm
  let w = mm(60), h = mm(40);
  for (const c of parsed.cmds) {
    if (c.cmd === "SIZE") { w = c.wDots; h = c.hDots; }
  }
  canvas.width = Math.max(1, Math.round(w));
  canvas.height = Math.max(1, Math.round(h));
  canvas.style.width = `${canvas.width * zoom}px`;
  canvas.style.height = `${canvas.height * zoom}px`;

  // start white
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const c of parsed.cmds) {
    switch (c.cmd) {
      case "SIZE":
      case "GAP":
      case "PRINT":
        break;
      case "CLS":
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        break;
      case "BAR": drawBar(ctx, c); break;
      case "BOX": drawBox(ctx, c); break;
      case "TEXT": drawText(ctx, c); break;
      case "BARCODE": drawBarcode(ctx, c); break;
      case "QRCODE": drawQRCode(ctx, c); break;
    }
  }

  if (parsed.errors.length) {
    setStatus(parsed.errors.join("\n"), "warn");
  } else {
    setStatus(`Rendered ${parsed.cmds.length} command(s). Canvas: ${canvas.width}x${canvas.height} dots.`);
  }
}

// ---------- Wiring ----------
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

function update() {
  const src = document.getElementById("editor").value;
  try {
    const parsed = parseTSPL(src);
    render(parsed);
  } catch (e) {
    setStatus(`Fatal: ${e.message}`, "error");
  }
}

window.addEventListener("DOMContentLoaded", () => {
  const editor = document.getElementById("editor");
  editor.value = DEFAULT_TSPL;

  const zoomEl = document.getElementById("zoom");
  const zoomVal = document.getElementById("zoom-val");
  zoomEl.addEventListener("input", () => {
    zoom = parseFloat(zoomEl.value);
    zoomVal.textContent = `${zoom.toFixed(1)}x`;
    update();
  });

  editor.addEventListener("input", debounce(update, 150));
  update();
});
