import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, card, app, editor, preview, publicCard, globalCss, variablesCss] = await Promise.all([
  read("index.html"), read("card.html"), read("assets/js/app.js"), read("assets/js/editor.js"),
  read("assets/js/preview.js"), read("assets/js/public-card.js"), read("assets/css/global.css"), read("assets/css/variables.css"),
]);

for (const source of [app, editor, preview, publicCard]) assert.doesNotMatch(source, /\.innerHTML\s*=|insertAdjacentHTML\s*\(/, "No debe inyectarse HTML introducido por usuarios.");
assert.match(editor, /beforeunload/);
assert.match(editor, /trapEditorFocus/);
assert.match(editor, /regenerate-slug/);
assert.match(editor, /Hay cambios sin guardar/);
assert.match(preview, /addEventListener\("error"/);
assert.match(app, /loading(?::|=)"lazy"/);
assert.match(index, /aria-current="page"/);
assert.match(index, /class="editor-dialog"[^>]+tabindex="-1"/);
assert.match(card, /rel="canonical"/);
assert.match(card, /name="twitter:card"/);
assert.match(card, /property="og:image:alt"/);
assert.match(publicCard, /noindex,nofollow/);
assert.match(publicCard, /index,follow,max-image-preview:large/);
assert.match(publicCard, /canDisplayPublicCard\(card,accessContext\.source\)/, "La ruta pública debe validar estado y contexto antes de renderizar.");
assert.match(publicCard, /allowSharing:published/, "Un borrador en preview no debe exponer compartir ni copiar.");
assert.match(preview, /headingTag,"dc-name"/, "Las previews deben usar una identidad visual sin contaminar la jerarquía de encabezados.");
assert.match(variablesCss, /--control-height:44px/);
assert.match(globalCss, /prefers-reduced-motion:reduce/);
assert.match(globalCss, /overflow-x:clip/, "El recorte horizontal no debe crear un contenedor que rompa la cabecera sticky.");
assert.doesNotMatch(index, /<script[^>]+src="https?:\/\//i, "La aplicación no debe depender de scripts remotos.");
assert.match(app, /#menu-toggle"\)\.setAttribute\("aria-expanded","false"\)/, "El drawer móvil debe sincronizar su estado accesible al navegar.");
const blankLinks = [...index.matchAll(/<a\b[^>]*target="_blank"[^>]*>/gi)].map(match => match[0]);
assert.ok(blankLinks.every(link => /rel="[^"]*noopener[^"]*noreferrer/i.test(link)), "Los enlaces externos del dashboard deben aislar la pestaña abierta.");

const {canDisplayPublicCard,isAdministrativePreviewSource}=await import("../assets/js/card-export.js");
assert.equal(canDisplayPublicCard({status:"active"},"direct"),true);
assert.equal(canDisplayPublicCard({status:"draft"},"direct"),false);
assert.equal(canDisplayPublicCard({status:"draft"},"admin_preview"),true);
assert.equal(canDisplayPublicCard({status:"draft"},"editor_preview"),true);
assert.equal(canDisplayPublicCard({status:"disabled"},"admin_preview"),false);
assert.equal(isAdministrativePreviewSource("copied_link"),false);

console.log("OK: seguridad DOM, accesibilidad del editor, fallbacks de imagen, metadatos, controles, motion y recursos locales verificados.");
