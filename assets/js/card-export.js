function cleanVcard(value = "") {
  return String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

export function getPublicCardUrl(card, baseUrl = location.href) {
  return new URL(`card.html?id=${encodeURIComponent(card.slug)}`, baseUrl).href;
}

export function getSourcedPublicCardUrl(card, source, baseUrl = location.href) {
  const url = new URL(getPublicCardUrl(card, baseUrl));
  const allowedSources = ["qr", "shared_link", "copied_link", "admin_preview", "editor_preview"];
  if (allowedSources.includes(source)) url.searchParams.set("source", source);
  return url.href;
}

export function getVcardFilename(card) {
  return `${card.slug}.vcf`;
}

export function buildVcard(card) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${cleanVcard(card.lastName)};${cleanVcard(card.firstName)};;;`,
    `FN:${cleanVcard(`${card.firstName} ${card.lastName}`)}`,
  ];
  if (card.department) lines.push(`ORG:Lognext;${cleanVcard(card.department)}`);
  else lines.push("ORG:Lognext");
  if (card.jobTitle) lines.push(`TITLE:${cleanVcard(card.jobTitle)}`);
  if (card.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${card.email}`);
  if (card.phone) lines.push(`TEL;TYPE=WORK,VOICE:${card.phone.replace(/[^\d+]/g, "")}`);
  if (card.mobile) lines.push(`TEL;TYPE=CELL:${card.mobile.replace(/[^\d+]/g, "")}`);
  if (card.website) lines.push(`URL:${card.website}`);
  if (card.location || card.city) lines.push(`ADR;TYPE=WORK:;;${cleanVcard(card.location)};${cleanVcard(card.city)};;;España`);
  if (card.linkedin) lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${card.linkedin}`);
  if (card.bio) lines.push(`NOTE:${cleanVcard(card.bio)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}
