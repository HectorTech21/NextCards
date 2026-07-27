import assert from "node:assert/strict";
import fs from "node:fs/promises";

const read=path=>fs.readFile(new URL(`../${path}`,import.meta.url),"utf8");
const [seedSource,indexSource,uiSource,cssSource,appSource]=await Promise.all([
  read("assets/data/employees.json"),
  read("index.html"),
  read("assets/js/templates-ui.js"),
  read("assets/css/template-comparator.css"),
  read("assets/js/app.js"),
]);
const seed=JSON.parse(seedSource);

class LocalStorageMock{
  #values=new Map();
  getItem(key){return this.#values.has(key)?this.#values.get(key):null}
  setItem(key,value){this.#values.set(key,String(value))}
  removeItem(key){this.#values.delete(key)}
  clear(){this.#values.clear()}
}

globalThis.localStorage=new LocalStorageMock();
globalThis.fetch=async()=>({ok:true,json:async()=>structuredClone(seed)});

const {
  MAX_COMPARISON_TEMPLATES,
  MIN_COMPARISON_TEMPLATES,
  describeTemplate,
  normalizeComparisonSelection,
  recommendedTemplateIds,
  toggleComparisonTemplate,
}=await import("../assets/js/template-comparator.js");
const {templateService}=await import("../assets/js/templates-store.js");
const {storage}=await import("../assets/js/storage.js");

assert.equal(MIN_COMPARISON_TEMPLATES,2);
assert.equal(MAX_COMPARISON_TEMPLATES,4);
const activeTemplates=templateService.getTemplates({includeArchived:false});
const defaultTemplate=templateService.getDefaultTemplate();
const sourceCard=structuredClone(seed.find(card=>card.status==="active")||seed[0]);
const recommendations=recommendedTemplateIds(sourceCard,activeTemplates,defaultTemplate);
assert.equal(recommendations.length,4,"Las recomendadas deben ofrecer cuatro alternativas cuando existen.");
assert.equal(new Set(recommendations).size,recommendations.length,"Una plantilla no puede aparecer dos veces.");
assert.ok(recommendations.includes(sourceCard.template),"La plantilla actual debe estar entre las recomendadas.");
assert.ok(recommendations.includes(defaultTemplate.id),"La predeterminada debe estar entre las recomendadas.");

const fifth=activeTemplates.find(template=>!recommendations.includes(template.id));
const fifthAttempt=toggleComparisonTemplate(recommendations,fifth.id,activeTemplates);
assert.equal(fifthAttempt.limitReached,true,"La quinta selección debe rechazarse de forma explícita.");
assert.deepEqual(fifthAttempt.ids,recommendations,"Intentar una quinta no debe reemplazar selecciones.");
const removed=toggleComparisonTemplate(recommendations,recommendations[0],activeTemplates);
assert.equal(removed.ids.length,3);
const restored=toggleComparisonTemplate(removed.ids,recommendations[0],activeTemplates);
assert.equal(restored.ids.length,4);
assert.deepEqual(
  normalizeComparisonSelection([recommendations[0],recommendations[0],"inexistente",...recommendations],activeTemplates),
  recommendations,
  "La selección debe deduplicarse, filtrar inactivas y respetar el máximo.",
);

const darkSummary=describeTemplate(templateService.getTemplateById("corporate-navy"));
const lightSummary=describeTemplate(templateService.getTemplateById("clean-light"));
assert.equal(darkSummary.tone,"Oscuro");
assert.equal(lightSummary.tone,"Claro");
for(const summary of [darkSummary,lightSummary]){
  for(const key of ["tone","style","contrast","photo","actions","usage","sentence"])assert.ok(summary[key],`El resumen debe incluir ${key}.`);
}

storage.saveCards(structuredClone(seed));
const before=structuredClone(storage.getCards());
const target=activeTemplates.find(template=>template.id!==sourceCard.template);
const defaultBefore=templateService.getDefaultTemplate().id;
const usageBefore=templateService.getTemplateUsageCount(target.id);
const result=templateService.applyTemplateToCards(target.id,[sourceCard.id],{useTemplateAccent:false});
assert.deepEqual(result,{updated:1,skipped:0,errors:[]});
const after=storage.getCards();
const changed=after.find(card=>card.id===sourceCard.id);
const original=before.find(card=>card.id===sourceCard.id);
assert.equal(changed.template,target.id);
for(const [key,value] of Object.entries(original)){
  if(["template","updatedAt"].includes(key))continue;
  assert.deepEqual(changed[key],value,`La aplicación individual debe conservar ${key}.`);
}
assert.deepEqual(changed.photoFrame,original.photoFrame);
assert.deepEqual(changed.qrStyle,original.qrStyle);
assert.deepEqual(changed.visibleFields,original.visibleFields);
assert.equal(changed.accentColor,original.accentColor);
assert.equal(templateService.getDefaultTemplate().id,defaultBefore,"El comparador no puede cambiar la predeterminada.");
assert.equal(templateService.getTemplateUsageCount(target.id),usageBefore+1,"El contador de uso debe reflejar la aplicación.");
for(const card of before.filter(card=>card.id!==sourceCard.id)){
  assert.deepEqual(after.find(item=>item.id===card.id),card,`La tarjeta ${card.id} no debe modificarse.`);
}
assert.equal(storage.getCards().find(card=>card.id===sourceCard.id).template,target.id,"La plantilla debe persistir al releer el almacenamiento.");

assert.match(indexSource,/templates-panel-heading[\s\S]*data-template-action="compare"[\s\S]*Comparar plantillas/);
assert.match(indexSource,/id="template-compare-modal"[\s\S]*role="dialog"[\s\S]*aria-modal="true"/);
assert.match(indexSource,/aria-labelledby="template-compare-title"/);
assert.match(indexSource,/id="template-compare-person-search"/);
assert.match(indexSource,/data-compare-device="mobile"[\s\S]*data-compare-device="tablet"[\s\S]*data-compare-device="desktop"/);
assert.match(indexSource,/id="template-compare-apply"[^>]+disabled/);
assert.match(uiSource,/renderCardPreview\(preview,card,template,null,\{interactive:false\}\)/);
assert.match(uiSource,/applyTemplateToCards\(template\.id,\[card\.id\],\{useTemplateAccent:false\}\)/);
assert.match(uiSource,/toast\("Plantilla aplicada correctamente"\)/);
assert.doesNotMatch(uiSource,/setInterval|autoplay/i,"El carrusel no debe reproducirse automáticamente.");
assert.match(cssSource,/min-height:44px/);
assert.match(cssSource,/@media\(max-width:767px\)/);
assert.match(cssSource,/@media\(max-width:1180px\)/);
assert.match(cssSource,/@media\(min-width:1600px\)/);
assert.match(cssSource,/\.compare-preview:not\(\.is-carousel-active\)\{display:none\}/);

assert.doesNotMatch(indexSource,/data-section="employees"/,"Empleados no debe aparecer en la navegación.");
assert.match(indexSource,/<span>Empleados<\/span>/,"La métrica de personas debe conservarse.");
assert.doesNotMatch(appSource,/section==="employees"/,"No debe quedar un listener exclusivo de la sección eliminada.");
assert.match(appSource,/normalizeLegacyEmployeeLocation/);
assert.match(appSource,/#employees/);
assert.match(appSource,/employees\(\?:\\\.html\)\?/);
await assert.rejects(fs.access(new URL("../employees.html",import.meta.url)),"No debe mantenerse una página Employees oculta.");

console.log("OK: comparador 2–4, datos reales, resumen, aplicación individual persistente, preservación completa, accesibilidad base y retirada de Empleados verificados.");
