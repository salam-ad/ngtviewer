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
DIRECTION 0,0
CLS
TEXT 30, 25, "Roboto-Bold.TTF", 0, 0, 14, "Hello TSPL!"
TEXT 30, 60, "Roboto-Regular.TTF", 0, 0, 10, "{Address}"
TEXT 30, 90, "2", 0, 1, 1, "Bitmap font 2"
BOX 10, 10, 470, 310, 3
BAR 20, 130, 440, 4
BARCODE 20, 150, "128", 60, 1, 0, 2, 2, "123456789"
QRCODE 20, 220, L, 6, A, 0, "https://example.com"
; PUTBMP 350, 220, "logo.bmp"   ; drop an image named logo.bmp into the panel below
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
          // For TTF fonts: xmul=0 sentinel, ymul=point size. Keep raw zeros.
          cmds.push({
            cmd,
            x: num(args[0]), y: num(args[1]),
            font: str(args[2]),
            rot: num(args[3]),
            xmul: args[4] != null ? num(args[4]) : 1,
            ymul: args[5] != null ? num(args[5]) : 1,
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
        case "PUTBMP": {
          // PUTBMP x,y,"filename"[,bpp[,contrast]]
          cmds.push({
            cmd,
            x: num(args[0]), y: num(args[1]),
            name: str(args[2]),
            bpp: args[3] != null ? num(args[3]) : 1,
            contrast: args[4] != null ? num(args[4]) : 0,
          });
          break;
        }
        case "DIRECTION": {
          // DIRECTION n[,m]   n: 0|1 print direction,  m: 0|1 mirror
          cmds.push({
            cmd,
            n: num(args[0]) ? 1 : 0,
            m: args[1] != null && num(args[1]) ? 1 : 0,
          });
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

// ---------- Image Registry (PUTBMP source) ----------
const imageRegistry = new Map(); // key: lowercase name -> { img, displayName }

function registryKey(name) {
  return (name || "").toLowerCase().trim();
}

function lookupImage(name) {
  const k = registryKey(name);
  if (imageRegistry.has(k)) return imageRegistry.get(k);
  // Try without extension
  const stripped = k.replace(/\.[a-z0-9]+$/i, "");
  if (stripped !== k && imageRegistry.has(stripped)) return imageRegistry.get(stripped);
  // Try matching any registry entry that strips to this
  for (const [key, val] of imageRegistry) {
    const keyNoExt = key.replace(/\.[a-z0-9]+$/i, "");
    if (keyNoExt === stripped || key === stripped) return val;
  }
  return null;
}

function addImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      imageRegistry.set(registryKey(file.name), { img, displayName: file.name });
      // also index by base-name without extension for forgiving lookup
      const noExt = registryKey(file.name).replace(/\.[a-z0-9]+$/i, "");
      if (noExt && !imageRegistry.has(noExt)) {
        imageRegistry.set(noExt, { img, displayName: file.name });
      }
      resolve();
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`Could not decode ${file.name}`)); };
    img.src = url;
  });
}

function removeImage(displayName) {
  const k = registryKey(displayName);
  const noExt = k.replace(/\.[a-z0-9]+$/i, "");
  imageRegistry.delete(k);
  imageRegistry.delete(noExt);
}

function renderImageList() {
  const list = document.getElementById("img-list");
  if (!list) return;
  list.innerHTML = "";
  // unique by displayName
  const seen = new Set();
  for (const { displayName, img } of imageRegistry.values()) {
    if (seen.has(displayName)) continue;
    seen.add(displayName);
    const chip = document.createElement("span");
    chip.className = "img-chip";
    chip.innerHTML = `<span class="img-name">${displayName}</span><span class="img-dim">${img.naturalWidth}×${img.naturalHeight}</span><button type="button" aria-label="remove">×</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      removeImage(displayName);
      renderImageList();
      update();
    });
    list.appendChild(chip);
  }
  if (!seen.size) {
    const hint = document.createElement("span");
    hint.className = "img-hint";
    hint.textContent = "No images. Drop image files here (or anywhere on the page) to use them with PUTBMP.";
    list.appendChild(hint);
  }
}

function drawPutBmp(ctx, c) {
  const entry = lookupImage(c.name);
  if (!entry) {
    ctx.fillStyle = "#c00";
    ctx.font = "12px monospace";
    ctx.fillText(`[missing image: ${c.name}]`, c.x, c.y);
    return;
  }
  ctx.drawImage(entry.img, c.x, c.y);
}

// ---------- Render Loop ----------
function applyDirection(ctx, dir, w, h) {
  // Reset to identity then apply direction transform.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (dir.n && dir.m) {
    // 180° + horizontal mirror = vertical mirror
    ctx.translate(0, h);
    ctx.scale(1, -1);
  } else if (dir.n) {
    // 180° rotation: origin at bottom-right
    ctx.translate(w, h);
    ctx.scale(-1, -1);
  } else if (dir.m) {
    // horizontal mirror
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
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

  // start white (identity transform)
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let direction = { n: 0, m: 0 };

  for (const c of parsed.cmds) {
    switch (c.cmd) {
      case "SIZE":
      case "GAP":
      case "PRINT":
        break;
      case "DIRECTION":
        direction = { n: c.n, m: c.m };
        break;
      case "CLS":
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        break;
      case "BAR":
        applyDirection(ctx, direction, canvas.width, canvas.height);
        drawBar(ctx, c);
        break;
      case "BOX":
        applyDirection(ctx, direction, canvas.width, canvas.height);
        drawBox(ctx, c);
        break;
      case "TEXT":
        applyDirection(ctx, direction, canvas.width, canvas.height);
        drawText(ctx, c);
        break;
      case "BARCODE":
        applyDirection(ctx, direction, canvas.width, canvas.height);
        drawBarcode(ctx, c);
        break;
      case "QRCODE":
        applyDirection(ctx, direction, canvas.width, canvas.height);
        drawQRCode(ctx, c);
        break;
      case "PUTBMP":
        applyDirection(ctx, direction, canvas.width, canvas.height);
        drawPutBmp(ctx, c);
        break;
    }
  }

  // restore identity
  ctx.setTransform(1, 0, 0, 1, 0, 0);

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

  // ---- Image registry: drag & drop + file input ----
  renderImageList();

  const fileInput = document.getElementById("img-input");
  if (fileInput) {
    fileInput.addEventListener("change", async (e) => {
      const files = Array.from(e.target.files || []);
      await Promise.all(files.map((f) => addImage(f).catch((err) => setStatus(err.message, "error"))));
      fileInput.value = "";
      renderImageList();
      update();
    });
  }

  const dropZone = document.getElementById("img-drop");
  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    document.body.classList.remove("dragover");
    const items = e.dataTransfer && e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
    const imgs = items.filter((f) => /^image\//.test(f.type) || /\.(bmp|png|jpe?g|gif|webp)$/i.test(f.name));
    if (!imgs.length) return;
    Promise.all(imgs.map((f) => addImage(f).catch((err) => setStatus(err.message, "error"))))
      .then(() => { renderImageList(); update(); });
  }
  function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    document.body.classList.add("dragover");
  }
  function handleDragLeave(e) {
    if (e.target === document.body || e.target === dropZone) {
      document.body.classList.remove("dragover");
    }
  }

  [document.body, dropZone].filter(Boolean).forEach((el) => {
    el.addEventListener("dragover", handleDragOver);
    el.addEventListener("drop", handleDrop);
    el.addEventListener("dragleave", handleDragLeave);
  });

  update();
});
