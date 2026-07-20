import {cardService} from "./cards.js";
import {renderCardPreview} from "./preview.js";
import {buildVcard,getPublicCardUrl,getSourcedPublicCardUrl,getVcardFilename} from "./card-export.js";
import {buildQrSvg} from "./qr-code.js";
import {getAccessContext,safeTrackEvent,trackPublicCardView} from "./analytics.js";
import {applySettingsToDocument,formatPersonName,settingsService} from "./settings-store.js";

const paths={
  copy:"M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1",
  "user-plus":"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8v6 M22 11h-6",
  share:"M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M18 24a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M8.6 13.5l6.8-4 M8.6 16.5l6.8 4",
  link:"M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15 M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15",
  lock:"M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",check:"M20 6 9 17l-5-5",
  phone:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.68 2.8a2 2 0 0 1-.45 2.11L8.07 9.1a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.32 1.84.55 2.8.68A2 2 0 0 1 22 16.92z",
  mail:"M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  web:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10",
  linkedin:"M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z M2 9h4v12H2z M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
};
function icon(name){
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","2");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
  (paths[name]||paths.link).split(" M").forEach((d,i)=>{const p=document.createElementNS(svg.namespaceURI,"path");p.setAttribute("d",i?`M${d}`:d);svg.append(p)});return svg;
}
document.querySelectorAll("[data-icon]").forEach(slot=>slot.append(icon(slot.dataset.icon)));
const settings=settingsService.getSettings();
applySettingsToDocument(settings);

function toast(message,type="success"){
  const item=document.createElement("div");item.className=`toast ${type}`;item.append(icon(type==="success"?"check":"link"),document.createTextNode(message));document.querySelector("#toast-region").append(item);setTimeout(()=>item.remove(),3000);
}
const parameter=new URLSearchParams(location.search).get("id");
const card=cardService.get(parameter);
const publicCard=document.querySelector("#public-card"),actions=document.querySelector("#public-actions"),notFound=document.querySelector("#not-found");

if(!card||card.status==="disabled"){
  publicCard.hidden=true;actions.hidden=true;notFound.hidden=false;document.title=`Tarjeta no encontrada · ${settings.general.appName}`;
}else{
  renderCardPreview(publicCard,card);
  const displayName=formatPersonName(card,settings);
  const titleBrand=settings.publicCard.titleSource==="company"?settings.publicCard.companyName:settings.general.appName;
  document.title=`${displayName} | ${titleBrand}`;
  const canonical=getPublicCardUrl(card);
  const accessContext=getAccessContext();
  const qrUrl=getSourcedPublicCardUrl(card,"qr");
  const sharedUrl=getSourcedPublicCardUrl(card,"shared_link");
  const copiedUrl=getSourcedPublicCardUrl(card,"copied_link");
  const analyticsContext={...accessContext,card};
  configureMetadata(card,canonical,displayName);
  configurePublicActions(card);
  configurePublicFooter();
  trackPublicCardView(card,accessContext);
  document.querySelector("#public-url").textContent=canonical;
  if(settings.publicCard.buttons.showQr)createQr(qrUrl);else document.querySelector("#public-qr-panel").hidden=true;
  document.querySelector("#copy-link").hidden=!settings.publicCard.buttons.copyLink;
  document.querySelector("#copy-top").hidden=!settings.publicCard.buttons.copyLink;
  document.querySelector("#public-privacy-note").hidden=!settings.privacy.showPersonalDataNotice;
  publicCard.addEventListener("click",event=>{const trigger=event.target.closest("[data-analytics-event]");if(trigger)safeTrackEvent(trigger.dataset.analyticsEvent,analyticsContext)});
  document.querySelector("#save-contact").addEventListener("click",()=>downloadVcard(card,analyticsContext));
  document.querySelector("#share-card").addEventListener("click",()=>share(card,sharedUrl,analyticsContext));
  document.querySelector("#copy-link").addEventListener("click",()=>copy(copiedUrl,{analyticsContext}));
  document.querySelector("#copy-top").addEventListener("click",()=>copy(copiedUrl,{analyticsContext}));
  actions.addEventListener("click",event=>{const trigger=event.target.closest("[data-analytics-event]");if(trigger)safeTrackEvent(trigger.dataset.analyticsEvent,analyticsContext)});
}

function configureMetadata(card,canonical,displayName){
  const description=[card.jobTitle,settings.publicCard.companyName].filter(Boolean).join(" · ");
  document.querySelector('meta[name="description"]').content=`Tarjeta digital de ${displayName}${description?` · ${description}`:""}.`;
  document.querySelector('meta[property="og:title"]').content=`${displayName} | ${settings.publicCard.companyName}`;
  document.querySelector('meta[property="og:description"]').content=description||settings.publicCard.tagline;
  document.querySelector('meta[property="og:url"]').content=canonical;
  const image=document.querySelector('meta[property="og:image"]');
  image.content=card.photo?new URL(card.photo,location.href).href:"";
}

function configurePublicActions(card){
  const definitions={
    save:{element:document.querySelector("#save-contact"),visible:settings.publicCard.buttons.saveContact},
    phone:{element:document.querySelector("#call-card"),visible:Boolean(card.phone&&card.visibleFields?.phone!==false),href:`tel:${String(card.phone||"").replace(/[^\d+]/g,"")}`,event:"phone_click"},
    email:{element:document.querySelector("#email-card"),visible:Boolean(card.email&&card.visibleFields?.email!==false),href:`mailto:${card.email||""}`,event:"email_click"},
    linkedin:{element:document.querySelector("#linkedin-card"),visible:Boolean(card.linkedin&&card.visibleFields?.linkedin!==false),href:card.linkedin,event:"linkedin_click"},
    website:{element:document.querySelector("#website-card"),visible:Boolean(card.website&&card.visibleFields?.website!==false),href:card.website,event:"website_click"},
    share:{element:document.querySelector("#share-card"),visible:settings.publicCard.buttons.share},
  };
  const holder=document.querySelector("#public-primary-actions");
  settings.cards.actionOrder.forEach(id=>{const item=definitions[id];if(!item)return;item.element.hidden=!item.visible;if(item.href)item.element.href=item.href;if(item.event)item.element.dataset.analyticsEvent=item.event;holder.append(item.element)});
}

function configurePublicFooter(){
  const footer=document.querySelector("#public-footer"),link=document.querySelector("#public-company-link"),logo=document.querySelector("#public-company-logo"),name=document.querySelector("#public-company-name"),powered=document.querySelector("#public-powered");
  logo.hidden=!settings.publicCard.showCompanyLogo;name.textContent=settings.publicCard.companyName;link.href=settings.publicCard.companyUrl;link.hidden=!settings.publicCard.showCompanyLink&&!settings.publicCard.showCompanyLogo;
  if(!settings.publicCard.showCompanyLink)link.removeAttribute("href");powered.hidden=!settings.publicCard.showPoweredBy;
  footer.hidden=link.hidden&&powered.hidden;
}

async function copy(value,{analyticsContext=null}={}){
  if(settings.privacy.confirmBeforeCopy&&!confirm("¿Copiar el enlace público de esta tarjeta?"))return;
  try{await navigator.clipboard.writeText(value);if(analyticsContext)safeTrackEvent("copy_link",analyticsContext);toast("Enlace copiado.")}catch{toast("Mantén pulsado el enlace para copiarlo.","error")}
}

async function share(card,url,analyticsContext){
  safeTrackEvent("share_click",analyticsContext);
  const name=formatPersonName(card,settings);const data={title:`Tarjeta de ${name}`,text:`Contacta con ${name} de ${settings.publicCard.companyName}.`,url};
  if(navigator.share){try{await navigator.share(data)}catch(error){if(error.name!=="AbortError")copy(url)}}
  else copy(url);
}

function downloadVcard(card,analyticsContext){
  safeTrackEvent("vcard_download",analyticsContext);
  const blob=new Blob([buildVcard(card)],{type:"text/vcard;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=getVcardFilename(card);document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);toast("Contacto descargado.");
}

function createQr(url){
  const holder=document.querySelector("#qr-code");
  try{
    const parsed=new DOMParser().parseFromString(buildQrSvg(url,globalThis.qrcode,settings.cards.qr),"image/svg+xml");
    const svg=parsed.documentElement;
    if(svg.localName!=="svg")throw new Error("SVG de QR no válido");
    svg.setAttribute("role","img");svg.setAttribute("aria-label",`Código QR para abrir la tarjeta de ${formatPersonName(card,settings)}`);
    holder.dataset.size=settings.cards.qr.size;holder.replaceChildren(document.importNode(svg,true));
  }catch{
    const fallback=document.createElement("span");fallback.textContent="QR no disponible";fallback.style.fontSize=".65rem";fallback.style.textAlign="center";holder.replaceChildren(fallback);
  }
}
