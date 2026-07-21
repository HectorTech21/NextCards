import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {ACTION_TYPES} from "../assets/js/card-actions.js";

const read = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [component, styles, preview, publicCard, cardHtml, indexHtml, positiveSymbol] = await Promise.all([
  read("assets/js/card-actions.js"),
  read("assets/css/card-actions.css"),
  read("assets/js/preview.js"),
  read("assets/js/public-card.js"),
  read("card.html"),
  read("index.html"),
  read("assets/img/logos/lognext-symbol-positive.svg"),
]);

assert.deepEqual(ACTION_TYPES, ["contact", "linkedin", "website", "email", "phone", "share", "copy"]);
assert.match(component, /createElement\(isLink \? "a" : "button"\)/, "Las acciones deben usar elementos semánticos.");
assert.match(component, /noopener noreferrer/, "Los enlaces externos deben estar protegidos.");
assert.match(component, /aria-label/, "Las acciones deben tener nombre accesible.");
assert.match(component, /lognext-symbol-positive\.svg/, "Website debe usar el símbolo oficial de Lognext.");
assert.match(component, /M20\.447 20\.452/, "LinkedIn debe usar un símbolo vectorial dedicado.");

for (const animation of ["contact-particle", "linkedin-ring", "website-perimeter", "email-trace", "phone-wave", "share-node"]) {
  assert.match(styles, new RegExp(`@keyframes action-${animation}`), `Falta la animación ${animation}.`);
}
assert.match(styles, /card-action--copy\.is-confirmed/, "Copiar debe tener confirmación visual.");
assert.match(styles, /prefers-reduced-motion:reduce/, "Debe existir soporte de movimiento reducido.");
assert.match(styles, /@media\(hover:none\)/, "Debe existir feedback táctil sin hover.");
assert.match(styles, /min-height:82px/, "La superficie completa debe superar el mínimo táctil de 44 px.");

assert.match(preview, /renderActionGrid\(contact/, "La preview debe usar el componente común para contacto.");
assert.match(preview, /renderActionGrid\(socials/, "La preview debe usar el componente común para redes.");
assert.match(preview, /interactive=false/, "La preview debe ser segura por defecto.");
assert.match(publicCard, /renderCardPreview\(publicCard,card,null,null,\{interactive:true\}\)/, "La tarjeta pública debe habilitar enlaces reales.");
assert.match(publicCard, /settings\.cards\.actionOrder/, "La página pública debe respetar el orden configurado.");
assert.match(publicCard, /setActionFeedback\(element,"Copiado"\)/, "Copiar debe cambiar temporalmente su etiqueta.");
assert.doesNotMatch(publicCard, /const paths\s*=/, "No debe quedar un registro duplicado de iconos en la página pública.");

assert.match(cardHtml, /id="public-primary-actions"><\/div>/, "Las acciones públicas deben renderizarse desde el componente.");
assert.doesNotMatch(cardHtml, /id="save-contact"/, "No deben repetirse bloques manuales de acciones en HTML.");
assert.match(cardHtml, /assets\/css\/card-actions\.css/, "La tarjeta pública debe cargar los estilos de acciones.");
assert.match(indexHtml, /assets\/css\/card-actions\.css/, "El editor y las plantillas deben cargar los estilos de acciones.");
assert.match(positiveSymbol, /#000029/i);
assert.match(positiveSymbol, /#FA3C0F/i);

console.log("Card actions: componente, marca, accesibilidad, animaciones e integración verificados.");
