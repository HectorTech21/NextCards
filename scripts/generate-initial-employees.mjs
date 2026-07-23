import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { constants as fsConstants } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import XLSX from "xlsx";

const EMPTY_VALUES = new Set(["", "n/a", "na", "null", "undefined", "-", "--"]);
const REQUIRED_COLUMNS = ["nombre", "apellidos", "cargo", "departamento", "email", "telefono", "linkedin", "ciudad", "foto", "mostrar"];
const VALID_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const OUTPUT_DATA = "assets/data/employees.json";
const OUTPUT_IMAGES = "assets/img/employees";
const REPORT_JSON = "reports/add-remaining-employees-report.json";
const REPORT_MARKDOWN = "reports/add-remaining-employees-report.md";
const PREVIOUS_SEED_VERSION = 2;
const NEXT_SEED_VERSION = 3;

function parseArgs(argv) {
  const result = { excel: "", mode: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--excel") result.excel = argv[++index] ?? "";
    else if (value === "--dry-run") {
      if (result.mode) throw new Error("Usa solo uno de --dry-run o --apply.");
      result.mode = "dry-run";
    } else if (value === "--apply") {
      if (result.mode) throw new Error("Usa solo uno de --dry-run o --apply.");
      result.mode = "apply";
    } else if (value === "--help" || value === "-h") result.help = true;
    else throw new Error(`Argumento no reconocido: ${value}`);
  }
  return result;
}

function cleanText(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).replace(/^\s*["']|["']\s*$/g, "").replace(/\s+/g, " ").trim();
  return EMPTY_VALUES.has(text.toLowerCase()) ? "" : text;
}

function normalizeKey(value) {
  return cleanText(value).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizePerson(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizePhone(value) {
  return cleanText(value).replace(/\D/g, "");
}

function slugify(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

function normalizeUrl(value) {
  const original = cleanText(value);
  if (!original) return { value: "", corrected: false, valid: true };
  let normalized = original;
  if (/^(?:www\.)?linkedin\.com\//i.test(normalized) || /^www\./i.test(normalized)) normalized = `https://${normalized}`;
  try {
    const parsed = new URL(normalized);
    return { value: normalized, corrected: normalized !== original, valid: ["http:", "https:"].includes(parsed.protocol) };
  } catch {
    return { value: normalized, corrected: normalized !== original, valid: false };
  }
}

function isValidEmail(value) {
  return !value || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function stableId(identity) {
  const hex = createHash("sha256").update(`nextcards:${identity}`).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function duplicateGroups(rows, selector) {
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeKey(selector(row));
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()].filter(group => group.length > 1);
}

function isValidRoleVariant(group) {
  const people = new Set(group.map(row => normalizePerson(row.fullName)));
  const roles = group.map(row => normalizeKey(row.cargo));
  return people.size === 1 && roles.every(Boolean) && new Set(roles).size === group.length;
}

function exactSignature(row) {
  return [row.fullName, row.cargo, row.departamento, row.email, normalizePhone(row.telefono), row.linkedin, row.ciudad, row.photoPath]
    .map(normalizeKey)
    .join("|");
}

function uniqueSlug(base, used) {
  const safeBase = base || "empleado";
  let slug = safeBase;
  let suffix = 2;
  while (used.has(slug)) slug = `${safeBase}-${suffix++}`;
  used.add(slug);
  return { slug, adjusted: slug !== safeBase };
}

function rowLabel(row) {
  return `${row.fullName || `Fila ${row.excelRow}`} [fila ${row.excelRow}]`;
}

function groupSummary(groups) {
  return groups.map(group => group.map(row => `${row.fullName} — ${row.cargo || "sin cargo"} [fila ${row.excelRow}]`));
}

async function loadRows(excelPath) {
  const workbook = XLSX.readFile(excelPath, { raw: true, cellText: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("El Excel no contiene ninguna hoja.");
  const sheet = workbook.Sheets[sheetName];
  const values = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  if (!Array.isArray(values) || values.length < 2) throw new Error("El Excel no contiene filas de datos.");
  const headers = values[0].map(value => normalizeKey(value));
  const missingColumns = REQUIRED_COLUMNS.filter(column => !headers.includes(column));
  if (missingColumns.length) throw new Error(`Faltan columnas obligatorias: ${missingColumns.join(", ")}`);
  const rows = values.slice(1).map((valuesRow, index) => {
    const row = { excelRow: index + 2, rawValues: valuesRow };
    headers.forEach((header, columnIndex) => { row[header] = valuesRow[columnIndex]; });
    return row;
  });
  return { rows, sheetName };
}

async function loadSeed(projectRoot) {
  const filePath = path.join(projectRoot, OUTPUT_DATA);
  const parsed = JSON.parse(await fs.readFile(filePath, "utf8"));
  if (!Array.isArray(parsed)) throw new Error(`${OUTPUT_DATA} no contiene una lista válida.`);
  return parsed;
}

async function inspectPhoto(photoPath) {
  if (!photoPath) return { exists: false, missing: false, validExtension: true, extension: "" };
  const extension = path.extname(photoPath).toLowerCase();
  if (!VALID_IMAGE_EXTENSIONS.has(extension)) return { exists: false, missing: false, validExtension: false, extension };
  try {
    const stats = await fs.stat(photoPath);
    if (!stats.isFile()) return { exists: false, missing: true, validExtension: true, extension };
    const metadata = await sharp(photoPath).metadata();
    return {
      exists: true,
      missing: false,
      validExtension: true,
      extension,
      bytes: stats.size,
      width: metadata.width ?? 0,
      height: metadata.height ?? 0,
      orientation: metadata.orientation ?? 1,
    };
  } catch {
    return { exists: false, missing: true, validExtension: true, extension };
  }
}

async function hashFile(filePath) {
  return createHash("sha256").update(await fs.readFile(filePath)).digest("hex");
}

function cleanRows(rawRows) {
  const emptyRows = [];
  const omittedRows = [];
  const cleanedRows = [];

  for (const rawRow of rawRows) {
    if (REQUIRED_COLUMNS.every(column => !cleanText(rawRow[column]))) {
      emptyRows.push(rawRow.excelRow);
      continue;
    }
    const repeatedHeader = REQUIRED_COLUMNS.every(column => normalizeKey(rawRow[column]) === column);
    if (repeatedHeader) {
      omittedRows.push({ row: rawRow.excelRow, reason: "cabecera repetida" });
      continue;
    }
    const row = { excelRow: rawRow.excelRow };
    for (const column of REQUIRED_COLUMNS) row[column] = cleanText(rawRow[column]);
    row.email = row.email.toLowerCase();
    row.fullName = cleanText(`${row.nombre} ${row.apellidos}`);
    row.photoPath = row.foto;
    row.whitespaceChanged = REQUIRED_COLUMNS.some(column => cleanText(rawRow[column]) !== String(rawRow[column] ?? ""));
    const linkedIn = normalizeUrl(row.linkedin);
    row.linkedin = linkedIn.value;
    row.urlCorrected = linkedIn.corrected;
    row.urlValid = linkedIn.valid;
    if (!row.nombre || !row.apellidos) {
      omittedRows.push({ row: row.excelRow, name: row.fullName, reason: "persona incompleta: faltan nombre o apellidos" });
      continue;
    }
    cleanedRows.push(row);
  }
  return { cleanedRows, emptyRows, omittedRows };
}

function deduplicateExactRows(rows) {
  const firstBySignature = new Map();
  const duplicateMap = new Map();
  const uniqueRows = [];
  const omitted = [];
  for (const row of rows) {
    const signature = exactSignature(row);
    const first = firstBySignature.get(signature);
    if (!first) {
      firstBySignature.set(signature, row);
      uniqueRows.push(row);
      continue;
    }
    const key = first.excelRow;
    if (!duplicateMap.has(key)) duplicateMap.set(key, [first]);
    duplicateMap.get(key).push(row);
    omitted.push({ row: row.excelRow, name: row.fullName, reason: `duplicado exacto de la fila ${first.excelRow}` });
  }
  return { uniqueRows, exactDuplicates: [...duplicateMap.values()], omitted };
}

function indexSeed(seed) {
  const indexes = { email: new Map(), id: new Map(), name: new Map(), phone: new Map(), photo: new Map() };
  const add = (map, key, card) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(card);
  };
  for (const card of seed) {
    indexes.id.set(String(card.id), card);
    add(indexes.email, normalizeKey(card.email), card);
    add(indexes.name, normalizePerson(`${card.firstName} ${card.lastName}`), card);
    add(indexes.phone, normalizePhone(card.phone), card);
    add(indexes.photo, normalizeKey(path.basename(card.photo || "")), card);
  }
  return indexes;
}

function narrowCandidates(candidates, row) {
  let narrowed = [...new Map(candidates.map(card => [card.id, card])).values()];
  const sameName = narrowed.filter(card => normalizePerson(`${card.firstName} ${card.lastName}`) === normalizePerson(row.fullName));
  if (sameName.length) narrowed = sameName;
  if (narrowed.length > 1 && row.cargo) {
    const sameRole = narrowed.filter(card => normalizeKey(card.jobTitle) === normalizeKey(row.cargo));
    if (sameRole.length) narrowed = sameRole;
  }
  return narrowed;
}

function matchRows(rows, seed, roleVariantRows) {
  const indexes = indexSeed(seed);
  const claimedIds = new Set();
  const matches = [];
  const newRows = [];
  const ambiguous = [];
  const roleVariantSet = new Set(roleVariantRows.flat());

  for (const row of rows) {
    let candidates = [];
    let strategy = "";
    if (row.email) {
      candidates = narrowCandidates(indexes.email.get(normalizeKey(row.email)) ?? [], row);
      strategy = "email";
    }

    if (!candidates.length) {
      const semanticBase = roleVariantSet.has(row) ? `${slugify(row.fullName)}-${slugify(row.cargo)}` : slugify(row.fullName);
      const candidateId = stableId(`${row.email || row.fullName}|${semanticBase}`);
      const idCandidate = indexes.id.get(candidateId);
      if (idCandidate) {
        candidates = [idCandidate];
        strategy = "id original";
      }
    }

    if (!candidates.length) {
      candidates = narrowCandidates(indexes.name.get(normalizePerson(row.fullName)) ?? [], row);
      strategy = "nombre";
    }

    if (candidates.length > 1) {
      const phoneMatches = row.telefono ? candidates.filter(card => normalizePhone(card.phone) === normalizePhone(row.telefono)) : [];
      if (phoneMatches.length === 1) candidates = phoneMatches;
    }

    if (candidates.length > 1 && row.photoPath) {
      const photoBase = normalizeKey(path.basename(row.photoPath));
      const photoMatches = candidates.filter(card => normalizeKey(path.basename(card.photo || "")) === photoBase);
      if (photoMatches.length === 1) candidates = photoMatches;
    }

    const available = candidates.filter(card => !claimedIds.has(card.id));
    if (available.length === 1) {
      claimedIds.add(available[0].id);
      matches.push({ row, card: available[0], strategy });
    } else if (available.length > 1 || (candidates.length && !available.length)) {
      ambiguous.push({ row, candidates: candidates.map(card => ({ id: card.id, name: `${card.firstName} ${card.lastName}`, role: card.jobTitle })) });
    } else newRows.push(row);
  }
  return { matches, newRows, ambiguous };
}

function compareExisting(match) {
  const { row, card } = match;
  const fields = [
    ["nombre", "firstName", normalizeKey],
    ["apellidos", "lastName", normalizeKey],
    ["cargo", "jobTitle", normalizeKey],
    ["departamento", "department", normalizeKey],
    ["email", "email", normalizeKey],
    ["telefono", "phone", normalizePhone],
    ["linkedin", "linkedin", normalizeKey],
    ["ciudad", "city", normalizeKey],
  ];
  const differences = fields.filter(([excelField, cardField, normalizer]) => normalizer(row[excelField]) !== normalizer(card[cardField])).map(([excelField]) => excelField);
  if (row.photoInfo.exists !== Boolean(card.photo)) differences.push("foto");
  return differences;
}

async function inspectExistingPhotos(seed, projectRoot) {
  const relativePaths = [...new Set(seed.map(card => cleanText(card.photo)).filter(Boolean))];
  const found = [];
  const missing = [];
  for (const relativePath of relativePaths) {
    try {
      const stats = await fs.stat(path.join(projectRoot, relativePath));
      (stats.isFile() ? found : missing).push(relativePath);
    } catch {
      missing.push(relativePath);
    }
  }
  return { found, missing };
}

async function planNewPhotos(rows, projectRoot, existingSeed) {
  const outputDirectory = path.join(projectRoot, OUTPUT_IMAGES);
  const existingNames = new Set();
  const existingHashToPath = new Map();
  let directoryEntries = [];
  try { directoryEntries = await fs.readdir(outputDirectory, { withFileTypes: true }); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  for (const entry of directoryEntries) {
    if (!entry.isFile()) continue;
    const relativePath = `${OUTPUT_IMAGES}/${entry.name}`.replaceAll("\\", "/");
    existingNames.add(entry.name.toLowerCase());
    try { existingHashToPath.set(await hashFile(path.join(outputDirectory, entry.name)), relativePath); } catch {}
  }
  for (const card of existingSeed) {
    if (card.photo) existingNames.add(path.basename(card.photo).toLowerCase());
  }

  const usedNames = new Set(existingNames);
  const sourceToPhoto = new Map();
  const operations = [];
  const reused = [];
  const photoByRow = new Map();

  for (const row of rows) {
    if (!row.photoInfo.exists) {
      photoByRow.set(row, "");
      continue;
    }
    const sourceKey = path.resolve(row.photoPath).toLowerCase();
    if (sourceToPhoto.has(sourceKey)) {
      const relativePath = sourceToPhoto.get(sourceKey);
      photoByRow.set(row, relativePath);
      reused.push({ employee: row.fullName, path: relativePath, reason: "misma fuente" });
      continue;
    }
    const sourceHash = await hashFile(row.photoPath);
    const identicalPath = existingHashToPath.get(sourceHash);
    if (identicalPath) {
      sourceToPhoto.set(sourceKey, identicalPath);
      photoByRow.set(row, identicalPath);
      reused.push({ employee: row.fullName, path: identicalPath, reason: "archivo idéntico" });
      continue;
    }

    const base = slugify(row.fullName) || "empleado";
    let fileName = `${base}${row.photoInfo.extension}`;
    let suffix = 2;
    while (usedNames.has(fileName.toLowerCase())) fileName = `${base}-${suffix++}${row.photoInfo.extension}`;
    usedNames.add(fileName.toLowerCase());
    const relativePath = `${OUTPUT_IMAGES}/${fileName}`.replaceAll("\\", "/");
    sourceToPhoto.set(sourceKey, relativePath);
    photoByRow.set(row, relativePath);
    operations.push({ source: row.photoPath, destination: path.join(projectRoot, relativePath), relativePath, info: row.photoInfo, employee: row.fullName });
  }
  return { photoByRow, operations, reused };
}

function planNewCards(rows, seed, photoPlan, roleVariantGroups) {
  const usedSlugs = new Set(seed.map(card => normalizeKey(card.slug)));
  const usedIds = new Set(seed.map(card => String(card.id)));
  const roleVariantSet = new Set(roleVariantGroups.flat());
  const cards = [];
  const slugAdjustments = [];
  const generatedAt = new Date().toISOString();

  for (const row of rows) {
    const semanticBase = roleVariantSet.has(row) ? `${slugify(row.fullName)}-${slugify(row.cargo)}` : slugify(row.fullName);
    const { slug, adjusted } = uniqueSlug(semanticBase, usedSlugs);
    if (adjusted) slugAdjustments.push({ employee: row.fullName, base: semanticBase, slug });
    let idSalt = 1;
    let id = stableId(`${row.email || normalizePerson(row.fullName)}|${slug}`);
    while (usedIds.has(id)) id = stableId(`${row.email || normalizePerson(row.fullName)}|${slug}|${++idSalt}`);
    usedIds.add(id);
    const photo = photoPlan.photoByRow.get(row) || "";
    cards.push({
      id,
      slug,
      cardName: row.fullName,
      firstName: row.nombre,
      lastName: row.apellidos,
      jobTitle: row.cargo,
      department: row.departamento,
      city: row.ciudad,
      pronouns: "",
      email: row.email,
      phone: row.telefono,
      mobile: "",
      website: "",
      linkedin: row.linkedin,
      location: "",
      customLink: "",
      bio: "",
      photo,
      photoFrame: { x: 50, y: 50, scale: 1 },
      template: "corporate-navy",
      accentColor: "#FA3C0F",
      status: "active",
      language: "es",
      visibleFields: {
        photo: true,
        jobTitle: Boolean(row.cargo),
        department: Boolean(row.departamento),
        phone: Boolean(row.telefono),
        email: Boolean(row.email),
        city: Boolean(row.ciudad),
        bio: false,
        linkedin: Boolean(row.linkedin),
        website: false,
      },
      seedIntroducedVersion: NEXT_SEED_VERSION,
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });
  }
  return { cards, slugAdjustments, generatedAt };
}

async function buildAudit(rawRows, seed, projectRoot, sheetName) {
  const cleaned = cleanRows(rawRows);
  for (const row of cleaned.cleanedRows) row.photoInfo = await inspectPhoto(row.photoPath);
  const deduplicated = deduplicateExactRows(cleaned.cleanedRows);
  const validRows = deduplicated.uniqueRows;
  const repeatedNames = duplicateGroups(validRows, row => row.fullName);
  const roleVariants = repeatedNames.filter(isValidRoleVariant);
  const ambiguousRepeatedNames = repeatedNames.filter(group => !isValidRoleVariant(group));
  const duplicateEmails = duplicateGroups(validRows, row => row.email);
  const invalidDuplicateEmails = duplicateEmails.filter(group => !isValidRoleVariant(group));
  const duplicatePhones = duplicateGroups(validRows, row => normalizePhone(row.telefono));
  const duplicatePhotos = duplicateGroups(validRows, row => row.photoPath);
  const crossPersonPhotoDuplicates = duplicatePhotos.filter(group => new Set(group.map(row => normalizePerson(row.fullName))).size > 1);
  const matching = matchRows(validRows, seed, roleVariants);
  const unmatchedRoleVariants = roleVariants.filter(group => group.some(row => matching.newRows.includes(row) || matching.ambiguous.some(item => item.row === row)));
  const existingPhotos = await inspectExistingPhotos(seed, projectRoot);
  const photoPlan = await planNewPhotos(matching.newRows, projectRoot, seed);
  const cardPlan = planNewCards(matching.newRows, seed, photoPlan, roleVariants);
  const differences = matching.matches.map(match => ({ match, fields: compareExisting(match) })).filter(item => item.fields.length);
  const invalidEmails = validRows.filter(row => !isValidEmail(row.email));
  const invalidUrls = validRows.filter(row => !row.urlValid);
  const invalidPhotos = validRows.filter(row => row.photoPath && !row.photoInfo.validExtension);
  const missingPhotos = validRows.filter(row => !row.photoInfo.exists);
  const blockingErrors = [
    ...invalidEmails.map(row => `Fila ${row.excelRow}: email inválido (${row.fullName}).`),
    ...invalidUrls.map(row => `Fila ${row.excelRow}: URL inválida (${row.fullName}).`),
    ...invalidPhotos.map(row => `Fila ${row.excelRow}: formato de foto no válido (${row.fullName}).`),
    ...crossPersonPhotoDuplicates.map(group => `Una misma foto está asignada a personas distintas: ${group.map(rowLabel).join(" / ")}.`),
    ...invalidDuplicateEmails.map(group => `Email compartido sin una variante de cargo inequívoca: ${group.map(rowLabel).join(" / ")}.`),
    ...ambiguousRepeatedNames.map(group => `Nombre repetido no clasificable con seguridad: ${group.map(rowLabel).join(" / ")}.`),
    ...matching.ambiguous.map(item => `Coincidencia ambigua para ${rowLabel(item.row)}: ${item.candidates.length} tarjetas candidatas.`),
    ...unmatchedRoleVariants.map(group => `Nueva persona con varios cargos pendiente de decisión: ${group.map(rowLabel).join(" / ")}.`),
  ];

  const mostrarSi = validRows.filter(row => normalizeKey(row.mostrar) === "si").length;
  const mostrarNo = validRows.filter(row => normalizeKey(row.mostrar) === "no").length;
  const mostrarVacio = validRows.filter(row => !normalizeKey(row.mostrar)).length;
  const report = {
    reportVersion: 1,
    generatedAt: cardPlan.generatedAt,
    sheet: sheetName,
    summary: {
      excelRows: rawRows.length,
      emptyRows: cleaned.emptyRows.length,
      validPeopleRows: validRows.length,
      mostrarSi,
      mostrarNo,
      mostrarVacio,
      seedCardsBefore: seed.length,
      existingMatches: matching.matches.length,
      newCards: cardPlan.cards.length,
      finalSeedCards: seed.length + cardPlan.cards.length,
      uniquePeople: new Set(validRows.map(row => normalizePerson(row.fullName))).size,
      exactDuplicates: deduplicated.exactDuplicates.length,
      ambiguousMatches: matching.ambiguous.length,
      roleVariantPeople: roleVariants.length,
      photosFound: validRows.filter(row => row.photoInfo.exists).length,
      photosMissing: missingPhotos.length,
      existingPhotoFiles: existingPhotos.found.length,
      newPhotosToCopy: photoPlan.operations.length,
      photosToReuse: photoPlan.reused.length,
      correctedUrls: validRows.filter(row => row.urlCorrected).length,
      differencesNotApplied: differences.length,
      blockingErrors: blockingErrors.length,
    },
    seed: { previousVersion: PREVIOUS_SEED_VERSION, nextVersion: NEXT_SEED_VERSION },
    matches: matching.matches.map(({ row, card, strategy }) => ({ row: row.excelRow, employee: row.fullName, cardId: card.id, strategy, differences: compareExisting({ row, card }) })),
    additions: cardPlan.cards.map((card, index) => ({ row: matching.newRows[index].excelRow, employee: matching.newRows[index].fullName, id: card.id, slug: card.slug, photo: card.photo || "avatar de iniciales" })),
    duplicates: {
      exact: groupSummary(deduplicated.exactDuplicates),
      roleVariants: groupSummary(roleVariants),
      emails: groupSummary(duplicateEmails),
      phones: groupSummary(duplicatePhones),
      photos: groupSummary(duplicatePhotos),
    },
    conflicts: {
      blocking: blockingErrors,
      ambiguousMatches: matching.ambiguous.map(item => ({ row: item.row.excelRow, employee: item.row.fullName, candidates: item.candidates })),
      slugAdjustments: cardPlan.slugAdjustments,
    },
    photos: {
      withoutPhoto: missingPhotos.map(row => ({ row: row.excelRow, employee: row.fullName })),
      alreadyCopied: existingPhotos.found,
      missingFromRepository: existingPhotos.missing,
      toCopy: photoPlan.operations.map(item => ({ employee: item.employee, path: item.relativePath })),
      reused: photoPlan.reused,
    },
    corrections: {
      urls: validRows.filter(row => row.urlCorrected).map(row => ({ row: row.excelRow, employee: row.fullName })),
      whitespace: validRows.filter(row => row.whitespaceChanged).map(row => ({ row: row.excelRow, employee: row.fullName })),
    },
    differencesNotApplied: differences.map(({ match, fields }) => ({ row: match.row.excelRow, employee: match.row.fullName, cardId: match.card.id, fields })),
    omittedRows: [...cleaned.omittedRows, ...deduplicated.omitted],
  };
  return { report, validRows, matching, photoPlan, cardPlan, blockingErrors };
}

function printSummary(audit, mode) {
  const { summary } = audit.report;
  console.log(`\nNextCards — ${mode === "dry-run" ? "DRY RUN" : "APLICACIÓN INCREMENTAL"}`);
  console.log("=".repeat(58));
  console.log(`Filas del Excel: ${summary.excelRows}`);
  console.log(`Personas válidas: ${summary.validPeopleRows}`);
  console.log(`mostrar = SI: ${summary.mostrarSi}`);
  console.log(`mostrar = NO: ${summary.mostrarNo}`);
  console.log(`mostrar vacío: ${summary.mostrarVacio}`);
  console.log(`Tarjetas actuales en el seed: ${summary.seedCardsBefore}`);
  console.log(`Personas ya existentes: ${summary.existingMatches}`);
  console.log(`Nuevas tarjetas: ${summary.newCards}`);
  console.log(`Total final previsto: ${summary.finalSeedCards}`);
  console.log(`Coincidencias por email: ${audit.report.matches.filter(item => item.strategy === "email").length}`);
  console.log(`Coincidencias por ID original: ${audit.report.matches.filter(item => item.strategy === "id original").length}`);
  console.log(`Coincidencias por nombre: ${audit.report.matches.filter(item => item.strategy === "nombre").length}`);
  console.log(`Coincidencias ambiguas: ${summary.ambiguousMatches}`);
  console.log(`Duplicados exactos: ${summary.exactDuplicates}`);
  console.log(`Personas con varios cargos: ${summary.roleVariantPeople}`);
  console.log(`Fotos encontradas: ${summary.photosFound}`);
  console.log(`Personas sin foto: ${summary.photosMissing}`);
  console.log(`Fotos ya copiadas: ${summary.existingPhotoFiles}`);
  console.log(`Nuevas fotos que se copiarían: ${summary.newPhotosToCopy}`);
  console.log(`Fotos que se reutilizarían: ${summary.photosToReuse}`);
  console.log(`URLs corregidas: ${summary.correctedUrls}`);
  console.log(`Diferencias no aplicadas: ${summary.differencesNotApplied}`);
  console.log(`Registros omitidos: ${audit.report.omittedRows.length}`);
  console.log(`Conflictos de slug: ${audit.report.conflicts.slugAdjustments.length}`);
  console.log(`Errores bloqueantes: ${summary.blockingErrors}`);

  console.log("\nNuevas tarjetas:");
  for (const card of audit.report.additions) console.log(`  ${card.employee} → ${card.slug}${card.photo === "avatar de iniciales" ? " (sin foto)" : ""}`);
  console.log("\nDiferencias detectadas en tarjetas existentes (no se aplicarán):");
  if (!audit.report.differencesNotApplied.length) console.log("  ninguna");
  for (const difference of audit.report.differencesNotApplied) console.log(`  ${difference.employee}: ${difference.fields.join(", ")}`);
  if (audit.report.conflicts.blocking.length) {
    console.log("\nConflictos bloqueantes:");
    for (const error of audit.report.conflicts.blocking) console.log(`  ERROR: ${error}`);
  }
  if (mode === "dry-run") console.log("\nDRY RUN: no se ha escrito, copiado, eliminado ni versionado ningún archivo.");
}

async function writePhoto(operation) {
  try {
    await fs.access(operation.destination);
    throw new Error(`El destino ya existe y no se sobrescribirá: ${operation.relativePath}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const needsOptimization = operation.info.width > 800 || operation.info.height > 800 || operation.info.bytes > 500_000 || operation.info.orientation > 1;
  if (!needsOptimization) {
    await fs.copyFile(operation.source, operation.destination, fsConstants.COPYFILE_EXCL);
    return { optimized: false };
  }
  let pipeline = sharp(operation.source).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true });
  if (operation.info.extension === ".jpg" || operation.info.extension === ".jpeg") pipeline = pipeline.jpeg({ quality: 84, mozjpeg: true });
  else if (operation.info.extension === ".png") pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 84 });
  else pipeline = pipeline.webp({ quality: 84 });
  await pipeline.toFile(operation.destination);
  return { optimized: true };
}

function markdownReport(report, applied) {
  const lines = [
    "# Ampliación de empleados de NextCards",
    "",
    `- Estado: ${applied ? "aplicado" : "dry-run"}`,
    `- Filas del Excel: ${report.summary.excelRows}`,
    `- Personas válidas: ${report.summary.validPeopleRows}`,
    `- Tarjetas existentes: ${report.summary.existingMatches}`,
    `- Tarjetas nuevas: ${report.summary.newCards}`,
    `- Total final: ${report.summary.finalSeedCards}`,
    `- Errores bloqueantes: ${report.summary.blockingErrors}`,
    "",
    "## Nuevas tarjetas",
    "",
    ...(report.additions.length ? report.additions.map(item => `- ${item.employee}: \`${item.slug}\` — ${item.photo}`) : ["- Ninguna."]),
    "",
    "## Diferencias no aplicadas",
    "",
    ...(report.differencesNotApplied.length ? report.differencesNotApplied.map(item => `- ${item.employee}: ${item.fields.join(", ")}`) : ["- Ninguna."]),
    "",
    "## Personas sin foto",
    "",
    ...(report.photos.withoutPhoto.length ? report.photos.withoutPhoto.map(item => `- ${item.employee}`) : ["- Ninguna."]),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

async function applyAudit(audit, seed, projectRoot) {
  if (audit.blockingErrors.length) throw new Error("La ampliación se ha detenido porque existen conflictos bloqueantes.");
  const finalSeed = [...seed, ...audit.cardPlan.cards];
  const ids = new Set(finalSeed.map(card => card.id));
  const slugs = new Set(finalSeed.map(card => normalizeKey(card.slug)));
  if (ids.size !== finalSeed.length) throw new Error("La ampliación produciría IDs duplicados.");
  if (slugs.size !== finalSeed.length) throw new Error("La ampliación produciría slugs duplicados.");

  await fs.mkdir(path.join(projectRoot, OUTPUT_IMAGES), { recursive: true });
  let optimized = 0;
  for (const operation of audit.photoPlan.operations) {
    const result = await writePhoto(operation);
    if (result.optimized) optimized += 1;
  }
  if (audit.cardPlan.cards.length) await fs.writeFile(path.join(projectRoot, OUTPUT_DATA), `${JSON.stringify(finalSeed, null, 2)}\n`, "utf8");
  await fs.mkdir(path.join(projectRoot, "reports"), { recursive: true });
  const appliedReport = { ...audit.report, applied: true, appliedAt: new Date().toISOString() };
  await fs.writeFile(path.join(projectRoot, REPORT_JSON), `${JSON.stringify(appliedReport, null, 2)}\n`, "utf8");
  await fs.writeFile(path.join(projectRoot, REPORT_MARKDOWN), markdownReport(appliedReport, true), "utf8");
  return { finalSeed, optimized };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Uso: node scripts/generate-initial-employees.mjs --excel <archivo.xlsx> (--dry-run | --apply)");
    return;
  }
  if (!args.excel) throw new Error("Debes indicar --excel <archivo.xlsx>.");
  if (!args.mode) throw new Error("Debes indicar --dry-run o --apply.");
  const projectRoot = process.cwd();
  const excelPath = path.resolve(args.excel);
  await fs.access(excelPath);
  const seed = await loadSeed(projectRoot);
  const { rows, sheetName } = await loadRows(excelPath);
  const audit = await buildAudit(rows, seed, projectRoot, sheetName);
  printSummary(audit, args.mode);
  if (args.mode === "dry-run") {
    if (audit.blockingErrors.length) process.exitCode = 2;
    return;
  }
  const result = await applyAudit(audit, seed, projectRoot);
  console.log(`\nTarjetas nuevas añadidas: ${audit.cardPlan.cards.length}`);
  console.log(`Tarjetas finales en el seed: ${result.finalSeed.length}`);
  console.log(`Imágenes copiadas: ${audit.photoPlan.operations.length}`);
  console.log(`Imágenes optimizadas: ${result.optimized}`);
  console.log(`Informe JSON: ${REPORT_JSON}`);
  console.log(`Informe Markdown: ${REPORT_MARKDOWN}`);
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
