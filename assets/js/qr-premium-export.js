import {
  buildPremiumQrSvg,
  getCompositionDimensions,
  safeQrFilename,
  sanitizeQrStyle,
} from "./qr-premium-core.js?v=1.8.4";

const assetCache = new Map();
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const SVG_ELEMENTS = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
const SVG_ATTRIBUTES = new Set([
  "viewBox", "width", "height", "fill", "stroke", "stroke-width", "d", "x", "y",
  "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "transform", "opacity",
  "points", "fill-rule", "clip-rule", "stroke-linecap", "stroke-linejoin",
]);
const EXTERNAL_REFERENCE = /(?:javascript:|https?:|file:|data:|@import|url\s*\(|[a-z]:\\|assets\/)/i;
const COLOR_VALUE = /^(?:none|currentColor|#[0-9A-F]{3,8})$/i;
const NUMBER_VALUE = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const PATH_VALUE = /^[MmZzLlHhVvCcSsQqTtAa0-9eE+.,\s-]+$/;
const POINTS_VALUE = /^[0-9eE+.,\s-]+$/;
const TRANSFORM_VALUE = /^(?:(?:matrix|translate|scale|rotate|skewX|skewY)\([0-9eE+.,\s-]+\)\s*)+$/;
const SYMBOL_UNAVAILABLE_WARNING = "El símbolo corporativo no está disponible; se generará el QR sin logo.";
const WORDMARK_UNAVAILABLE_WARNING = "El logotipo corporativo no está disponible; se utilizará texto Lognext.";

const BRAND_ASSETS = Object.freeze({
  symbolPositive: new URL("../img/logos/lognext-symbol-qr-dark.svg", import.meta.url),
  symbolNegative: new URL("../img/logos/lognext-symbol-qr-light.svg", import.meta.url),
  logoPositive: new URL("../img/logos/lognext-logo-qr-dark.svg", import.meta.url),
  logoNegative: new URL("../img/logos/lognext-logo-qr-light.svg", import.meta.url),
});

function isDarkBackground(style) {
  if (style.transparent) return false;
  const hex = style.backgroundColor;
  const channels = [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const luminance = channels
    .map(value => value <= .03928 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  return luminance < .28;
}

export class BrandAssetError extends Error {
  constructor(message, code = "INVALID_SVG") {
    super(message);
    this.name = "BrandAssetError";
    this.code = code;
  }
}

function escapeAttribute(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function validateAttribute(name, value) {
  if (/^on/i.test(name)) throw new BrandAssetError(`Atributo de evento no permitido: ${name}.`, "EVENT_ATTRIBUTE");
  if (!SVG_ATTRIBUTES.has(name)) throw new BrandAssetError(`Atributo SVG no permitido: ${name}.`, "DISALLOWED_ATTRIBUTE");
  if (EXTERNAL_REFERENCE.test(value)) throw new BrandAssetError("El SVG contiene una referencia externa.", "EXTERNAL_REFERENCE");
  if (["fill", "stroke"].includes(name) && !COLOR_VALUE.test(value)) {
    throw new BrandAssetError(`Color SVG no permitido en ${name}.`, "INVALID_COLOR");
  }
  if (["width", "height", "x", "y", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "opacity", "stroke-width"].includes(name)
    && !NUMBER_VALUE.test(value)) {
    throw new BrandAssetError(`Valor numérico SVG no permitido en ${name}.`, "INVALID_NUMBER");
  }
  if (name === "d" && !PATH_VALUE.test(value)) throw new BrandAssetError("Trazado SVG no permitido.", "INVALID_PATH");
  if (name === "points" && !POINTS_VALUE.test(value)) throw new BrandAssetError("Puntos SVG no permitidos.", "INVALID_POINTS");
  if (name === "transform" && !TRANSFORM_VALUE.test(value)) throw new BrandAssetError("Transformación SVG no permitida.", "INVALID_TRANSFORM");
  if (["fill-rule", "clip-rule"].includes(name) && !["nonzero", "evenodd"].includes(value)) {
    throw new BrandAssetError(`Regla SVG no permitida en ${name}.`, "INVALID_RULE");
  }
  if (name === "stroke-linecap" && !["butt", "round", "square"].includes(value)) {
    throw new BrandAssetError("Extremo de trazo SVG no permitido.", "INVALID_STROKE");
  }
  if (name === "stroke-linejoin" && !["miter", "round", "bevel"].includes(value)) {
    throw new BrandAssetError("Unión de trazo SVG no permitida.", "INVALID_STROKE");
  }
  return `${name}="${escapeAttribute(value)}"`;
}

function serializeSafeElement(element, state) {
  const tag = String(element.localName || element.nodeName || "").toLowerCase();
  if (!SVG_ELEMENTS.has(tag)) throw new BrandAssetError(`Elemento SVG no permitido: ${tag || "desconocido"}.`, "DISALLOWED_ELEMENT");
  const attributes = Array.from(element.attributes || [])
    .map(attribute => validateAttribute(attribute.name, String(attribute.value || "").trim()))
    .sort();
  if (tag !== "g") state.shapeCount += 1;
  const children = [];
  for (const child of Array.from(element.childNodes || [])) {
    if (child.nodeType === 3 && !String(child.nodeValue || "").trim()) continue;
    if (child.nodeType !== 1) throw new BrandAssetError("El SVG contiene nodos no permitidos.", "DISALLOWED_NODE");
    children.push(serializeSafeElement(child, state));
  }
  const opening = `<${tag}${attributes.length ? ` ${attributes.join(" ")}` : ""}`;
  return children.length ? `${opening}>${children.join("")}</${tag}>` : `${opening}/>`;
}

export function parseSafeBrandSvg(markup, {DOMParserCtor = globalThis.DOMParser} = {}) {
  const source = String(markup || "").trim();
  if (!source) throw new BrandAssetError("El recurso SVG está vacío.", "EMPTY_SVG");
  if (typeof DOMParserCtor !== "function") throw new BrandAssetError("No existe un parser SVG seguro.", "DOM_PARSER_UNAVAILABLE");
  const parsed = new DOMParserCtor().parseFromString(source, "image/svg+xml");
  if (parsed.getElementsByTagName?.("parsererror")?.length) {
    throw new BrandAssetError("El recurso no contiene XML válido.", "INVALID_XML");
  }
  const root = parsed.documentElement;
  if (!root || String(root.localName || root.nodeName).toLowerCase() !== "svg" || (root.namespaceURI && root.namespaceURI !== SVG_NAMESPACE)) {
    throw new BrandAssetError("El recurso no tiene una raíz SVG válida.", "INVALID_ROOT");
  }
  for (const attribute of Array.from(root.attributes || [])) {
    if (attribute.name === "xmlns" && attribute.value === SVG_NAMESPACE) continue;
    if (attribute.name !== "viewBox") {
      throw new BrandAssetError(`Atributo raíz SVG no permitido: ${attribute.name}.`, "DISALLOWED_ROOT_ATTRIBUTE");
    }
  }
  const viewBox = String(root.getAttribute("viewBox") || "").trim();
  const viewBoxValues = viewBox.split(/[\s,]+/).map(Number);
  if (viewBoxValues.length !== 4 || viewBoxValues.some(value => !Number.isFinite(value)) || viewBoxValues[2] <= 0 || viewBoxValues[3] <= 0) {
    throw new BrandAssetError("El recurso SVG necesita un viewBox válido.", "INVALID_VIEWBOX");
  }
  const state = {shapeCount: 0};
  const children = [];
  for (const child of Array.from(root.childNodes || [])) {
    if (child.nodeType === 3 && !String(child.nodeValue || "").trim()) continue;
    if (child.nodeType !== 1) throw new BrandAssetError("El SVG contiene comentarios o nodos no permitidos.", "DISALLOWED_NODE");
    children.push(serializeSafeElement(child, state));
  }
  if (!state.shapeCount || !children.length) throw new BrandAssetError("El SVG no contiene formas vectoriales.", "EMPTY_VECTOR");
  return {
    validated: true,
    viewBox: viewBoxValues.join(" "),
    markup: children.join(""),
    shapeCount: state.shapeCount,
  };
}

async function fetchWithTimeout(url, fetchImpl, timeoutMs) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  let timeoutId;
  const timeout = new Promise((_resolve, reject) => {
    timeoutId = globalThis.setTimeout?.(() => {
      controller?.abort();
      reject(new BrandAssetError("La carga del recurso SVG ha agotado el tiempo.", "TIMEOUT"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      fetchImpl(url, controller ? {signal: controller.signal} : undefined),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof BrandAssetError) throw error;
    throw new BrandAssetError("No se pudo cargar el recurso SVG.", "FETCH_FAILED");
  } finally {
    globalThis.clearTimeout?.(timeoutId);
  }
}

export async function loadBrandSvgAsset(url, {
  fetchImpl = globalThis.fetch,
  DOMParserCtor = globalThis.DOMParser,
  timeoutMs = 5000,
} = {}) {
  const key = String(url);
  if (assetCache.has(key)) return assetCache.get(key);
  if (typeof fetchImpl !== "function") throw new Error("No se puede cargar el recurso de marca.");
  const pending = (async () => {
    const response = await fetchWithTimeout(url, fetchImpl, timeoutMs);
    if (!response?.ok) throw new BrandAssetError(`No se pudo cargar el recurso de marca (${response?.status || "sin respuesta"}).`, "HTTP_ERROR");
    const mime = String(response.headers?.get?.("content-type") || "").split(";")[0].trim().toLowerCase();
    if (mime !== "image/svg+xml") throw new BrandAssetError(`MIME de recurso no permitido: ${mime || "vacío"}.`, "INVALID_MIME");
    return Object.freeze({
      ...parseSafeBrandSvg(await response.text(), {DOMParserCtor}),
      mime,
    });
  })();
  assetCache.set(key, pending);
  void pending.catch(() => {
    globalThis.setTimeout?.(() => {
      if (assetCache.get(key) === pending) assetCache.delete(key);
    }, 30000);
  });
  return pending;
}

export async function resolveQrBrandAssets(style, {
  composition = "solo",
  fetchImpl = globalThis.fetch,
  DOMParserCtor = globalThis.DOMParser,
  timeoutMs = 5000,
} = {}) {
  const safe = sanitizeQrStyle(style);
  const negative = isDarkBackground(safe);
  const warnings = [];
  let logoSvg = null;
  let brandLogoSvg = null;
  if (safe.logo === "lognext-symbol") {
    try {
      logoSvg = await loadBrandSvgAsset(negative ? BRAND_ASSETS.symbolNegative : BRAND_ASSETS.symbolPositive, {
        fetchImpl, DOMParserCtor, timeoutMs,
      });
    } catch {
      warnings.push(SYMBOL_UNAVAILABLE_WARNING);
    }
  }
  if (["print", "email"].includes(composition)) {
    try {
      brandLogoSvg = await loadBrandSvgAsset(negative ? BRAND_ASSETS.logoNegative : BRAND_ASSETS.logoPositive, {
        fetchImpl, DOMParserCtor, timeoutMs,
      });
    } catch {
      warnings.push(WORDMARK_UNAVAILABLE_WARNING);
    }
  }
  return {logoSvg, brandLogoSvg, warnings};
}

export async function createPremiumQrAsset({
  url,
  card,
  style,
  composition = "solo",
  size = 1024,
  factory = globalThis.qrcode,
  settings = {},
  fetchImpl = globalThis.fetch,
  DOMParserCtor = globalThis.DOMParser,
  assetTimeoutMs = 5000,
} = {}) {
  const safeStyle = sanitizeQrStyle(style);
  const assets = await resolveQrBrandAssets(safeStyle, {
    composition,
    fetchImpl,
    DOMParserCtor,
    timeoutMs: assetTimeoutMs,
  });
  const asset = buildPremiumQrSvg({
    url,
    card,
    style: safeStyle,
    composition,
    size,
    factory,
    ...assets,
    companyName: settings?.publicCard?.companyName || "Lognext",
    tagline: settings?.publicCard?.tagline || "Your Meaningful Tech Partner.",
  });
  return {
    ...asset,
    warnings: assets.warnings,
    logoAvailable: safeStyle.logo === "none" || Boolean(assets.logoSvg),
  };
}

function loadSvgImage(markup, {
  urlApi = globalThis.URL,
  ImageCtor = globalThis.Image,
} = {}) {
  if (!urlApi?.createObjectURL || typeof ImageCtor !== "function") throw new Error("El navegador no permite preparar la imagen.");
  const sourceUrl = urlApi.createObjectURL(new Blob([markup], {type: "image/svg+xml;charset=utf-8"}));
  return new Promise((resolve, reject) => {
    const image = new ImageCtor();
    image.onload = () => resolve({image, sourceUrl});
    image.onerror = () => {
      urlApi.revokeObjectURL(sourceUrl);
      reject(new Error("No se ha podido rasterizar el código QR."));
    };
    image.src = sourceUrl;
  });
}

export async function qrAssetToPngBlob(asset, {
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  ImageCtor = globalThis.Image,
} = {}) {
  if (!asset?.markup) throw new Error("No existe un QR preparado para exportar.");
  const dimensions = getCompositionDimensions(asset.composition, asset.width);
  const {image, sourceUrl} = await loadSvgImage(asset.markup, {urlApi, ImageCtor});
  try {
    const canvas = documentRef?.createElement?.("canvas");
    if (!canvas) throw new Error("El navegador no permite crear el archivo PNG.");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("El navegador no permite crear el archivo PNG.");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png", 1));
    if (!blob) throw new Error("No se ha podido generar el archivo PNG.");
    return blob;
  } finally {
    urlApi.revokeObjectURL(sourceUrl);
  }
}

export function createQrSvgBlob(asset) {
  if (!asset?.markup) throw new Error("No existe un QR preparado para exportar.");
  return new Blob([asset.markup], {type: "image/svg+xml;charset=utf-8"});
}

export function triggerBlobDownload(blob, filename, {
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
} = {}) {
  if (!(blob instanceof Blob)) throw new Error("El archivo no está disponible.");
  const objectUrl = urlApi.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  link.hidden = true;
  documentRef.body.append(link);
  link.click();
  link.remove();
  globalThis.setTimeout?.(() => urlApi.revokeObjectURL(objectUrl), 0);
  return filename;
}

export async function downloadPremiumQr(asset, {
  card,
  format = "png",
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  ImageCtor = globalThis.Image,
} = {}) {
  const extension = format === "svg" ? "svg" : "png";
  const filename = safeQrFilename(card, asset.composition, extension);
  const blob = extension === "svg"
    ? createQrSvgBlob(asset)
    : await qrAssetToPngBlob(asset, {documentRef, urlApi, ImageCtor});
  triggerBlobDownload(blob, filename, {documentRef, urlApi});
  return {filename, blob, format: extension};
}

export async function copyPremiumQrImage(asset, {
  clipboard = globalThis.navigator?.clipboard,
  ClipboardItemCtor = globalThis.ClipboardItem,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  ImageCtor = globalThis.Image,
} = {}) {
  if (!clipboard?.write || typeof ClipboardItemCtor !== "function") {
    const error = new Error("Este navegador no permite copiar imágenes al portapapeles.");
    error.code = "CLIPBOARD_IMAGE_UNAVAILABLE";
    throw error;
  }
  const blob = await qrAssetToPngBlob(asset, {documentRef, urlApi, ImageCtor});
  await clipboard.write([new ClipboardItemCtor({"image/png": blob})]);
  return {status: "copied", blob};
}

export async function sharePremiumQrFile(asset, {
  card,
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
  urlApi = globalThis.URL,
  ImageCtor = globalThis.Image,
} = {}) {
  if (typeof File !== "function") {
    return {status: "unavailable", reason: "files"};
  }
  const blob = await qrAssetToPngBlob(asset, {documentRef, urlApi, ImageCtor});
  const filename = safeQrFilename(card, asset.composition, "png");
  const file = new File([blob], filename, {type: "image/png"});
  if (!navigatorRef?.share || !navigatorRef?.canShare?.({files: [file]})) {
    return {status: "unavailable", reason: "web-share", blob, filename};
  }
  try {
    await navigatorRef.share({
      files: [file],
      title: `QR de ${[card?.firstName, card?.lastName].filter(Boolean).join(" ") || "NextCards"}`,
      text: `Tarjeta digital de ${[card?.firstName, card?.lastName].filter(Boolean).join(" ") || "NextCards"}${asset.url ? `\n${asset.url}` : ""}`,
    });
    return {status: "shared", blob, filename};
  } catch (error) {
    if (error?.name === "AbortError") return {status: "cancelled", blob, filename};
    throw error;
  }
}

export function clearQrBrandAssetCache() {
  assetCache.clear();
}
