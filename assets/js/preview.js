import {templateService,readableTextColor} from "./templates-store.js";

const NS="http://www.w3.org/2000/svg";
const icons={
  phone:"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13 1 .37 1.97.72 2.89a2 2 0 0 1-.45 2.11L8.1 10a16 16 0 0 0 6 6l1.28-1.28a2 2 0 0 1 2.11-.45c.92.35 1.89.59 2.89.72A2 2 0 0 1 22 16.92z",
  mail:"M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  web:"M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10",
  linkedin:"M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z M2 9h4v12H2z M4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"
};
function svgIcon(name){
  const svg=document.createElementNS(NS,"svg");svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("fill","none");svg.setAttribute("stroke","currentColor");svg.setAttribute("stroke-width","2");svg.setAttribute("aria-hidden","true");
  icons[name].split(" M").forEach((d,i)=>{const path=document.createElementNS(NS,"path");path.setAttribute("d",i?`M${d}`:d);svg.append(path)});return svg;
}
function el(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node}
function initials(card){return `${card.firstName?.[0]||""}${card.lastName?.[0]||""}`.toUpperCase()}
function addLink(container,href,icon,label,eventType){
  const a=el("a");a.href=href;a.target=href.startsWith("http")?"_blank":"";if(a.target)a.rel="noopener noreferrer";a.append(svgIcon(icon),document.createTextNode(label));container.append(a);
  if(eventType)a.dataset.analyticsEvent=eventType;
}

function logoSource(theme){
  if(theme.logoVariant==="blue")return "assets/img/logos/lognext-positive.svg";
  if(theme.logoVariant==="symbol")return readableTextColor(theme.backgroundColor)==="#000029"?"assets/img/logos/lognext-symbol-positive.svg":"assets/img/logos/lognext-symbol-negative.svg";
  return "assets/img/logos/lognext-negative.svg";
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
}

export function renderCardPreview(container,card,templateOverride=null){
  container.replaceChildren();
  const template=templateOverride||templateService.resolveTemplate(card.template);
  applyTheme(container,card,template);
  const theme=template.theme;
  const pattern=el("div","card-pattern");
  const inner=el("div","dc-inner"),header=el("div","dc-header");
  const logo=el("img","dc-logo");logo.src=logoSource(theme);logo.alt="Lognext";
  inner.append(header,logo);
  const identity=el("div","dc-identity");
  if(card.photo){const photo=el("img","dc-photo");photo.src=card.photo;photo.alt=`Foto de ${card.firstName||"empleado"}`;identity.append(photo)}
  else identity.append(el("div","dc-initials",initials(card)||"LN"));
  identity.append(el("h1","",`${card.firstName||"Nombre"} ${card.lastName||"Apellidos"}`.trim()));
  identity.append(el("p","dc-role",card.jobTitle||"Puesto"));
  const metadata=[theme.showDepartment!==false&&card.department,theme.showCity!==false&&card.visibleFields?.city!==false&&card.city].filter(Boolean);
  if(metadata.length)identity.append(el("p","dc-meta",metadata.join(" · ")));
  if(card.bio&&card.visibleFields?.bio!==false) identity.append(el("p","dc-bio",card.bio));
  const contact=el("div","dc-contact");
  if(card.phone&&card.visibleFields?.phone!==false)addLink(contact,`tel:${card.phone.replace(/[^\d+]/g,"")}`,"phone",card.phone,"phone_click");
  if(card.email&&card.visibleFields?.email!==false)addLink(contact,`mailto:${card.email}`,"mail",card.email,"email_click");
  const socials=el("div","dc-socials");
  if(card.linkedin&&card.visibleFields?.linkedin!==false)addLink(socials,card.linkedin,"linkedin","","linkedin_click"); 
  if(card.website&&card.visibleFields?.website!==false)addLink(socials,card.website,"web","","website_click");
  const blocks={identity,contact,social:socials};
  const order={
    "identity-contact-social":["identity","contact","social"],
    "identity-social-contact":["identity","social","contact"],
    "contact-identity-social":["contact","identity","social"],
  }[theme.contentOrder]||["identity","contact","social"];
  order.forEach(key=>{if(key==="identity"||blocks[key].children.length)inner.append(blocks[key])});
  if(theme.showTagline)inner.append(el("p","dc-tagline",(template.type==="system"?template.id:template.baseTemplateId)==="meaningful-tech"?"Your Meaningful Tech Partner.":"Digital card by Lognext"));
  container.append(pattern,inner);
  return template;
}
