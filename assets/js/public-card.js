import {cardService} from "./cards.js";
import {renderCardPreview} from "./preview.js";
import {buildVcard,getPublicCardUrl,getSourcedPublicCardUrl,getVcardFilename} from "./card-export.js";
import {buildQrSvg} from "./qr-code.js";
import {getAccessContext,safeTrackEvent,trackPublicCardView} from "./analytics.js";

const paths={
  copy:"M9 9h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V11a2 2 0 0 1 2-2z M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1",
  "user-plus":"M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M19 8v6 M22 11h-6",
  share:"M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M18 24a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M8.6 13.5l6.8-4 M8.6 16.5l6.8 4",
  link:"M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4l-1.15 1.15 M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20l1.15-1.15",
  lock:"M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4",check:"M20 6 9 17l-5-5"
};
function icon(name){
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","2");svg.setAttribute("stroke-linecap","round");svg.setAttribute("stroke-linejoin","round");svg.setAttribute("aria-hidden","true");
  (paths[name]||paths.link).split(" M").forEach((d,i)=>{const p=document.createElementNS(svg.namespaceURI,"path");p.setAttribute("d",i?`M${d}`:d);svg.append(p)});return svg;
}
document.querySelectorAll("[data-icon]").forEach(slot=>slot.append(icon(slot.dataset.icon)));

function toast(message,type="success"){
  const item=document.createElement("div");item.className=`toast ${type}`;item.append(icon(type==="success"?"check":"link"),document.createTextNode(message));document.querySelector("#toast-region").append(item);setTimeout(()=>item.remove(),3000);
}
const parameter=new URLSearchParams(location.search).get("id");
const card=cardService.get(parameter);
const publicCard=document.querySelector("#public-card"),actions=document.querySelector("#public-actions"),notFound=document.querySelector("#not-found");

if(!card||card.status==="disabled"){
  publicCard.hidden=true;actions.hidden=true;notFound.hidden=false;document.title="Tarjeta no encontrada · NextCards";
}else{
  renderCardPreview(publicCard,card);
  document.title=`${card.firstName} ${card.lastName} · NextCards`;
  const canonical=getPublicCardUrl(card);
  const accessContext=getAccessContext();
  const qrUrl=getSourcedPublicCardUrl(card,"qr");
  const sharedUrl=getSourcedPublicCardUrl(card,"shared_link");
  const copiedUrl=getSourcedPublicCardUrl(card,"copied_link");
  const analyticsContext={...accessContext,card};
  trackPublicCardView(card,accessContext);
  document.querySelector("#public-url").textContent=canonical;
  createQr(qrUrl);
  publicCard.addEventListener("click",event=>{const trigger=event.target.closest("[data-analytics-event]");if(trigger)safeTrackEvent(trigger.dataset.analyticsEvent,analyticsContext)});
  document.querySelector("#save-contact").addEventListener("click",()=>downloadVcard(card,analyticsContext));
  document.querySelector("#share-card").addEventListener("click",()=>share(card,sharedUrl,analyticsContext));
  document.querySelector("#copy-link").addEventListener("click",()=>copy(copiedUrl,{analyticsContext}));
  document.querySelector("#copy-top").addEventListener("click",()=>copy(copiedUrl,{analyticsContext}));
}

async function copy(value,{analyticsContext=null}={}){
  try{await navigator.clipboard.writeText(value);if(analyticsContext)safeTrackEvent("copy_link",analyticsContext);toast("Enlace copiado.")}catch{toast("Mantén pulsado el enlace para copiarlo.","error")}
}

async function share(card,url,analyticsContext){
  safeTrackEvent("share_click",analyticsContext);
  const data={title:`Tarjeta de ${card.firstName} ${card.lastName}`,text:`Contacta con ${card.firstName} ${card.lastName} de Lognext.`,url};
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
    const parsed=new DOMParser().parseFromString(buildQrSvg(url),"image/svg+xml");
    const svg=parsed.documentElement;
    if(svg.localName!=="svg")throw new Error("SVG de QR no válido");
    svg.setAttribute("role","img");svg.setAttribute("aria-label",`Código QR para abrir la tarjeta de ${card.firstName} ${card.lastName}`);
    holder.replaceChildren(document.importNode(svg,true));
  }catch{
    const fallback=document.createElement("span");fallback.textContent="QR no disponible";fallback.style.fontSize=".65rem";fallback.style.textAlign="center";holder.replaceChildren(fallback);
  }
}
