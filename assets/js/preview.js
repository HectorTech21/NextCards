import {templateService,readableTextColor} from "./templates-store.js";
import {formatPersonName,settingsService} from "./settings-store.js";
import {renderActionGrid} from "./card-actions.js";

function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function initials(card){return `${card.firstName?.[0]||""}${card.lastName?.[0]||""}`.toUpperCase()}

function logoSource(theme){
  if(theme.logoVariant==="blue")return "assets/img/logos/lognext-positive.svg";
  if(theme.logoVariant==="symbol")return readableTextColor(theme.backgroundColor)==="#000029"?"assets/img/logos/lognext-symbol-positive.svg":"assets/img/logos/lognext-symbol-negative.svg";
  return "assets/img/logos/lognext-negative.svg";
}

function taglineFor(settings){
  return settings.publicCard.tagline;
}

function applyTheme(container,card,template){
  const theme=template.theme;
  const accent=/^#[0-9A-F]{6}$/i.test(card.accentColor||"")?card.accentColor.toUpperCase():theme.accentColor;
  [...container.classList].filter(className=>/^(template|pattern|photo-shape|photo-size|buttons|logo-position|order)-/.test(className)).forEach(className=>container.classList.remove(className));
  const baseId=template.type==="system"?template.id:template.baseTemplateId;
  container.classList.add("digital-card",`template-${baseId}`,`pattern-${theme.backgroundPattern}`,`photo-shape-${theme.photoShape}`,`photo-size-${theme.photoSize}`,`buttons-${theme.buttonStyle}`,`logo-position-${theme.logoPosition}`,`order-${theme.contentOrder}`);
  if(template.type==="custom")container.classList.add("template-custom");
  container.dataset.templateId=template.id;
  container.style.setProperty("--template-bg",theme.backgroundColor);
  container.style.setProperty("--template-accent",accent);
  container.style.setProperty("--template-text",theme.textColor);
  container.style.setProperty("--template-muted",theme.mutedTextColor);
  container.style.setProperty("--template-secondary",theme.secondaryColor);
  container.style.setProperty("--template-secondary-text",readableTextColor(theme.secondaryColor));
  container.style.setProperty("--template-button-text",readableTextColor(accent));
  container.style.setProperty("--accent",accent);
  container.dataset.cardTone=readableTextColor(theme.backgroundColor)==="#FFFFFF"?"dark":"light";
}

export function renderCardPreview(container,card,templateOverride=null,settingsOverride=null,{interactive=false}={}){
  container.replaceChildren();
  const settings=settingsOverride||settingsService.getSettings();
  const template=templateOverride||templateService.resolveTemplate(card.template);
  applyTheme(container,card,template);
  const theme=template.theme;
  const pattern=el("div","card-pattern");
  const inner=el("div","dc-inner"),header=el("div","dc-header");
  const logo=el("img","dc-logo");logo.src=logoSource(theme);logo.alt="Lognext";
  inner.append(header,logo);
  const identity=el("div","dc-identity");
  if(card.visibleFields?.photo!==false){
    if(card.photo){const photo=el("img","dc-photo");photo.src=card.photo;photo.alt=`Foto de ${card.firstName||"empleado"}`;identity.append(photo)}
    else identity.append(el("div","dc-initials",initials(card)||"LN"));
  }
  identity.append(el("h1","",formatPersonName({firstName:card.firstName||"Nombre",lastName:card.lastName||"Apellidos"},settings)));
  if(card.visibleFields?.jobTitle!==false)identity.append(el("p","dc-role",card.jobTitle||"Puesto"));
  const metadata=[theme.showDepartment!==false&&card.visibleFields?.department!==false&&card.department,theme.showCity!==false&&card.visibleFields?.city!==false&&card.city].filter(Boolean);
  if(metadata.length)identity.append(el("p","dc-meta",metadata.join(" · ")));
  if(card.bio&&card.visibleFields?.bio!==false) identity.append(el("p","dc-bio",card.bio));
  const contact=el("div","dc-contact");
  const contactActions=[];
  if(card.phone&&card.visibleFields?.phone!==false)contactActions.push({type:"phone",label:"Teléfono",ariaLabel:`Llamar a ${card.phone}`,href:`tel:${card.phone.replace(/[^\d+]/g,"")}`,eventType:"phone_click"});
  if(card.email&&card.visibleFields?.email!==false)contactActions.push({type:"email",label:"Email",ariaLabel:`Enviar un email a ${card.email}`,href:`mailto:${card.email}`,eventType:"email_click"});
  renderActionGrid(contact,contactActions,{tone:container.dataset.cardTone,interactive});
  const socials=el("div","dc-socials");
  const socialActions=[];
  if(card.linkedin&&card.visibleFields?.linkedin!==false)socialActions.push({type:"linkedin",label:"LinkedIn",ariaLabel:`Abrir el perfil de LinkedIn de ${formatPersonName(card,settings)}`,href:card.linkedin,target:"_blank",eventType:"linkedin_click"});
  if(card.website&&card.visibleFields?.website!==false)socialActions.push({type:"website",label:"Website",ariaLabel:"Abrir el sitio web de Lognext",href:card.website,target:"_blank",eventType:"website_click"});
  renderActionGrid(socials,socialActions,{tone:container.dataset.cardTone,interactive});
  container.dataset.previewMode=interactive?"interactive":"safe";
  const blocks={identity,contact,social:socials};
  const order={
    "identity-contact-social":["identity","contact","social"],
    "identity-social-contact":["identity","social","contact"],
    "contact-identity-social":["contact","identity","social"],
  }[theme.contentOrder]||["identity","contact","social"];
  order.forEach(key=>{if(key==="identity"||blocks[key].children.length)inner.append(blocks[key])});
  if(theme.showTagline&&settings.publicCard.tagline)inner.append(el("p","dc-tagline",taglineFor(settings)));
  container.append(pattern,inner);
  return template;
}
