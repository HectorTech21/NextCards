import {cardService} from "./cards.js?v=1.7.0";
import {renderCardPreview} from "./preview.js?v=1.7.0";
import {buildVcard,getPublicCardUrl,getSourcedPublicCardUrl,getVcardFilename} from "./card-export.js";
import {copyText,shareCard} from "./card-sharing.js?v=1.3.1";
import {renderQr} from "./qr-code.js?v=1.3.1";
import {getAccessContext,safeTrackEvent,trackPublicCardView} from "./analytics.js";
import {applySettingsToDocument,formatPersonName,settingsService} from "./settings-store.js?v=1.6.0";
import {createActionIcon,renderActionGrid,setActionFeedback} from "./card-actions.js?v=1.2.0";
import {isIndexedDbPhoto} from "./photo-storage.js?v=1.6.0";

document.querySelectorAll("[data-icon]").forEach(slot=>slot.append(createActionIcon(slot.dataset.icon)));
const settings=settingsService.getSettings();
applySettingsToDocument(settings);

function toast(message,type="success"){
  const item=document.createElement("div");item.className=`toast ${type}`;item.setAttribute("role",type==="error"?"alert":"status");item.append(createActionIcon(type==="success"?"check":"link"),document.createTextNode(message));document.querySelector("#toast-region").append(item);setTimeout(()=>item.remove(),3000);
}
const parameter=new URLSearchParams(location.search).get("id");
const card=cardService.get(parameter);
const publicCard=document.querySelector("#public-card"),actions=document.querySelector("#public-actions"),notFound=document.querySelector("#not-found");

if(!card||card.status==="disabled"){
  publicCard.hidden=true;actions.hidden=true;notFound.hidden=false;document.title=`Tarjeta no encontrada · ${settings.general.appName}`;
}else{
  renderCardPreview(publicCard,card,null,null,{interactive:true});
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
  configurePublicActions(card,{analyticsContext,sharedUrl,copiedUrl});
  configurePublicFooter();
  trackPublicCardView(card,accessContext);
  document.querySelector("#public-url").textContent=canonical;
  if(settings.publicCard.buttons.showQr)createQr(qrUrl);else document.querySelector("#public-qr-panel").hidden=true;
  document.querySelector("#copy-top").hidden=!settings.publicCard.buttons.copyLink;
  document.querySelector("#public-privacy-note").hidden=!settings.privacy.showPersonalDataNotice;
  publicCard.addEventListener("click",event=>{const trigger=event.target.closest("[data-analytics-event]");if(trigger)safeTrackEvent(trigger.dataset.analyticsEvent,analyticsContext)});
  document.querySelector("#copy-top").addEventListener("click",()=>copy(copiedUrl,{analyticsContext}));
  actions.addEventListener("click",event=>{const trigger=event.target.closest("[data-analytics-event]");if(trigger)safeTrackEvent(trigger.dataset.analyticsEvent,analyticsContext)});
}

function configureMetadata(card,canonical,displayName){
  const description=[card.jobTitle,settings.publicCard.companyName].filter(Boolean).join(" · ");
  const title=`${displayName} | ${settings.publicCard.companyName}`;
  const fullDescription=`Tarjeta digital de ${displayName}${description?` · ${description}`:""}.`;
  const imageUrl=card.photo&&!isIndexedDbPhoto(card)&&!String(card.photo).startsWith("blob:")?new URL(card.photo,location.href).href:"";
  document.querySelector('meta[name="description"]').content=fullDescription;
  document.querySelector('meta[property="og:title"]').content=title;
  document.querySelector('meta[property="og:description"]').content=description||settings.publicCard.tagline;
  document.querySelector('meta[property="og:site_name"]').content=settings.general.appName;
  document.querySelector('meta[property="og:url"]').content=canonical;
  document.querySelector('meta[property="og:image"]').content=imageUrl;
  document.querySelector('meta[property="og:image:alt"]').content=imageUrl?`Foto de ${displayName}`:"";
  document.querySelector('meta[property="profile:first_name"]').content=card.firstName||"";
  document.querySelector('meta[property="profile:last_name"]').content=card.lastName||"";
  document.querySelector('meta[name="twitter:card"]').content=imageUrl?"summary_large_image":"summary";
  document.querySelector('meta[name="twitter:title"]').content=title;
  document.querySelector('meta[name="twitter:description"]').content=description||settings.publicCard.tagline;
  document.querySelector('meta[name="twitter:image"]').content=imageUrl;
  const localHosts=new Set(["localhost","127.0.0.1","::1"]),isLocal=localHosts.has(location.hostname);
  const canonicalLink=document.querySelector('link[rel="canonical"]'),robots=document.querySelector('meta[name="robots"]');
  if(isLocal){canonicalLink.removeAttribute("href");robots.content="noindex,nofollow"}
  else{canonicalLink.href=canonical;robots.content="index,follow,max-image-preview:large"}
}

function configurePublicActions(card,{analyticsContext,sharedUrl,copiedUrl}){
  const definitions={
    save:{type:"contact",id:"save-contact",label:"Guardar contacto",ariaLabel:"Descargar y guardar el contacto",visible:settings.publicCard.buttons.saveContact,onClick:()=>downloadVcard(card,analyticsContext)},
    phone:{type:"phone",id:"call-card",label:"Teléfono",ariaLabel:`Llamar a ${card.phone||"este contacto"}`,visible:Boolean(card.phone&&card.visibleFields?.phone!==false),href:`tel:${String(card.phone||"").replace(/[^\d+]/g,"")}`,eventType:"phone_click"},
    email:{type:"email",id:"email-card",label:"Email",ariaLabel:`Enviar un email a ${card.email||"este contacto"}`,visible:Boolean(card.email&&card.visibleFields?.email!==false),href:`mailto:${card.email||""}`,eventType:"email_click"},
    linkedin:{type:"linkedin",id:"linkedin-card",label:"LinkedIn",ariaLabel:`Abrir el perfil de LinkedIn de ${formatPersonName(card,settings)}`,visible:Boolean(card.linkedin&&card.visibleFields?.linkedin!==false),href:card.linkedin,target:"_blank",eventType:"linkedin_click"},
    website:{type:"website",id:"website-card",label:"Website",ariaLabel:"Abrir el sitio web de Lognext",visible:Boolean(card.website&&card.visibleFields?.website!==false),href:card.website,target:"_blank",eventType:"website_click"},
    share:{type:"share",id:"share-card",label:"Compartir",ariaLabel:"Compartir esta tarjeta",visible:settings.publicCard.buttons.share,onClick:()=>share(card,sharedUrl,analyticsContext)},
  };
  const holder=document.querySelector("#public-primary-actions");
  const ordered=settings.cards.actionOrder.map(id=>definitions[id]).filter(Boolean);
  if(settings.publicCard.buttons.copyLink)ordered.push({type:"copy",id:"copy-link",label:"Copiar enlace",ariaLabel:"Copiar el enlace público de esta tarjeta",onClick:async(_event,element)=>{if(await copy(copiedUrl,{analyticsContext}))setActionFeedback(element,"Copiado")}});
  return renderActionGrid(holder,ordered,{tone:"light",interactive:true});
}

function configurePublicFooter(){
  const footer=document.querySelector("#public-footer"),link=document.querySelector("#public-company-link"),logo=document.querySelector("#public-company-logo"),name=document.querySelector("#public-company-name"),powered=document.querySelector("#public-powered");
  logo.hidden=!settings.publicCard.showCompanyLogo;name.textContent=settings.publicCard.companyName;link.href=settings.publicCard.companyUrl;link.hidden=!settings.publicCard.showCompanyLink&&!settings.publicCard.showCompanyLogo;
  if(!settings.publicCard.showCompanyLink)link.removeAttribute("href");powered.hidden=!settings.publicCard.showPoweredBy;
  footer.hidden=link.hidden&&powered.hidden;
}

async function copy(value,{analyticsContext=null}={}){
  if(settings.privacy.confirmBeforeCopy&&!confirm("¿Copiar el enlace público de esta tarjeta?"))return false;
  try{await copyText(value);if(analyticsContext)safeTrackEvent("copy_link",analyticsContext);toast("Enlace copiado.");return true}catch{toast("Selecciona el enlace para copiarlo manualmente.","error");return false}
}

async function share(card,url,analyticsContext){
  safeTrackEvent("share_click",analyticsContext);
  const result=await shareCard(card,url,settings,{onFallbackCopy:value=>copy(value,{analyticsContext})});
  return result.status;
}

function downloadVcard(card,analyticsContext){
  safeTrackEvent("vcard_download",analyticsContext);
  const blob=new Blob([buildVcard(card)],{type:"text/vcard;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");
  a.href=url;a.download=getVcardFilename(card);document.body.append(a);a.click();a.remove();URL.revokeObjectURL(url);toast("Contacto descargado.");
}

function createQr(url){
  const holder=document.querySelector("#qr-code");
  try{
    renderQr(holder,url,{factory:globalThis.qrcode,options:settings.cards.qr,ariaLabel:`Código QR para abrir la tarjeta de ${formatPersonName(card,settings)}`});
    holder.dataset.size=settings.cards.qr.size;
  }catch{
    const fallback=document.createElement("span");fallback.textContent="QR no disponible";fallback.style.fontSize=".65rem";fallback.style.textAlign="center";holder.replaceChildren(fallback);
  }
}
