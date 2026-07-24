import {formatPersonName,settingsService} from "./settings-store.js?v=1.8.0";

function fallbackCopy(value) {
  const input = document.createElement("textarea");
  input.value = value;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.opacity = "0";
  document.body.append(input);
  input.select();
  const copied = document.execCommand("copy");
  input.remove();
  if (!copied) throw new Error("No se pudo copiar el enlace.");
}

export async function copyText(value) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error("El enlace público no está disponible.");
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(normalized);
  else fallbackCopy(normalized);
  return normalized;
}

export function buildCardShareData(card, settingsOverride = null) {
  const settings = settingsOverride?.publicCard ? settingsOverride : settingsService.getSettings();
  const name = formatPersonName(card, settings);
  return {
    title: `Tarjeta de ${name}`,
    text: `Contacta con ${name} de ${settings.publicCard.companyName}.`,
  };
}

export async function shareCard(card, url, settingsOverride = null, {onFallbackCopy = copyText} = {}) {
  const normalized = String(url || "").trim();
  if (!normalized) throw new Error("El enlace público no está disponible.");
  const data = {...buildCardShareData(card, settingsOverride), url: normalized};
  if (navigator.share) {
    try {
      await navigator.share(data);
      return {status: "shared", url: normalized};
    } catch (error) {
      if (error?.name === "AbortError") return {status: "cancelled", url: normalized};
    }
  }
  const copied = await onFallbackCopy(normalized);
  return {status: copied === false ? "cancelled" : "copied", url: normalized};
}
