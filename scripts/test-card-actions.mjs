import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {ACTION_TYPES,actionCountClass,actionRowPlan} from "../assets/js/card-actions.js";

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
for(let count=0;count<=8;count+=1)assert.equal(actionCountClass(count),`actions-count-${count}`);
assert.equal(actionCountClass(9),"actions-count-many");
assert.deepEqual(actionRowPlan(1),[1]);
assert.deepEqual(actionRowPlan(2),[2]);
assert.deepEqual(actionRowPlan(3),[3]);
assert.deepEqual(actionRowPlan(4),[4]);
assert.deepEqual(actionRowPlan(5),[3,2]);
assert.deepEqual(actionRowPlan(6),[3,3]);
assert.deepEqual(actionRowPlan(7),[4,3]);
assert.deepEqual(actionRowPlan(8),[4,4]);
assert.deepEqual(actionRowPlan(9),[3,3,3]);
assert.deepEqual(actionRowPlan(10),[4,3,3]);
assert.deepEqual(actionRowPlan(13),[4,3,3,3]);
assert.match(component, /createElement\(isLink \? "a" : interactive \? "button" : "span"\)/, "Las acciones interactivas deben usar enlaces o botones y las previews, elementos neutros.");
assert.match(component, /setAttribute\("aria-hidden", "true"\)/, "Las acciones decorativas de preview no deben entrar en el árbol accesible.");
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
assert.match(styles, /display:flex/, "La distribución debe utilizar Flexbox.");
assert.match(styles, /flex-wrap:wrap/, "Las acciones deben poder saltar de fila.");
assert.match(styles, /justify-content:center/, "Cada fila debe quedar centrada.");
assert.match(styles, /action-row-columns-3/, "Las filas de tres acciones deben tener tres columnas.");
assert.match(styles, /action-row-columns-4/, "Las filas de cuatro acciones deben tener cuatro columnas.");

assert.match(preview, /renderActionGrid\(actions,orderedActions/, "La tarjeta debe reunir todas las acciones en un único contenedor.");
assert.doesNotMatch(preview, /renderActionGrid\(contact/, "Contacto y redes no deben crear filas independientes.");
assert.match(preview, /Boolean\(options\.interactive\)/, "La preview debe ser segura por defecto.");
assert.match(preview, /interactive\?"h1":"div"/, "Solo la tarjeta pública interactiva debe aportar el H1 de la persona.");
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
