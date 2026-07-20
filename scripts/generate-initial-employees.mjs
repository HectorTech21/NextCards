import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createHash } from "node:crypto";
import sharp from "sharp";
import XLSX from "xlsx";

const EMPTY_VALUES = new Set(["", "n/a", "na", "null", "undefined", "-", "--"]);
const REQUIRED_COLUMNS = ["nombre", "apellidos", "cargo", "departamento", "email", "telefono", "linkedin", "ciudad", "foto", "mostrar"];
const REQUIRED_CARD_FIELDS = ["nombre", "apellidos", "cargo", "departamento", "email"];
const VALID_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const OUTPUT_DATA = "assets/data/employees.json";
const OUTPUT_IMAGES = "assets/img/employees";

function parseArgs(argv) {
  const result = { dryRun: false, excel: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--dry-run") result.dryRun = true;
    else if (value === "--excel") result.excel = argv[++index] ?? "";
    else if (value === "--help" || value === "-h") result.help = true;
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

function slugify(value) {
  return normalizeKey(value).replace(/[^a-z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

function isSelected(value) {
  return normalizeKey(value) === "si";
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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
  const people = new Set(group.map(row => normalizeKey(row.fullName)));
  const roles = group.map(row => normalizeKey(row.cargo));
  return people.size === 1 && roles.every(Boolean) && new Set(roles).size === group.length;
}

function isExactDuplicateGroup(group) {
  const signatures = new Set(group.map(row => [row.fullName, row.cargo, row.email, row.telefono, row.photoPath].map(normalizeKey).join("|")));
  return signatures.size < group.length;
}

function uniqueSlug(base, used) {
  let slug = base || "empleado";
  let suffix = 2;
  while (used.has(slug)) slug = `${base}-${suffix++}`;
  used.add(slug);
  return slug;
}

function uniqueImageName(fullName, extension, used) {
  const base = slugify(fullName) || "empleado";
  let name = `${base}${extension}`;
  let suffix = 2;
  while (used.has(name.toLowerCase())) name = `${base}-${suffix++}${extension}`;
  used.add(name.toLowerCase());
  return name;
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
    const row = { excelRow: index + 2 };
    headers.forEach((header, columnIndex) => { row[header] = valuesRow[columnIndex]; });
    return row;
  });
  return { rows, headers };
}

async function inspectPhoto(photoPath) {
  if (!photoPath) return { exists: false, missing: false, validExtension: true };
  const extension = path.extname(photoPath).toLowerCase();
  if (!VALID_IMAGE_EXTENSIONS.has(extension)) return { exists: false, missing: false, validExtension: false, extension };
  try {
    const stats = await fs.stat(photoPath);
    if (!stats.isFile()) return { exists: false, missing: true, validExtension: true, extension };
    const metadata = await sharp(photoPath).metadata();
    return { exists: true, missing: false, validExtension: true, extension, bytes: stats.size, width: metadata.width ?? 0, height: metadata.height ?? 0, orientation: metadata.orientation ?? 1 };
  } catch {
    return { exists: false, missing: true, validExtension: true, extension };
  }
}

async function auditRows(rawRows) {
  const emptyRows = rawRows.filter(row => REQUIRED_COLUMNS.every(column => !cleanText(row[column])));
  const selectedRows = rawRows.filter(row => isSelected(row.mostrar)).map(row => {
    const cleaned = { excelRow: row.excelRow };
    for (const column of REQUIRED_COLUMNS) cleaned[column] = cleanText(row[column]);
    cleaned.email = cleaned.email.toLowerCase();
    const linkedIn = normalizeUrl(cleaned.linkedin);
    cleaned.linkedin = linkedIn.value;
    cleaned.urlCorrected = linkedIn.corrected;
    cleaned.urlValid = linkedIn.valid;
    cleaned.fullName = cleanText(`${cleaned.nombre} ${cleaned.apellidos}`);
    cleaned.photoPath = cleaned.foto;
    cleaned.whitespaceChanged = REQUIRED_COLUMNS.some(column => cleanText(row[column]) !== String(row[column] ?? ""));
    return cleaned;
  });

  for (const row of selectedRows) row.photoInfo = await inspectPhoto(row.photoPath);

  const repeatedNames = duplicateGroups(selectedRows, row => row.fullName);
  const validRoleVariants = repeatedNames.filter(isValidRoleVariant);
  const realDuplicateNames = repeatedNames.filter(group => !isValidRoleVariant(group) && isExactDuplicateGroup(group));
  const ambiguousRepeatedNames = repeatedNames.filter(group => !isValidRoleVariant(group) && !isExactDuplicateGroup(group));
  const variantRows = new Set(validRoleVariants.flat());
  for (const row of selectedRows) {
    const base = slugify(row.fullName);
    row.proposedSlug = variantRows.has(row) ? `${base}-${slugify(row.cargo)}` : base;
  }
  const duplicateEmails = duplicateGroups(selectedRows, row => row.email).filter(group => !isValidRoleVariant(group));
  const duplicateNames = realDuplicateNames;
  const duplicatePhones = duplicateGroups(selectedRows, row => row.telefono).filter(group => !isValidRoleVariant(group));
  const duplicatePhotos = duplicateGroups(selectedRows, row => row.photoPath).filter(group => !isValidRoleVariant(group));
  const provisionalSlugs = duplicateGroups(selectedRows, row => row.proposedSlug);
  const missingRequired = selectedRows.flatMap(row => REQUIRED_CARD_FIELDS.filter(field => !row[field]).map(field => ({ row: row.excelRow, employee: row.fullName || `Fila ${row.excelRow}`, field })));
  const invalidEmails = selectedRows.filter(row => row.email && !isValidEmail(row.email));
  const invalidUrls = selectedRows.filter(row => !row.urlValid);
  const invalidPhotos = selectedRows.filter(row => row.photoPath && !row.photoInfo.validExtension);
  const missingPhotos = selectedRows.filter(row => row.photoInfo.missing);
  const withoutPhotos = selectedRows.filter(row => !row.photoPath || !row.photoInfo.exists);
  const crossPersonPhotoDuplicates = duplicatePhotos.filter(group => new Set(group.map(row => normalizeKey(row.fullName))).size > 1);
  const blockingErrors = [
    ...missingRequired.map(item => `Fila ${item.row}: falta ${item.field} (${item.employee}).`),
    ...invalidEmails.map(row => `Fila ${row.excelRow}: email inválido (${row.fullName}).`),
    ...invalidUrls.map(row => `Fila ${row.excelRow}: URL inválida (${row.fullName}).`),
    ...invalidPhotos.map(row => `Fila ${row.excelRow}: formato de foto no válido (${row.fullName}).`),
    ...crossPersonPhotoDuplicates.map(group => `Una misma foto está asignada a personas distintas: ${group.map(row => `${row.fullName} [fila ${row.excelRow}]`).join(", ")}.`),
    ...realDuplicateNames.map(group => `Duplicado real (misma persona, cargo y datos principales): ${group.map(row => `${row.fullName} — ${row.cargo} [fila ${row.excelRow}]`).join(" / ")}.`),
    ...ambiguousRepeatedNames.map(group => `Filas repetidas no clasificables con seguridad: ${group.map(row => `${row.fullName} — ${row.cargo} [fila ${row.excelRow}]`).join(" / ")}.`),
  ];

  return { rawRows, selectedRows, emptyRows, duplicateEmails, duplicateNames, duplicatePhones, duplicatePhotos, provisionalSlugs, validRoleVariants, ambiguousRepeatedNames, missingRequired, invalidEmails, invalidUrls, invalidPhotos, missingPhotos, withoutPhotos, crossPersonPhotoDuplicates, blockingErrors };
}

function describeGroups(groups) {
  return groups.length ? groups.map(group => group.map(row => `${row.fullName} [fila ${row.excelRow}]`).join(" | ")).join("\n    ") : "ninguno";
}

function printSummary(audit, dryRun) {
  const { selectedRows } = audit;
  console.log(`\nNextCards — ${dryRun ? "DRY RUN" : "GENERACIÓN"}`);
  console.log("=".repeat(48));
  console.log(`Filas de datos: ${audit.rawRows.length}`);
  console.log(`Filas vacías: ${audit.emptyRows.length}`);
  console.log(`Filas con mostrar = SI: ${selectedRows.length}`);
  console.log(`Tarjetas que se crearían: ${selectedRows.length}`);
  console.log(`Personas únicas: ${new Set(selectedRows.map(row => normalizeKey(row.fullName))).size}`);
  console.log(`Personas con varias tarjetas: ${audit.validRoleVariants.length}`);
  console.log(`Fotos encontradas: ${selectedRows.filter(row => row.photoInfo.exists).length}`);
  console.log(`Fotos no encontradas: ${audit.missingPhotos.length}`);
  console.log(`Empleados sin foto utilizable: ${audit.withoutPhotos.length}`);
  console.log(`URLs corregidas: ${selectedRows.filter(row => row.urlCorrected).length}`);
  console.log(`Filas con espacios normalizados: ${selectedRows.filter(row => row.whitespaceChanged).length}`);
  console.log(`Emails duplicados: ${audit.duplicateEmails.length}\n    ${describeGroups(audit.duplicateEmails)}`);
  console.log(`Nombres duplicados: ${audit.duplicateNames.length}\n    ${describeGroups(audit.duplicateNames)}`);
  console.log(`Teléfonos duplicados: ${audit.duplicatePhones.length}\n    ${describeGroups(audit.duplicatePhones)}`);
  console.log(`Fotografías duplicadas: ${audit.duplicatePhotos.length}\n    ${describeGroups(audit.duplicatePhotos)}`);
  console.log(`Slugs provisionales duplicados: ${audit.provisionalSlugs.length}\n    ${describeGroups(audit.provisionalSlugs)}`);
  console.log(`Variantes válidas por cargo: ${audit.validRoleVariants.length}\n    ${describeGroups(audit.validRoleVariants)}`);
  console.log(`Errores bloqueantes: ${audit.blockingErrors.length}`);
  for (const error of audit.blockingErrors) console.log(`  ERROR: ${error}`);
  for (const row of audit.missingPhotos) console.log(`  AVISO: foto no encontrada para ${row.fullName} [fila ${row.excelRow}].`);
  console.log(`Archivo de datos: ${OUTPUT_DATA}`);
  console.log(`Carpeta de imágenes: ${OUTPUT_IMAGES}`);
  if (dryRun) {
    console.log("\nArchivos que se copiarían:");
    for (const row of selectedRows) console.log(`  ${row.fullName}: ${row.photoInfo.exists ? path.basename(row.photoPath) : "avatar de iniciales"}`);
    console.log("\nDRY RUN: no se ha escrito, copiado ni eliminado ningún archivo.");
  }
}

async function writePhoto(source, destination, info) {
  const needsOptimization = info.width > 800 || info.height > 800 || info.bytes > 1024 * 1024 || info.orientation > 1;
  if (!needsOptimization) {
    await fs.copyFile(source, destination);
    return { optimized: false };
  }
  let pipeline = sharp(source).rotate().resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true });
  if (info.extension === ".jpg" || info.extension === ".jpeg") pipeline = pipeline.jpeg({ quality: 84, mozjpeg: true });
  else if (info.extension === ".png") pipeline = pipeline.png({ compressionLevel: 9 });
  else pipeline = pipeline.webp({ quality: 84 });
  await pipeline.toFile(destination);
  return { optimized: true };
}

async function generate(audit, projectRoot) {
  if (audit.blockingErrors.length) throw new Error("La generación se ha detenido porque existen errores bloqueantes.");
  const usedSlugs = new Set();
  const usedImages = new Set();
  const photoBySource = new Map();
  const nameCounts = new Map();
  for (const row of audit.selectedRows) {
    const key = normalizeKey(row.fullName);
    nameCounts.set(key, (nameCounts.get(key) ?? 0) + 1);
  }
  const generatedAt = new Date().toISOString();
  const employees = [];
  const operations = [];

  for (const row of audit.selectedRows) {
    const hasMultipleCards = (nameCounts.get(normalizeKey(row.fullName)) ?? 0) > 1;
    const semanticBase = hasMultipleCards ? `${slugify(row.fullName)}-${slugify(row.cargo)}` : slugify(row.fullName);
    const slug = uniqueSlug(semanticBase, usedSlugs);
    let photo = "";
    if (row.photoInfo.exists) {
      const sourceKey = path.resolve(row.photoPath).toLowerCase();
      if (photoBySource.has(sourceKey)) photo = photoBySource.get(sourceKey);
      else {
        const imageName = uniqueImageName(row.fullName, row.photoInfo.extension, usedImages);
        photo = `${OUTPUT_IMAGES}/${imageName}`.replaceAll("\\", "/");
        photoBySource.set(sourceKey, photo);
        operations.push({ source: row.photoPath, destination: path.join(projectRoot, photo), info: row.photoInfo, employee: row.fullName });
      }
    }
    employees.push({
      id: stableId(`${row.email || row.fullName}|${slug}`),
      slug,
      cardName: hasMultipleCards ? `${row.fullName} — ${row.cargo}` : row.fullName,
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
      template: "corporate-navy",
      accentColor: "#FA3C0F",
      status: "active",
      language: "es",
      visibleFields: { phone: Boolean(row.telefono), email: Boolean(row.email), city: Boolean(row.ciudad), bio: false, linkedin: Boolean(row.linkedin), website: false },
      createdAt: generatedAt,
      updatedAt: generatedAt,
    });
  }

  await fs.mkdir(path.join(projectRoot, OUTPUT_IMAGES), { recursive: true });
  await fs.mkdir(path.join(projectRoot, path.dirname(OUTPUT_DATA)), { recursive: true });
  let optimized = 0;
  for (const operation of operations) {
    const result = await writePhoto(operation.source, operation.destination, operation.info);
    if (result.optimized) optimized += 1;
  }
  await fs.writeFile(path.join(projectRoot, OUTPUT_DATA), `${JSON.stringify(employees, null, 2)}\n`, "utf8");
  return { employees, operations, optimized };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log("Uso: node scripts/generate-initial-employees.mjs --excel <archivo.xlsx> [--dry-run]");
    return;
  }
  if (!args.excel) throw new Error("Debes indicar --excel <archivo.xlsx>.");
  const excelPath = path.resolve(args.excel);
  await fs.access(excelPath);
  const { rows } = await loadRows(excelPath);
  const audit = await auditRows(rows);
  printSummary(audit, args.dryRun);
  if (args.dryRun) {
    if (audit.blockingErrors.length) process.exitCode = 2;
    return;
  }
  const result = await generate(audit, process.cwd());
  console.log(`\nTarjetas generadas: ${result.employees.length}`);
  console.log(`Imágenes copiadas: ${result.operations.length}`);
  console.log(`Imágenes optimizadas: ${result.optimized}`);
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exitCode = 1;
});
