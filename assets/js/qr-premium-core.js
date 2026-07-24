const HEX_COLOR = /^#[0-9A-F]{6}$/i;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

export const QR_STYLE_VERSION = 1;
export const QR_EXPORT_SIZES = Object.freeze([512, 1024, 2048]);
export const QR_COMPOSITIONS = Object.freeze(["solo", "name", "print", "email"]);
export const QR_DOT_STYLES = Object.freeze(["square", "rounded", "dots"]);
export const QR_CORNER_STYLES = Object.freeze(["square", "rounded"]);
export const QR_ERROR_LEVELS = Object.freeze(["M", "Q", "H"]);
export const QR_LOGOS = Object.freeze(["none", "lognext-symbol"]);
export const QR_MARGINS = Object.freeze([16, 20, 24, 30, 36, 48]);

export const QR_PRESETS = Object.freeze({
  "corporate-navy": Object.freeze({
    id: "corporate-navy",
    label: "Corporate Navy",
    description: "Azul Lognext, fondo claro y detalle naranja.",
    foregroundColor: "#000029",
    backgroundColor: "#FFFFFF",
    accentColor: "#FA3C0F",
    accentDetails: "subtle",
    transparent: false,
    dotsStyle: "rounded",
    cornersStyle: "rounded",
    logo: "lognext-symbol",
    margin: 24,
    errorCorrection: "H",
  }),
  "corporate-orange": Object.freeze({
    id: "corporate-orange",
    label: "Corporate Orange",
    description: "Base corporativa con mayor presencia del acento.",
    foregroundColor: "#000029",
    backgroundColor: "#FFFFFF",
    accentColor: "#FA3C0F",
    accentDetails: "corners",
    transparent: false,
    dotsStyle: "rounded",
    cornersStyle: "rounded",
    logo: "lognext-symbol",
    margin: 24,
    errorCorrection: "H",
  }),
  "dark-card": Object.freeze({
    id: "dark-card",
    label: "Dark Card",
    description: "Fondo navy y módulos claros para soportes oscuros.",
    foregroundColor: "#FFFFFF",
    backgroundColor: "#000029",
    accentColor: "#FA3C0F",
    accentDetails: "corners",
    transparent: false,
    dotsStyle: "rounded",
    cornersStyle: "rounded",
    logo: "lognext-symbol",
    margin: 24,
    errorCorrection: "H",
  }),
  monochrome: Object.freeze({
    id: "monochrome",
    label: "Monochrome",
    description: "Máxima compatibilidad para impresión en una tinta.",
    foregroundColor: "#111111",
    backgroundColor: "#FFFFFF",
    accentColor: "#111111",
    accentDetails: "subtle",
    transparent: false,
    dotsStyle: "square",
    cornersStyle: "square",
    logo: "none",
    margin: 24,
    errorCorrection: "Q",
  }),
  transparent: Object.freeze({
    id: "transparent",
    label: "Transparent",
    description: "Fondo transparente para composiciones controladas.",
    foregroundColor: "#000029",
    backgroundColor: "#FFFFFF",
    accentColor: "#FA3C0F",
    accentDetails: "corners",
    transparent: true,
    dotsStyle: "rounded",
    cornersStyle: "rounded",
    logo: "lognext-symbol",
    margin: 30,
    errorCorrection: "H",
  }),
});

export const DEFAULT_QR_STYLE = Object.freeze({
  version: QR_STYLE_VERSION,
  preset: "corporate-navy",
  foregroundColor: "#000029",
  backgroundColor: "#FFFFFF",
  accentColor: "#FA3C0F",
  accentDetails: "subtle",
  transparent: false,
  dotsStyle: "rounded",
  cornersStyle: "rounded",
  logo: "lognext-symbol",
  margin: 24,
  errorCorrection: "H",
  footerText: "",
});

const clone = value => JSON.parse(JSON.stringify(value));
const allowed = (value, values, fallback) => values.includes(value) ? value : fallback;
const color = (value, fallback) => HEX_COLOR.test(String(value || "")) ? String(value).toUpperCase() : fallback;
const number = (value, fallback, minimum, maximum) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(maximum, Math.max(minimum, Math.round(parsed))) : fallback;
};
const nearestMargin = (value, fallback) => {
  const requested = number(value, fallback, QR_MARGINS[0], QR_MARGINS.at(-1));
  return QR_MARGINS.reduce((nearest, candidate) =>
    Math.abs(candidate - requested) < Math.abs(nearest - requested) ? candidate : nearest, QR_MARGINS[0]);
};
const text = (value, maximum = 80) => String(value || "")
  .replace(/[\u0000-\u001F\u007F]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, maximum)
  .trim();

export function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function qrPreset(id = "corporate-navy") {
  const preset = clone(QR_PRESETS[id] || QR_PRESETS["corporate-navy"]);
  return {...preset, preset: preset.id};
}

export function qrStyleFromSettings(qr = {}) {
  const legacyForeground = qr.foregroundColor || qr.darkColor;
  const legacyBackground = qr.backgroundColor || qr.lightColor;
  const preset = qrPreset(qr.preset);
  return sanitizeQrStyle({
    ...preset,
    preset: QR_PRESETS[qr.preset] ? qr.preset : preset.id,
    foregroundColor: legacyForeground || preset.foregroundColor,
    backgroundColor: legacyBackground || preset.backgroundColor,
    accentColor: qr.accentColor || preset.accentColor,
    accentDetails: qr.accentDetails || preset.accentDetails,
    transparent: qr.transparent ?? preset.transparent,
    dotsStyle: qr.dotsStyle || preset.dotsStyle,
    cornersStyle: qr.cornersStyle || preset.cornersStyle,
    logo: qr.logo || preset.logo,
    margin: qr.margin ?? preset.margin,
    errorCorrection: qr.errorCorrection || preset.errorCorrection,
  });
}

export function sanitizeQrStyle(input = {}, fallback = DEFAULT_QR_STYLE) {
  const safeFallback = {
    ...DEFAULT_QR_STYLE,
    ...(fallback && typeof fallback === "object" ? fallback : {}),
  };
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const preset = QR_PRESETS[source.preset] ? source.preset : source.preset === "custom" ? "custom" : safeFallback.preset;
  const logo = allowed(source.logo, QR_LOGOS, safeFallback.logo);
  const errorCorrection = logo === "lognext-symbol"
    ? "H"
    : allowed(source.errorCorrection, QR_ERROR_LEVELS, safeFallback.errorCorrection);
  return {
    version: QR_STYLE_VERSION,
    preset,
    foregroundColor: color(source.foregroundColor, color(safeFallback.foregroundColor, DEFAULT_QR_STYLE.foregroundColor)),
    backgroundColor: color(source.backgroundColor, color(safeFallback.backgroundColor, DEFAULT_QR_STYLE.backgroundColor)),
    accentColor: color(source.accentColor, color(safeFallback.accentColor, DEFAULT_QR_STYLE.accentColor)),
    accentDetails: allowed(source.accentDetails, ["subtle", "corners"], safeFallback.accentDetails),
    transparent: typeof source.transparent === "boolean" ? source.transparent : Boolean(safeFallback.transparent),
    dotsStyle: allowed(source.dotsStyle, QR_DOT_STYLES, safeFallback.dotsStyle),
    cornersStyle: allowed(source.cornersStyle, QR_CORNER_STYLES, safeFallback.cornersStyle),
    logo,
    margin: nearestMargin(source.margin, nearestMargin(safeFallback.margin, DEFAULT_QR_STYLE.margin)),
    errorCorrection,
    footerText: text(source.footerText ?? safeFallback.footerText),
  };
}

export function resolveQrStyle(card = {}, settings = {}) {
  const inherited = qrStyleFromSettings(settings?.cards?.qr || {});
  return card?.qrStyle && typeof card.qrStyle === "object"
    ? sanitizeQrStyle(card.qrStyle, inherited)
    : inherited;
}

export function normalizeCardQrStyle(card = {}) {
  if (!card || typeof card !== "object" || Array.isArray(card)) return card;
  const normalized = {...card};
  normalized.qrStyle = card.qrStyle && typeof card.qrStyle === "object" && !Array.isArray(card.qrStyle)
    ? sanitizeQrStyle(card.qrStyle)
    : null;
  return normalized;
}

function rgb(hex) {
  return [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
}

function luminance(hex) {
  return rgb(hex)
    .map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
}

export function qrColorContrast(first, second) {
  if (!HEX_COLOR.test(String(first || "")) || !HEX_COLOR.test(String(second || ""))) return 1;
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + .05) / (values[1] + .05);
}

export function validateQrDesign({url = "", style = DEFAULT_QR_STYLE} = {}) {
  const safe = sanitizeQrStyle(style);
  const messages = [];
  let blocked = false;
  let score = 100;
  let parsedUrl;
  try {
    parsedUrl = new URL(String(url || ""));
    if (!HTTP_PROTOCOLS.has(parsedUrl.protocol)) throw new Error();
  } catch {
    blocked = true;
    score = 0;
    messages.push("La URL debe usar http o https.");
  }
  const comparisonBackground = safe.transparent ? "#FFFFFF" : safe.backgroundColor;
  const contrast = qrColorContrast(safe.foregroundColor, comparisonBackground);
  if (contrast < 4.5) {
    blocked = true;
    score = Math.min(score, 25);
    messages.push(`Contraste insuficiente (${contrast.toFixed(1)}:1).`);
  } else if (contrast < 7) {
    score -= 22;
    messages.push(`Contraste aceptable (${contrast.toFixed(1)}:1), pero mejorable.`);
  }
  if (safe.transparent) {
    score -= 18;
    messages.push("El fondo transparente solo es fiable sobre superficies claras y uniformes.");
  }
  if (safe.margin < 20) {
    score -= 18;
    messages.push("El margen es válido, aunque 24 px ofrece una zona de silencio más robusta.");
  }
  if (safe.logo !== "none" && safe.errorCorrection !== "H") {
    blocked = true;
    score = Math.min(score, 30);
    messages.push("El símbolo central requiere corrección H.");
  }
  if (safe.dotsStyle === "dots") {
    score -= 6;
    messages.push("Los módulos circulares son aptos, pero menos tolerantes a impresión deficiente.");
  }
  if (String(url || "").length > 900) {
    score -= 22;
    messages.push("La URL es larga y produce un QR más denso.");
  } else if (String(url || "").length > 350) {
    score -= 10;
    messages.push("La URL aumenta moderadamente la densidad del QR.");
  }
  score = Math.max(0, score);
  const status = blocked ? "not-recommended" : score >= 84 ? "optimal" : "acceptable";
  if (!messages.length) messages.push("Contraste, margen y corrección preparados para lectura fiable.");
  return {
    status,
    label: status === "optimal" ? "Óptimo" : status === "acceptable" ? "Aceptable" : "No recomendado",
    score,
    canExport: !blocked,
    contrast,
    messages,
    url: parsedUrl?.href || "",
  };
}

export function autoCorrectQrStyle(style = DEFAULT_QR_STYLE) {
  const safe = sanitizeQrStyle(style);
  const background = safe.transparent ? "#FFFFFF" : safe.backgroundColor;
  const contrast = qrColorContrast(safe.foregroundColor, background);
  const corrected = {
    ...safe,
    transparent: false,
    margin: Math.max(24, safe.margin),
    errorCorrection: safe.logo === "none" ? (safe.errorCorrection === "M" ? "Q" : safe.errorCorrection) : "H",
  };
  if (contrast < 7) {
    corrected.foregroundColor = "#000029";
    corrected.backgroundColor = "#FFFFFF";
  }
  corrected.preset = "custom";
  return sanitizeQrStyle(corrected);
}

export function createQrMatrix(url, factory = globalThis.qrcode, errorCorrection = "H") {
  const value = String(url || "").trim();
  if (!value) throw new Error("El QR necesita una URL.");
  if (typeof factory !== "function") throw new Error("El generador QR no está disponible.");
  const level = allowed(errorCorrection, ["L", "M", "Q", "H"], "H");
  const code = factory(0, level);
  code.addData(value);
  code.make();
  const count = code.getModuleCount();
  const modules = Array.from({length: count}, (_row, row) =>
    Array.from({length: count}, (_column, column) => Boolean(code.isDark(row, column))));
  return {count, modules, errorCorrection: level, url: value};
}

function isFinderCell(row, column, count) {
  return (row < 7 && column < 7)
    || (row < 7 && column >= count - 7)
    || (row >= count - 7 && column < 7);
}

function moduleMarkup(style, x, y, size) {
  if (style.dotsStyle === "dots") {
    const radius = size * .43;
    return `<circle cx="${(x + size / 2).toFixed(2)}" cy="${(y + size / 2).toFixed(2)}" r="${radius.toFixed(2)}"/>`;
  }
  if (style.dotsStyle === "rounded") {
    const inset = size * .04;
    return `<rect x="${(x + inset).toFixed(2)}" y="${(y + inset).toFixed(2)}" width="${(size - inset * 2).toFixed(2)}" height="${(size - inset * 2).toFixed(2)}" rx="${(size * .24).toFixed(2)}"/>`;
  }
  return `<rect x="${x}" y="${y}" width="${size}" height="${size}"/>`;
}

function finderMarkup(x, y, style, moduleSize) {
  const outer = moduleSize * 7;
  const inner = moduleSize * 5;
  const center = moduleSize * 3;
  const cornerRadius = style.cornersStyle === "rounded" ? moduleSize * 1.25 : 0;
  const innerRadius = style.cornersStyle === "rounded" ? moduleSize * .72 : 0;
  const centerRadius = style.cornersStyle === "rounded" ? moduleSize * .58 : 0;
  const ringColor = style.foregroundColor;
  const cutoutColor = style.transparent ? "#FFFFFF" : style.backgroundColor;
  return [
    `<rect x="${x}" y="${y}" width="${outer}" height="${outer}" rx="${cornerRadius}" fill="${ringColor}"/>`,
    `<rect x="${x + moduleSize}" y="${y + moduleSize}" width="${inner}" height="${inner}" rx="${innerRadius}" fill="${cutoutColor}"/>`,
    `<rect x="${x + moduleSize * 2}" y="${y + moduleSize * 2}" width="${center}" height="${center}" rx="${centerRadius}" fill="${ringColor}"/>`,
  ].join("");
}

function accentBrackets(size, margin, color) {
  const thickness = Math.max(3, size * .008);
  const length = Math.max(22, margin * .72);
  const offset = Math.max(thickness * 1.5, margin * .18);
  const end = size - offset;
  const start = offset;
  return `<g fill="${color}" aria-hidden="true">
    <path d="M${start} ${start + length}v-${length}h${length}v${thickness}h-${length - thickness}v${length - thickness}z"/>
    <path d="M${end - length} ${end}h${length}v-${length}h-${thickness}v${length - thickness}h-${length - thickness}z"/>
  </g>`;
}

export function buildQrGraphic({
  url,
  style = DEFAULT_QR_STYLE,
  factory = globalThis.qrcode,
  logoSvg = null,
} = {}) {
  const safe = sanitizeQrStyle(style);
  const matrix = createQrMatrix(url, factory, safe.errorCorrection);
  const moduleSize = 10;
  const quietModules = Math.max(4, Math.min(8, Math.round(safe.margin / 6)));
  const quiet = quietModules * moduleSize;
  const qrSize = matrix.count * moduleSize;
  const size = qrSize + quiet * 2;
  const center = matrix.count / 2;
  const safeLogoSvg = trustedVectorAsset(logoSvg);
  const patchModules = safe.logo === "none" || !safeLogoSvg
    ? 0
    : Math.min(11, Math.max(7, Math.round(matrix.count * .18) | 1));
  const patchStart = Math.floor(center - patchModules / 2);
  const patchEnd = patchStart + patchModules;
  const parts = [];
  if (!safe.transparent) parts.push(`<rect width="${size}" height="${size}" rx="${Math.round(moduleSize * 1.8)}" fill="${safe.backgroundColor}"/>`);
  parts.push(`<g fill="${safe.foregroundColor}">`);
  for (let row = 0; row < matrix.count; row += 1) {
    for (let column = 0; column < matrix.count; column += 1) {
      if (!matrix.modules[row][column] || isFinderCell(row, column, matrix.count)) continue;
      if (patchModules && row >= patchStart && row < patchEnd && column >= patchStart && column < patchEnd) continue;
      parts.push(moduleMarkup(safe, quiet + column * moduleSize, quiet + row * moduleSize, moduleSize));
    }
  }
  parts.push("</g>");
  parts.push(finderMarkup(quiet, quiet, safe, moduleSize));
  parts.push(finderMarkup(quiet + (matrix.count - 7) * moduleSize, quiet, safe, moduleSize));
  parts.push(finderMarkup(quiet, quiet + (matrix.count - 7) * moduleSize, safe, moduleSize));
  if (safe.accentDetails === "corners" && safe.accentColor !== safe.foregroundColor) parts.push(accentBrackets(size, quiet, safe.accentColor));
  if (patchModules && safeLogoSvg) {
    const patchSize = patchModules * moduleSize;
    const patchX = quiet + patchStart * moduleSize;
    const patchY = quiet + patchStart * moduleSize;
    const logoInset = patchSize * .16;
    const patchFill = safe.transparent ? "#FFFFFF" : safe.backgroundColor;
    parts.push(`<rect x="${patchX}" y="${patchY}" width="${patchSize}" height="${patchSize}" rx="${moduleSize}" fill="${patchFill}" stroke="${safe.accentColor}" stroke-width="${Math.max(2, moduleSize * .22)}"/>`);
    parts.push(vectorAssetMarkup(safeLogoSvg, {
      x: patchX + logoInset,
      y: patchY + logoInset,
      width: patchSize - logoInset * 2,
      height: patchSize - logoInset * 2,
      label: "Símbolo Lognext",
    }));
  }
  return {
    markup: parts.join(""),
    size,
    matrixSize: matrix.count,
    quietModules,
    style: safe,
    logoEmbedded: Boolean(patchModules && safeLogoSvg),
  };
}

export function getCompositionDimensions(composition = "solo", width = 1024) {
  const safeWidth = QR_EXPORT_SIZES.includes(Number(width)) ? Number(width) : 1024;
  const ratio = {
    solo: 1,
    name: 1.24,
    print: 1.414,
    email: .36,
  }[allowed(composition, QR_COMPOSITIONS, "solo")];
  return {width: safeWidth, height: Math.round(safeWidth * ratio)};
}

function trustedVectorAsset(asset) {
  if (!asset?.validated || typeof asset.markup !== "string" || typeof asset.viewBox !== "string") return null;
  if (!/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?(?:[\s,]+-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?){3}$/i.test(asset.viewBox.trim())) return null;
  if (/<(?:svg|script|style|image|use|foreignObject|iframe)\b|javascript:|https?:|file:|data:|[a-z]:\\/i.test(asset.markup)) return null;
  return asset;
}

function vectorAssetMarkup(asset, {x, y, width, height, label = ""}) {
  const safeAsset = trustedVectorAsset(asset);
  if (!safeAsset) return "";
  return `<svg x="${Number(x).toFixed(2)}" y="${Number(y).toFixed(2)}" width="${Number(width).toFixed(2)}" height="${Number(height).toFixed(2)}" viewBox="${escapeXml(safeAsset.viewBox)}" preserveAspectRatio="xMidYMid meet"${label ? ` aria-label="${escapeXml(label)}"` : ""}>${safeAsset.markup}</svg>`;
}

function displayName(card = {}) {
  return text(`${card.firstName || ""} ${card.lastName || ""}`, 90) || text(card.cardName, 90) || "Tarjeta digital";
}

function svgText(value, attributes) {
  return `<text ${attributes}>${escapeXml(text(value, 120))}</text>`;
}

function qrGroup(graphic, x, y, size) {
  const scale = size / graphic.size;
  return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(6)})">${graphic.markup}</g>`;
}

function rootSvg({viewWidth, viewHeight, width, height, background, transparent, content, label}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${viewWidth} ${viewHeight}" role="img" aria-label="${escapeXml(label)}">
    <title>${escapeXml(label)}</title>
    ${transparent ? "" : `<rect width="${viewWidth}" height="${viewHeight}" fill="${background}"/>`}
    ${content}
  </svg>`;
}

export function buildPremiumQrSvg({
  url,
  card = {},
  style = DEFAULT_QR_STYLE,
  composition = "solo",
  size = 1024,
  factory = globalThis.qrcode,
  logoSvg = null,
  brandLogoSvg = null,
  companyName = "Lognext",
  tagline = "Your Meaningful Tech Partner.",
} = {}) {
  const safeComposition = allowed(composition, QR_COMPOSITIONS, "solo");
  const safeStyle = sanitizeQrStyle(style);
  const validation = validateQrDesign({url, style: safeStyle});
  if (!validation.canExport) throw new Error(validation.messages[0] || "El diseño QR no es seguro.");
  const dimensions = getCompositionDimensions(safeComposition, size);
  const graphic = buildQrGraphic({url, style: safeStyle, factory, logoSvg});
  const name = displayName(card);
  const role = text(card.jobTitle, 100);
  const footer = safeStyle.footerText || text(tagline, 100);
  const foreground = safeStyle.foregroundColor;
  const accent = safeStyle.accentColor;
  const background = safeStyle.backgroundColor;
  let viewWidth = 1000;
  let viewHeight = 1000;
  let content = "";
  if (safeComposition === "solo") {
    content = qrGroup(graphic, 35, 35, 930);
  } else if (safeComposition === "name") {
    viewHeight = 1240;
    content = [
      `<rect x="60" y="54" width="880" height="1112" rx="42" fill="${safeStyle.transparent ? "#FFFFFF" : background}" opacity="${safeStyle.transparent ? ".94" : "1"}"/>`,
      qrGroup(graphic, 105, 72, 790),
      `<rect x="390" y="914" width="220" height="8" rx="4" fill="${accent}"/>`,
      svgText(name, `x="500" y="990" text-anchor="middle" fill="${foreground}" font-family="Space Grotesk,Arial,sans-serif" font-size="48" font-weight="700"`),
      role ? svgText(role, `x="500" y="1042" text-anchor="middle" fill="${foreground}" opacity=".78" font-family="Space Grotesk,Arial,sans-serif" font-size="27"`) : "",
      footer ? svgText(footer, `x="500" y="1120" text-anchor="middle" fill="${foreground}" opacity=".68" font-family="Space Grotesk,Arial,sans-serif" font-size="22"`) : "",
    ].join("");
  } else if (safeComposition === "print") {
    viewHeight = 1414;
    content = [
      `<rect x="62" y="62" width="876" height="1290" rx="38" fill="${safeStyle.transparent ? "#FFFFFF" : background}" opacity="${safeStyle.transparent ? ".96" : "1"}" stroke="${accent}" stroke-width="5"/>`,
      brandLogoSvg
        ? vectorAssetMarkup(brandLogoSvg, {x: 300, y: 105, width: 400, height: 120, label: companyName})
        : svgText(companyName.toUpperCase(), `x="500" y="175" text-anchor="middle" fill="${foreground}" font-family="Space Grotesk,Arial,sans-serif" font-size="54" font-weight="700" letter-spacing="4"`),
      svgText("ESCANEA PARA GUARDAR MI CONTACTO", `x="500" y="275" text-anchor="middle" fill="${accent}" font-family="Space Grotesk,Arial,sans-serif" font-size="22" font-weight="700" letter-spacing="2"`),
      qrGroup(graphic, 135, 310, 730),
      svgText(name, `x="500" y="1130" text-anchor="middle" fill="${foreground}" font-family="Space Grotesk,Arial,sans-serif" font-size="48" font-weight="700"`),
      role ? svgText(role, `x="500" y="1182" text-anchor="middle" fill="${foreground}" opacity=".8" font-family="Space Grotesk,Arial,sans-serif" font-size="27"`) : "",
      footer ? svgText(footer, `x="500" y="1270" text-anchor="middle" fill="${foreground}" opacity=".68" font-family="Space Grotesk,Arial,sans-serif" font-size="21"`) : "",
    ].join("");
  } else {
    viewWidth = 1400;
    viewHeight = 504;
    content = [
      `<rect x="18" y="18" width="1364" height="468" rx="38" fill="${safeStyle.transparent ? "#FFFFFF" : background}" opacity="${safeStyle.transparent ? ".96" : "1"}" stroke="${accent}" stroke-width="4"/>`,
      qrGroup(graphic, 48, 48, 408),
      brandLogoSvg
        ? vectorAssetMarkup(brandLogoSvg, {x: 535, y: 65, width: 330, height: 96, label: companyName})
        : svgText(companyName.toUpperCase(), `x="535" y="132" fill="${foreground}" font-family="Space Grotesk,Arial,sans-serif" font-size="48" font-weight="700" letter-spacing="3"`),
      svgText(name, `x="535" y="238" fill="${foreground}" font-family="Space Grotesk,Arial,sans-serif" font-size="46" font-weight="700"`),
      role ? svgText(role, `x="535" y="292" fill="${foreground}" opacity=".8" font-family="Space Grotesk,Arial,sans-serif" font-size="28"`) : "",
      svgText(footer || "Escanea para abrir mi tarjeta digital", `x="535" y="375" fill="${foreground}" opacity=".7" font-family="Space Grotesk,Arial,sans-serif" font-size="24"`),
      `<rect x="535" y="408" width="220" height="8" rx="4" fill="${accent}"/>`,
    ].join("");
  }
  const label = `Código QR de ${name}`;
  return {
    markup: rootSvg({
      viewWidth,
      viewHeight,
      width: dimensions.width,
      height: dimensions.height,
      background,
      transparent: safeStyle.transparent && safeComposition === "solo",
      content,
      label,
    }),
    width: dimensions.width,
    height: dimensions.height,
    composition: safeComposition,
    style: safeStyle,
    validation,
    matrixSize: graphic.matrixSize,
    quietModules: graphic.quietModules,
    logoEmbedded: graphic.logoEmbedded,
    url: String(url),
  };
}

export function safeQrFilename(card = {}, composition = "solo", extension = "png") {
  const source = [card.firstName, card.lastName].filter(Boolean).join(" ") || card.slug || card.id || "tarjeta";
  const slug = String(source)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "tarjeta";
  const safeComposition = allowed(composition, QR_COMPOSITIONS, "solo");
  const suffix = safeComposition === "solo" ? "" : safeComposition === "email" ? "-email-signature" : `-${safeComposition}`;
  const safeExtension = String(extension).toLowerCase() === "svg" ? "svg" : "png";
  return `qr-${slug}${suffix}.${safeExtension}`;
}
