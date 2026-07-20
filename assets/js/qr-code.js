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
