export function buildQrSvg(url, factory = globalThis.qrcode, options = {}) {
  if (!String(url || "").trim()) throw new Error("El QR necesita una URL.");
  if (typeof factory !== "function") throw new Error("El generador QR no está disponible.");
  const level = ["L", "M", "Q", "H"].includes(options.errorCorrection) ? options.errorCorrection : "M";
  const darkColor = /^#[0-9A-F]{6}$/i.test(options.darkColor || "") ? options.darkColor.toUpperCase() : "#000000";
  const lightColor = /^#[0-9A-F]{6}$/i.test(options.lightColor || "") ? options.lightColor.toUpperCase() : "#FFFFFF";
  const code = factory(0, level);
  code.addData(String(url));
  code.make();
  return code.createSvgTag(4, 0)
    .replace(/fill=(["'])(?:#000000|black)\1/gi, `fill="${darkColor}"`)
    .replace(/fill=(["'])(?:#ffffff|white)\1/gi, `fill="${lightColor}"`)
    .replace(/#000000/gi, darkColor)
    .replace(/#ffffff/gi, lightColor);
}

export function renderQrSvg(container, svgMarkup, {ariaLabel = "Código QR"} = {}) {
  if (!container) throw new Error("No se ha encontrado el contenedor del QR.");
  const parsed = new DOMParser().parseFromString(String(svgMarkup || ""), "image/svg+xml");
  const svg = parsed.documentElement;
  if (svg.localName !== "svg" || parsed.querySelector("parsererror")) throw new Error("SVG de QR no válido.");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", ariaLabel);
  const imported = document.importNode(svg, true);
  container.replaceChildren(imported);
  return imported;
}

export function renderQr(container, url, {factory = globalThis.qrcode, options = {}, ariaLabel = "Código QR"} = {}) {
  return renderQrSvg(container, buildQrSvg(url, factory, options), {ariaLabel});
}

export async function downloadQrPng(container, filename, {size = 1024} = {}) {
  const svg = container?.querySelector("svg");
  if (!svg) throw new Error("El QR no está disponible para descargar.");
  const markup = new XMLSerializer().serializeToString(svg);
  const source = URL.createObjectURL(new Blob([markup], {type: "image/svg+xml;charset=utf-8"}));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("No se ha podido preparar el QR."));
      image.src = source;
    });
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se ha podido preparar el QR.");
    context.drawImage(image, 0, 0, size, size);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) throw new Error("No se ha podido generar el archivo PNG.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    return filename;
  } finally {
    URL.revokeObjectURL(source);
  }
}
