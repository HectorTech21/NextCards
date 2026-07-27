import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  CARD_COMPLETENESS_RULES,
  CARD_COMPLETENESS_TOTAL_WEIGHT,
  buildCompletenessSummary,
  createCompletenessContext,
  evaluateCardCompleteness,
  evaluateCardsCompleteness,
  filterCardsByCompleteness,
  sortCardsByCompleteness,
} from "../assets/js/card-completeness.js";

const template = {id: "corporate-navy", status: "active", name: "Corporate Navy"};
const settings = {
  completeness: {
    evaluateRecommended: true,
    includeWebsite: true,
    includeLinkedIn: true,
    includePhone: true,
    completeThreshold: 90,
  },
  cards: {actionOrder: ["save", "phone", "email", "linkedin", "website", "share"]},
};
const complete = {
  id: "case-a",
  slug: "caso-completo",
  firstName: "Ana",
  lastName: "Completa",
  jobTitle: "Directora",
  email: "ana@example.com",
  photo: "assets/img/employees/ana-completa.jpg",
  department: "Dirección",
  city: "Madrid",
  phone: "915 000 000",
  linkedin: "https://www.linkedin.com/in/ana-completa",
  website: "https://example.com",
  template: template.id,
  status: "active",
  visibleFields: {photo: true, jobTitle: true, department: true, city: true, email: true, phone: true, linkedin: true, website: true},
};

const evaluate = (card, cards = [card], criteria = settings) => evaluateCardCompleteness(card, createCompletenessContext({
  cards,
  templates: [template],
  settings: criteria,
  photoStatuses: new Map([[card.photo, "valid"]]),
}));

assert.equal(CARD_COMPLETENESS_TOTAL_WEIGHT, 100);
assert.equal(CARD_COMPLETENESS_RULES.reduce((total, rule) => total + rule.weight, 0), 100);

const caseA = evaluate(complete);
assert.equal(caseA.score, 100);
assert.equal(caseA.level, "complete");
assert.equal(caseA.blockingIssues, 0);

const almost = {...complete, id: "case-b", slug: "caso-casi-completo", linkedin: "", website: ""};
const caseB = evaluate(almost);
assert.ok(caseB.score >= 75 && caseB.score <= 89);
assert.equal(caseB.level, "almost-complete");
assert.equal(caseB.errors.some(issue => issue.field === "linkedin"), false, "Un campo ausente no debe recibir además un error de formato.");

const incomplete = {...complete, id: "case-c", slug: "caso-incompleto", photo: "", department: "", city: ""};
const caseC = evaluate(incomplete);
assert.ok(caseC.score >= 50 && caseC.score <= 74);
assert.equal(caseC.level, "incomplete");

const minimum = {
  ...complete,
  id: "case-d",
  slug: "caso-muy-incompleto",
  photo: "",
  department: "",
  city: "",
  phone: "",
  linkedin: "",
  website: "",
};
const caseD = evaluate(minimum);
assert.ok(caseD.score < 50);
assert.equal(caseD.level, "very-incomplete");

const duplicate = {...complete, id: "case-e", slug: complete.slug, firstName: "Eva", email: "eva@example.com"};
const duplicateCards = [complete, duplicate];
const duplicateContext = createCompletenessContext({cards: duplicateCards, templates: [template], settings, photoStatuses: new Map([[complete.photo, "valid"]])});
const caseE = evaluateCardCompleteness(complete, duplicateContext);
assert.ok(caseE.score >= 90);
assert.equal(caseE.level, "needs-review");
assert.ok(caseE.errors.some(issue => issue.code === "DUPLICATE_SLUG" && issue.blocking));

const invalidEmail = evaluate({...complete, id: "bad-email", slug: "bad-email", email: "correo-invalido"});
assert.equal(invalidEmail.level, "needs-review");
assert.ok(invalidEmail.errors.some(issue => issue.code === "INVALID_EMAIL"));

const withoutPhone = evaluate({...complete, id: "missing-phone", slug: "missing-phone", phone: "", mobile: ""});
assert.ok(withoutPhone.missing.some(issue => issue.field === "phone"));
assert.equal(withoutPhone.errors.some(issue => issue.field === "phone"), false, "Un teléfono ausente no debe recibir además un error de formato.");

const withoutJobTitle = evaluate({...complete, id: "missing-job", slug: "missing-job", jobTitle: ""});
assert.ok(withoutJobTitle.missing.some(issue => issue.field === "jobTitle" && issue.severity === "required"));
assert.equal(withoutJobTitle.blockingIssues, 0, "Un obligatorio ausente reduce completitud, pero no duplica las validaciones de guardado existentes.");

const deletedTemplate = evaluate({...complete, id: "deleted-template", slug: "deleted-template", template: "template-eliminada"});
assert.equal(deletedTemplate.level, "needs-review");
assert.ok(deletedTemplate.errors.some(issue => issue.code === "MISSING_TEMPLATE" && issue.blocking));

const brokenPhotoCard = {...complete, id: "broken-photo", slug: "broken-photo"};
const brokenPhoto = evaluateCardCompleteness(brokenPhotoCard, createCompletenessContext({
  cards: [brokenPhotoCard],
  templates: [template],
  settings,
  photoStatuses: new Map([[brokenPhotoCard.photo, "broken"]]),
}));
assert.ok(brokenPhoto.errors.some(issue => issue.code === "BROKEN_PHOTO" && !issue.blocking));
assert.equal(brokenPhoto.missing.some(issue => issue.field === "photo"), false, "Una referencia rota debe ser un error de calidad, no una ausencia duplicada.");

for (const status of ["draft", "disabled"]) {
  const statusResult = evaluate({...complete, id: `status-${status}`, slug: `status-${status}`, status});
  assert.equal(statusResult.errors.some(issue => issue.field === "status"), false, `${status} es un estado reconocido.`);
}

const corruptStatus = evaluate({...complete, id: "bad-status", slug: "bad-status", status: "corrupt"});
assert.equal(corruptStatus.level, "needs-review");
assert.ok(corruptStatus.errors.some(issue => issue.code === "INVALID_STATUS" && issue.blocking));

const duplicateIdPeer = {...complete, slug: "duplicate-id-peer", email: "peer@example.com"};
const duplicateIdContext = createCompletenessContext({
  cards: [complete, duplicateIdPeer],
  templates: [template],
  settings,
  photoStatuses: new Map([[complete.photo, "valid"]]),
});
assert.ok(evaluateCardCompleteness(complete, duplicateIdContext).errors.some(issue => issue.code === "DUPLICATE_ID" && issue.blocking));

const invalidSlug = evaluate({...complete, id: "invalid-slug", slug: "slug con espacios"});
assert.ok(invalidSlug.errors.some(issue => issue.code === "INVALID_SLUG" && issue.blocking));

const insecureWebsite = evaluate({...complete, id: "insecure-website", slug: "insecure-website", website: "http://example.com"});
assert.ok(insecureWebsite.errors.some(issue => issue.code === "INVALID_WEBSITE" && !issue.blocking));

const hiddenLinkedIn = evaluate({
  ...almost,
  id: "hidden-linkedin",
  slug: "hidden-linkedin",
  visibleFields: {...almost.visibleFields, linkedin: false},
});
assert.ok(hiddenLinkedIn.missing.some(issue => issue.field === "linkedin"), "Ocultar un campo no debe falsear su completitud.");

const longContent = evaluate({
  ...complete,
  id: "long-content",
  slug: "long-content",
  firstName: "Nombre profesional especialmente extenso",
  lastName: "Apellidos igualmente extensos para validar el motor",
  jobTitle: "Responsable internacional de transformación tecnológica y operaciones",
});
assert.equal(longContent.score, 100);
assert.equal(longContent.level, "complete");

const normalizedWithoutRecommended = evaluate(minimum, [minimum], {
  ...settings,
  completeness: {...settings.completeness, evaluateRecommended: false},
});
assert.equal(normalizedWithoutRecommended.score, 100, "Los criterios desactivados deben salir del denominador.");

const cards = [complete, almost, incomplete, minimum];
const evaluations = evaluateCardsCompleteness(cards, {
  cards,
  templates: [template],
  settings,
  photoStatuses: new Map([[complete.photo, "valid"]]),
});
assert.equal(filterCardsByCompleteness(cards, "complete", evaluations).length, 1);
assert.equal(filterCardsByCompleteness(cards, "incomplete", evaluations).length, 2, "Incompletas incluye el subconjunto muy incompleto.");
assert.equal(filterCardsByCompleteness(cards, "missing-photo", evaluations).length, 2);
assert.equal(sortCardsByCompleteness(cards, "asc", evaluations)[0].id, "case-d");
assert.equal(sortCardsByCompleteness(cards, "desc", evaluations)[0].id, "case-a");
const summary = buildCompletenessSummary(cards, evaluations);
assert.equal(summary.total, 4);
assert.equal(summary.levels.complete, 1);
assert.equal(summary.levels["almost-complete"], 1);
assert.equal(summary.levels.incomplete, 1);
assert.equal(summary.levels["very-incomplete"], 1);

const read = path => fs.readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [index, app, editor, quickView, analytics, settingsStore, css] = await Promise.all([
  read("index.html"),
  read("assets/js/app.js"),
  read("assets/js/editor.js"),
  read("assets/js/quick-view.js"),
  read("assets/js/analytics-ui.js"),
  read("assets/js/settings-store.js"),
  read("assets/css/card-completeness.css"),
]);
assert.match(index, /id="quality-filter"/);
assert.match(index, /id="cards-sort"/);
assert.match(index, /id="card-quality-summary"/);
assert.match(index, /id="quick-view-completeness"/);
assert.match(index, /id="editor-completeness"/);
assert.match(index, /id="card-quality-analytics"/);
assert.match(app, /filterCardsByCompleteness/);
assert.match(app, /createSortableHeader\("Completitud","completeness"/);
assert.match(editor, /renderEditorCompleteness/);
assert.match(editor, /focusCompletenessTarget/);
assert.match(quickView, /renderQuickViewCompleteness/);
assert.match(analytics, /renderCompletenessAnalytics/);
assert.match(settingsStore, /normalizeCompletenessCriteria/);
assert.match(css, /\.completeness-progress/);
assert.match(css, /prefers-reduced-motion:reduce/);
const storage = await read("assets/js/storage.js");
assert.match(storage, /qualityScore/);
assert.match(storage, /cardHealth/);

console.log("OK: completitud, calidad, niveles, filtros, ordenación e integraciones verificadas.");
