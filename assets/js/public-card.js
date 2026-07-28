import {cardService} from "./cards.js?v=1.10.1";
import {renderCardPreview} from "./preview.js?v=1.10.1";
import {buildVcard,canDisplayPublicCard,getPublicCardUrl,getSourcedPublicCardUrl,getVcardFilename,isAdministrativePreviewSource} from "./card-export.js?v=1.10.1";
import {copyText,shareCard} from "./card-sharing.js?v=1.3.1";
import {renderQr} from "./qr-code.js?v=1.3.1";
import {getAccessContext,safeTrackEvent,trackPublicCardView} from "./analytics.js";
import {applySettingsToDocument,formatPersonName,settingsService} from "./settings-store.js?v=1.10.1";
import {createActionIcon,renderActionGrid,setActionFeedback} from "./card-actions.js?v=1.10.1";
import {isIndexedDbPhoto} from "./photo-storage.js?v=1.6.0";
import {openQrPremium,setupQrPremium} from "./qr-premium.js?v=1.10.1";

function renderPublicIcons(root=document){
  root.querySelectorAll("[data-icon]").forEach(slot=>{if(!slot.children.length)slot.append(createActionIcon(slot.dataset.icon))});
}
renderPublicIcons();
const settings=settingsService.getSettings();
applySettingsToDocument(settings);

function toast(message,type="success"){
  const item=document.createElement("div");item.className=`toast ${type}`;item.setAttribute("role",type==="error"?"alert":"status");item.append(createActionIcon(type==="success"?"check":"link"),document.createTextNode(message));document.querySelector("#toast-region").append(item);setTimeout(()=>item.remove(),3000);
}
setupQrPremium({showToast:toast,renderIconElements:renderPublicIcons});
const parameter=new URLSearchParams(location.search).get("id");
const card=cardService.get(parameter);
const accessContext=getAccessContext();
const publicCard=document.querySelector("#public-card"),actions=document.querySelector("#public-actions"),notFound=document.querySelector("#not-found");

if(!canDisplayPublicCard(card,accessContext.source)){
  publicCard.hidden=true;actions.hidden=true;notFound.hidden=false;document.title=`Tarjeta no encontrada · ${settings.general.appName}`;
}else{
  renderCardPreview(publicCard,card,null,null,{interactive:true});
  const published=card.status==="active";
  const administrativePreview=isAdministrativePreviewSource(accessContext.source);
  const displayName=formatPersonName(card,settings);
  const titleBrand=settings.publicCard.titleSource==="company"?settings.publicCard.companyName:settings.general.appName;
  document.title=`${displayName} | ${titleBrand}`;
  const canonical=getPublicCardUrl(card);
  const qrUrl=getSourcedPublicCardUrl(card,"qr");
  const sharedUrl=getSourcedPublicCardUrl(card,"shared_link");
  const copiedUrl=getSourcedPublicCardUrl(card,"copied_link");
  const analyticsContext={...accessContext,card};
  configureMetadata(card,canonical,displayName,{noIndex:administrativePreview||!published});
  configurePublicActions(card,{analyticsContext,sharedUrl,copiedUrl,allowSharing:published});
  configurePublicFooter();
  configurePrivacyNotice(card,accessContext);
  trackPublicCardView(card,accessContext);
  document.querySelector("#public-url").textContent=published?canonical:getSourcedPublicCardUrl(card,accessContext.source);
  if(published&&settings.publicCard.buttons.showQr)createQr(qrUrl);else document.querySelector("#public-qr-panel").hidden=true;
  document.querySelector("#copy-top").hidden=!published||!settings.publicCard.buttons.copyLink;
  publicCard.addEventListener("click",event=>{const trigger=event.target.closest("[data-analytics-event]");if(trigger)safeTrackEvent(trigger.dataset.analyticsEvent,analyticsContext)});
  if(published&&settings.publicCard.buttons.copyLink)document.querySelector("#copy-top").addEventListener("click",()=>copy(copiedUrl,{analyticsContext}));
  if(published&&settings.publicCard.buttons.showQr)document.querySelector("#public-qr-premium").addEventListener("click",event=>openQrPremium({
      card,
      url:qrUrl,
      settings,
      allowSave:false,
      opener:event.currentTarget,
    }));
  actions.addEventListener("click",event=>{const trigger=event.target.closest("[data-analytics-event]");if(trigger)safeTrackEvent(trigger.dataset.analyticsEvent,analyticsContext)});
}

function configureMetadata(card,canonical,displayName,{noIndex=false}={}){
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
  if(isLocal)canonicalLink.removeAttribute("href");else canonicalLink.href=canonical;
  robots.content=isLocal||noIndex?"noindex,nofollow":"index,follow,max-image-preview:large";
}

function configurePublicActions(card,{analyticsContext,sharedUrl,copiedUrl,allowSharing=true}){
  const definitions={
    save:{type:"contact",id:"save-contact",label:"Guardar contacto",ariaLabel:"Descargar y guardar el contacto",visible:settings.publicCard.buttons.saveContact,onClick:()=>downloadVcard(card,analyticsContext)},
    phone:{type:"phone",id:"call-card",label:"Teléfono",ariaLabel:`Llamar a ${card.phone||"este contacto"}`,visible:Boolean(card.phone&&card.visibleFields?.phone!==false),href:`tel:${String(card.phone||"").replace(/[^\d+]/g,"")}`,eventType:"phone_click"},
    email:{type:"email",id:"email-card",label:"Email",ariaLabel:`Enviar un email a ${card.email||"este contacto"}`,visible:Boolean(card.email&&card.visibleFields?.email!==false),href:`mailto:${card.email||""}`,eventType:"email_click"},
    linkedin:{type:"linkedin",id:"linkedin-card",label:"LinkedIn",ariaLabel:`Abrir el perfil de LinkedIn de ${formatPersonName(card,settings)}`,visible:Boolean(card.linkedin&&card.visibleFields?.linkedin!==false),href:card.linkedin,target:"_blank",eventType:"linkedin_click"},
    website:{type:"website",id:"website-card",label:"Website",ariaLabel:"Abrir el sitio web de Lognext",visible:Boolean(card.website&&card.visibleFields?.website!==false),href:card.website,target:"_blank",eventType:"website_click"},
    share:{type:"share",id:"share-card",label:"Compartir",ariaLabel:"Compartir esta tarjeta",visible:allowSharing&&settings.publicCard.buttons.share,onClick:()=>share(card,sharedUrl,analyticsContext)},
  };
  const holder=document.querySelector("#public-primary-actions");
  const ordered=settings.cards.actionOrder.map(id=>definitions[id]).filter(Boolean);
  if(allowSharing&&settings.publicCard.buttons.copyLink)ordered.push({type:"copy",id:"copy-link",label:"Copiar enlace",ariaLabel:"Copiar el enlace público de esta tarjeta",onClick:async(_event,element)=>{if(await copy(copiedUrl,{analyticsContext}))setActionFeedback(element,"Copiado")}});
  return renderActionGrid(holder,ordered,{tone:"light",interactive:true});
}

function configurePrivacyNotice(card,accessContext){
  const note=document.querySelector("#public-privacy-note"),copy=document.querySelector("#public-privacy-copy");
  if(card.status==="draft")copy.textContent="Vista previa administrativa de un borrador. La tarjeta no está disponible mediante su enlace público.";
  else if(isAdministrativePreviewSource(accessContext.source))copy.textContent="Vista previa administrativa. Esta visita queda separada de las métricas públicas principales.";
  else copy.textContent="Los datos de esta tarjeta han sido compartidos por su titular.";
  note.hidden=!settings.privacy.showPersonalDataNotice&&!isAdministrativePreviewSource(accessContext.source);
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
