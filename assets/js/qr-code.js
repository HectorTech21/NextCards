export function buildQrSvg(url, factory = globalThis.qrcode) {
  if (!String(url || "").trim()) throw new Error("El QR necesita una URL.");
  if (typeof factory !== "function") throw new Error("El generador QR no está disponible.");
  const code = factory(0, "M");
  code.addData(String(url));
  code.make();
  return code.createSvgTag(4, 0);
}
