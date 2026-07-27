/**
 * Motor puro de completitud y calidad de NextCards.
 *
 * Los pesos base suman exactamente 100. Cuando un criterio recomendado se
 * desactiva en Configuración, el resultado se normaliza sobre los criterios
 * habilitados para conservar una escala de 0 a 100.
 */

const text = value => String(value ?? "").trim();
const lower = value => text(value).toLocaleLowerCase("es");
const clamp = value => Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SLUG_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const VALID_STATUSES = new Set(["active", "draft", "disabled"]);
const KNOWN_ACTIONS = new Set(["save", "contact", "phone", "email", "linkedin", "website", "share", "copy"]);

export const DEFAULT_COMPLETENESS_CRITERIA = Object.freeze({
  evaluateRecommended: true,
  includeWebsite: false,
  includeLinkedIn: true,
  includePhone: true,
  completeThreshold: 90,
});

export const CARD_COMPLETENESS_RULES = Object.freeze([
  Object.freeze({field: "fullName", label: "Nombre completo", weight: 14, requirement: "required", target: "firstName", action: "Completar nombre y apellidos"}),
  Object.freeze({field: "jobTitle", label: "Cargo", weight: 11, requirement: "required", target: "jobTitle", action: "Añadir cargo"}),
  Object.freeze({field: "email", label: "Email", weight: 14, requirement: "required", target: "email", action: "Corregir email"}),
  Object.freeze({field: "photo", label: "Fotografía", weight: 13, requirement: "recommended", target: "photo", action: "Añadir fotografía"}),
  Object.freeze({field: "department", label: "Departamento", weight: 8, requirement: "recommended", target: "department", action: "Añadir departamento"}),
  Object.freeze({field: "city", label: "Ciudad", weight: 5, requirement: "recommended", target: "city", action: "Añadir ciudad"}),
  Object.freeze({field: "phone", label: "Teléfono o móvil", weight: 9, requirement: "recommended", target: "phone", action: "Añadir teléfono"}),
  Object.freeze({field: "linkedin", label: "LinkedIn", weight: 9, requirement: "recommended", target: "linkedin", action: "Añadir LinkedIn"}),
  Object.freeze({field: "website", label: "Website", weight: 8, requirement: "recommended", target: "website", action: "Añadir website"}),
  Object.freeze({field: "slug", label: "Slug público", weight: 4, requirement: "required", target: "slug", action: "Revisar slug"}),
  Object.freeze({field: "template", label: "Plantilla", weight: 3, requirement: "required", target: "template", action: "Seleccionar plantilla"}),
  Object.freeze({field: "status", label: "Estado", weight: 2, requirement: "required", target: "status", action: "Revisar estado"}),
]);

export const CARD_COMPLETENESS_TOTAL_WEIGHT = CARD_COMPLETENESS_RULES.reduce((total, rule) => total + rule.weight, 0);

if (CARD_COMPLETENESS_TOTAL_WEIGHT !== 100) {
  throw new Error(`CARD_COMPLETENESS_RULES debe sumar 100; suma actual: ${CARD_COMPLETENESS_TOTAL_WEIGHT}.`);
}

export const COMPLETENESS_LEVELS = Object.freeze({
  complete: Object.freeze({
    key: "complete",
    label: "Completa",
    icon: "check",
    description: "La tarjeta reúne los datos y controles de calidad esperados.",
  }),
  "almost-complete": Object.freeze({
    key: "almost-complete",
    label: "Casi completa",
    icon: "chart",
    description: "Solo faltan uno o dos datos recomendados.",
  }),
  incomplete: Object.freeze({
    key: "incomplete",
    label: "Incompleta",
    icon: "edit",
    description: "Faltan varios datos importantes para completar la tarjeta.",
  }),
  "very-incomplete": Object.freeze({
    key: "very-incomplete",
    label: "Muy incompleta",
    icon: "bell",
    description: "La tarjeta necesita completar una parte importante de sus datos.",
  }),
  "needs-review": Object.freeze({
    key: "needs-review",
    label: "Necesita revisión",
    icon: "bell",
    description: "Existe al menos un error bloqueante que debe corregirse.",
  }),
});

export function normalizeCompletenessCriteria(input = {}) {
  const threshold = Number(input?.completeThreshold);
  return {
    evaluateRecommended: typeof input?.evaluateRecommended === "boolean" ? input.evaluateRecommended : DEFAULT_COMPLETENESS_CRITERIA.evaluateRecommended,
    includeWebsite: typeof input?.includeWebsite === "boolean" ? input.includeWebsite : DEFAULT_COMPLETENESS_CRITERIA.includeWebsite,
    includeLinkedIn: typeof input?.includeLinkedIn === "boolean" ? input.includeLinkedIn : DEFAULT_COMPLETENESS_CRITERIA.includeLinkedIn,
    includePhone: typeof input?.includePhone === "boolean" ? input.includePhone : DEFAULT_COMPLETENESS_CRITERIA.includePhone,
    completeThreshold: Number.isFinite(threshold) ? Math.max(80, Math.min(100, Math.round(threshold))) : DEFAULT_COMPLETENESS_CRITERIA.completeThreshold,
  };
}

function countValues(items, key) {
  const counts = new Map();
  items.forEach(item => {
    const value = lower(item?.[key]);
    if (value) counts.set(value, (counts.get(value) || 0) + 1);
  });
  return counts;
}

function normalizePhotoStatuses(value) {
  if (value instanceof Map) return value;
  if (!value || typeof value !== "object") return new Map();
  return new Map(Object.entries(value));
}

export function createCompletenessContext({
  cards = [],
  templates = [],
  settings = {},
  photoStatuses = new Map(),
  allowGeneratedId = false,
} = {}) {
  const safeCards = Array.isArray(cards) ? cards : [];
  const safeTemplates = Array.isArray(templates) ? templates : [];
  return {
    cards: safeCards,
    templates: safeTemplates,
    idCounts: countValues(safeCards, "id"),
    slugCounts: countValues(safeCards, "slug"),
    templateMap: new Map(safeTemplates.map(template => [text(template?.id), template])),
    criteria: normalizeCompletenessCriteria(settings?.completeness || settings),
    actionOrder: Array.isArray(settings?.cards?.actionOrder) ? settings.cards.actionOrder : [],
    photoStatuses: normalizePhotoStatuses(photoStatuses),
    allowGeneratedId: Boolean(allowGeneratedId),
  };
}

function isRuleEnabled(rule, criteria) {
  if (rule.requirement === "required") return true;
  if (!criteria.evaluateRecommended) return false;
  if (rule.field === "website") return criteria.includeWebsite;
  if (rule.field === "linkedin") return criteria.includeLinkedIn;
  if (rule.field === "phone") return criteria.includePhone;
  return true;
}

function hasFullName(card) {
  return Boolean(text(card?.firstName) && text(card?.lastName));
}

function hasPhone(card) {
  return Boolean(text(card?.phone) || text(card?.mobile));
}

function usablePhone(value) {
  const digits = text(value).replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 18;
}

function parseHttpUrl(value) {
  try {
    const url = new URL(text(value));
    return ["http:", "https:"].includes(url.protocol) ? url : null;
  } catch {
    return null;
  }
}

function validLinkedIn(value) {
  const url = parseHttpUrl(value);
  if (!url || url.protocol !== "https:") return false;
  const hostname = url.hostname.toLowerCase();
  return hostname === "linkedin.com" || hostname.endsWith(".linkedin.com");
}

function validSecureWebsite(value) {
  return parseHttpUrl(value)?.protocol === "https:";
}

function photoStructure(value) {
  const photo = text(value);
  if (!photo) return "missing";
  if (/^indexeddb:[^\s]+$/i.test(photo)) return "pending";
  if (/^data:image\/(?:png|jpeg|jpg|webp);base64,[a-z0-9+/=\s]+$/i.test(photo)) return "pending";
  if (/^blob:/i.test(photo)) return "pending";
  if (/^https?:\/\/[^\s]+$/i.test(photo)) return "pending";
  if (/^(?:\.\/)?(?:assets\/)?[a-z0-9_./ -]+\.(?:jpe?g|png|webp)(?:[?#].*)?$/i.test(photo)) return "pending";
  return "invalid";
}

function rulePresence(rule, card) {
  if (rule.field === "fullName") return hasFullName(card);
  if (rule.field === "phone") return hasPhone(card);
  return Boolean(text(card?.[rule.field]));
}

function makeIssue(rule, overrides = {}) {
  return {
    field: rule.field,
    label: rule.label,
    severity: rule.requirement,
    target: rule.target,
    action: rule.action,
    ...overrides,
  };
}

function ruleQuality(rule, card, context) {
  if (rule.field === "email" && !EMAIL_PATTERN.test(text(card.email))) {
    return {valid: false, issue: makeIssue(rule, {code: "INVALID_EMAIL", severity: "error", blocking: true, message: "El email no tiene un formato válido.", action: "Corregir email"})};
  }
  if (rule.field === "phone") {
    const candidates = [card.phone, card.mobile].filter(value => text(value));
    if (!candidates.some(usablePhone)) return {valid: false, issue: makeIssue(rule, {code: "INVALID_PHONE", severity: "error", blocking: false, message: "El teléfono no contiene suficientes dígitos utilizables.", action: "Corregir teléfono"})};
  }
  if (rule.field === "linkedin" && !validLinkedIn(card.linkedin)) {
    return {valid: false, issue: makeIssue(rule, {code: "INVALID_LINKEDIN", severity: "error", blocking: false, message: "LinkedIn debe ser una URL https del dominio linkedin.com.", action: "Corregir LinkedIn"})};
  }
  if (rule.field === "website" && !validSecureWebsite(card.website)) {
    return {valid: false, issue: makeIssue(rule, {code: "INVALID_WEBSITE", severity: "error", blocking: false, message: "Website debe ser una URL segura que empiece por https://.", action: "Corregir website"})};
  }
  if (rule.field === "slug") {
    if (!SLUG_PATTERN.test(text(card.slug))) return {valid: false, issue: makeIssue(rule, {code: "INVALID_SLUG", severity: "error", blocking: true, message: "El slug solo puede contener letras, números y guiones.", action: "Corregir slug"})};
    if ((context.slugCounts.get(lower(card.slug)) || 0) > 1) return {valid: false, issue: makeIssue(rule, {code: "DUPLICATE_SLUG", severity: "error", blocking: true, message: "El slug está repetido en otra tarjeta.", action: "Crear un slug único"})};
  }
  if (rule.field === "template") {
    const template = context.templateMap.get(text(card.template));
    if (!template) return {valid: false, issue: makeIssue(rule, {code: "MISSING_TEMPLATE", severity: "error", blocking: true, message: "La plantilla asignada no existe.", action: "Seleccionar una plantilla válida"})};
    if (template.status === "archived") return {valid: true, warning: makeIssue(rule, {code: "ARCHIVED_TEMPLATE", severity: "warning", blocking: false, message: "La plantilla existe, pero está archivada.", action: "Revisar plantilla"})};
  }
  if (rule.field === "status" && !VALID_STATUSES.has(text(card.status))) {
    return {valid: false, issue: makeIssue(rule, {code: "INVALID_STATUS", severity: "error", blocking: true, message: "El estado de la tarjeta no está reconocido.", action: "Seleccionar un estado válido"})};
  }
  if (rule.field === "photo") {
    const structural = photoStructure(card.photo);
    const verified = context.photoStatuses.get(text(card.photo));
    if (structural === "invalid") return {valid: false, issue: makeIssue(rule, {code: "INVALID_PHOTO", severity: "error", blocking: false, message: "La referencia de fotografía no es compatible.", action: "Sustituir fotografía"})};
    if (verified === "broken" || verified === false) return {valid: false, issue: makeIssue(rule, {code: "BROKEN_PHOTO", severity: "error", blocking: false, message: "La fotografía no se puede resolver.", action: "Sustituir fotografía"})};
    if (verified !== "valid" && verified !== true) {
      return {valid: true, warning: makeIssue(rule, {code: "PHOTO_PENDING", severity: "warning", blocking: false, message: "Fotografía pendiente de comprobación técnica.", action: "Revisar fotografía"})};
    }
  }
  return {valid: true};
}

function addTechnicalIssues(card, context, result, seenFields) {
  const id = text(card?.id);
  if (!id && !context.allowGeneratedId) {
    result.errors.push({field: "id", label: "ID de tarjeta", code: "MISSING_ID", severity: "error", blocking: true, target: "slug", message: "La tarjeta no tiene un ID único.", action: "Guardar de nuevo la tarjeta"});
  } else if (id && (context.idCounts.get(lower(id)) || 0) > 1) {
    result.errors.push({field: "id", label: "ID de tarjeta", code: "DUPLICATE_ID", severity: "error", blocking: true, target: "slug", message: "El ID está repetido en otra tarjeta.", action: "Regenerar el ID"});
  }

  const visible = card?.visibleFields;
  if (visible != null && (typeof visible !== "object" || Array.isArray(visible))) {
    result.errors.push({field: "visibleFields", label: "Campos visibles", code: "INVALID_VISIBLE_FIELDS", severity: "error", blocking: false, target: "visibleFields", message: "La configuración de campos visibles no es válida.", action: "Revisar campos visibles"});
  } else if (visible && typeof visible === "object") {
    const visibleMap = {photo: "photo", jobTitle: "jobTitle", department: "department", city: "city", email: "email", phone: "phone", linkedin: "linkedin", website: "website", bio: "bio"};
    Object.entries(visibleMap).forEach(([visibleKey, field]) => {
      if (visible[visibleKey] !== true || seenFields.has(field)) return;
      const hasValue = field === "phone" ? hasPhone(card) : Boolean(text(card?.[field]));
      if (!hasValue && card?.[field] == null) {
        result.warnings.push({field, label: visibleKey, code: "NULL_VISIBLE_VALUE", severity: "warning", blocking: false, target: field, message: "Hay un campo visible con valor null o undefined.", action: "Completar u ocultar el campo"});
        seenFields.add(field);
      }
    });
  }

  const configuredActions = context.actionOrder.filter((action, index, list) => KNOWN_ACTIONS.has(action) && list.indexOf(action) === index);
  if (!configuredActions.length) {
    result.errors.push({field: "actions", label: "Acciones", code: "NO_ACTIONS", severity: "error", blocking: false, target: "visibleFields", message: "No hay acciones públicas reconocidas configuradas.", action: "Revisar acciones"});
  }
}

export function getCompletenessLevel(score, issues = [], criteria = DEFAULT_COMPLETENESS_CRITERIA) {
  if (issues.some(issue => issue?.blocking)) return COMPLETENESS_LEVELS["needs-review"];
  const normalized = normalizeCompletenessCriteria(criteria);
  const almostThreshold = Math.max(50, normalized.completeThreshold - 15);
  if (score >= normalized.completeThreshold) return COMPLETENESS_LEVELS.complete;
  if (score >= almostThreshold) return COMPLETENESS_LEVELS["almost-complete"];
  if (score >= 50) return COMPLETENESS_LEVELS.incomplete;
  return COMPLETENESS_LEVELS["very-incomplete"];
}

export function evaluateCardCompleteness(card = {}, inputContext = {}) {
  const context = inputContext?.idCounts && inputContext?.slugCounts
    ? inputContext
    : createCompletenessContext(inputContext);
  const result = {
    score: 0,
    level: "",
    label: "",
    description: "",
    missing: [],
    errors: [],
    warnings: [],
    completed: [],
    blockingIssues: 0,
    earnedWeight: 0,
    availableWeight: 0,
  };
  const seenFields = new Set();

  CARD_COMPLETENESS_RULES.forEach(rule => {
    if (!isRuleEnabled(rule, context.criteria)) return;
    result.availableWeight += rule.weight;
    if (!rulePresence(rule, card)) {
      const fullNameTarget = rule.field === "fullName" && text(card?.firstName) ? "lastName" : rule.target;
      result.missing.push(makeIssue(rule, {
        code: `MISSING_${rule.field.toUpperCase()}`,
        message: `${rule.label} no está completado.`,
        target: fullNameTarget,
      }));
      seenFields.add(rule.field);
      return;
    }
    const quality = ruleQuality(rule, card, context);
    if (!quality.valid) {
      result.errors.push(quality.issue);
      seenFields.add(rule.field);
      return;
    }
    if (quality.warning) result.warnings.push(quality.warning);
    result.earnedWeight += rule.weight;
    result.completed.push(makeIssue(rule, {code: `COMPLETE_${rule.field.toUpperCase()}`, message: `${rule.label} completado.`}));
  });

  addTechnicalIssues(card, context, result, seenFields);
  result.score = clamp(Math.round(result.availableWeight ? result.earnedWeight / result.availableWeight * 100 : 0));
  result.blockingIssues = result.errors.filter(issue => issue.blocking).length;
  const level = getCompletenessLevel(result.score, result.errors, context.criteria);
  result.level = level.key;
  result.label = level.label;
  result.description = level.description;
  return result;
}

export function evaluateCardsCompleteness(cards = [], contextOptions = {}) {
  const context = contextOptions?.idCounts && contextOptions?.slugCounts
    ? contextOptions
    : createCompletenessContext({...contextOptions, cards});
  return new Map(cards.map(card => [card.id, evaluateCardCompleteness(card, context)]));
}

export function filterCardsByCompleteness(cards = [], filter = "all", evaluations = new Map()) {
  if (!filter || filter === "all") return [...cards];
  return cards.filter(card => {
    const result = evaluations.get(card.id);
    if (filter === "missing-photo") return !text(card.photo);
    if (filter === "missing-linkedin") return !text(card.linkedin);
    if (filter === "missing-phone") return !hasPhone(card);
    if (filter === "needs-review") return result?.level === "needs-review";
    if (filter === "incomplete") return ["incomplete", "very-incomplete"].includes(result?.level);
    return result?.level === filter;
  });
}

export function sortCardsByCompleteness(cards = [], direction = "asc", evaluations = new Map()) {
  const multiplier = direction === "desc" ? -1 : 1;
  return [...cards].sort((first, second) => {
    const firstResult = evaluations.get(first.id);
    const secondResult = evaluations.get(second.id);
    const scoreDifference = ((firstResult?.score ?? 0) - (secondResult?.score ?? 0)) * multiplier;
    if (scoreDifference) return scoreDifference;
    const blockingDifference = ((firstResult?.blockingIssues ?? 0) - (secondResult?.blockingIssues ?? 0)) * -multiplier;
    if (blockingDifference) return blockingDifference;
    return lower(`${first.firstName} ${first.lastName}`).localeCompare(lower(`${second.firstName} ${second.lastName}`), "es");
  });
}

export function buildCompletenessSummary(cards = [], evaluations = new Map()) {
  const results = cards.map(card => evaluations.get(card.id)).filter(Boolean);
  const levels = {"complete": 0, "almost-complete": 0, incomplete: 0, "very-incomplete": 0, "needs-review": 0};
  const missing = new Map();
  results.forEach(result => {
    levels[result.level] = (levels[result.level] || 0) + 1;
    result.missing.forEach(issue => {
      const current = missing.get(issue.field) || {field: issue.field, label: issue.label, count: 0};
      current.count += 1;
      missing.set(issue.field, current);
    });
  });
  const total = cards.length;
  const percentage = count => total ? Math.round(count / total * 100) : 0;
  return {
    total,
    average: results.length ? Math.round(results.reduce((sum, result) => sum + result.score, 0) / results.length) : 0,
    levels,
    complete: levels.complete,
    incomplete: total - levels.complete,
    needsReview: levels["needs-review"],
    topMissing: [...missing.values()].sort((first, second) => second.count - first.count || first.label.localeCompare(second.label, "es")),
    withPhoto: percentage(cards.filter(card => text(card.photo)).length),
    withLinkedIn: percentage(cards.filter(card => text(card.linkedin)).length),
    withPhone: percentage(cards.filter(card => hasPhone(card)).length),
  };
}
