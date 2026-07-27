import {contrastRatio,readableTextColor} from "./templates-store.js?v=1.7.0";

export const MIN_COMPARISON_TEMPLATES=2;
export const MAX_COMPARISON_TEMPLATES=4;
export const COMPARISON_DEVICES=Object.freeze(["mobile","tablet","desktop"]);

const unique=values=>[...new Set(values.filter(Boolean))];

export function normalizeComparisonSelection(selectedIds,activeTemplates){
  const activeIds=new Set(activeTemplates.filter(template=>template.status==="active").map(template=>template.id));
  return unique(selectedIds).filter(id=>activeIds.has(id)).slice(0,MAX_COMPARISON_TEMPLATES);
}

export function effectiveCurrentTemplateId(card,activeTemplates,defaultTemplate){
  if(card&&activeTemplates.some(template=>template.id===card.template))return card.template;
  if(defaultTemplate&&activeTemplates.some(template=>template.id===defaultTemplate.id))return defaultTemplate.id;
  return activeTemplates[0]?.id||"";
}

export function recommendedTemplateIds(card,activeTemplates,defaultTemplate){
  const currentId=effectiveCurrentTemplateId(card,activeTemplates,defaultTemplate);
  const preferred=unique([currentId,defaultTemplate?.id,...activeTemplates.map(template=>template.id)]);
  return normalizeComparisonSelection(preferred,activeTemplates);
}

export function toggleComparisonTemplate(selectedIds,templateId,activeTemplates){
  const current=normalizeComparisonSelection(selectedIds,activeTemplates);
  if(current.includes(templateId))return {ids:current.filter(id=>id!==templateId),limitReached:false};
  if(current.length>=MAX_COMPARISON_TEMPLATES)return {ids:current,limitReached:true};
  if(!activeTemplates.some(template=>template.id===templateId&&template.status==="active"))return {ids:current,limitReached:false};
  return {ids:[...current,templateId],limitReached:false};
}

function styleLabel(theme){
  if(theme.backgroundPattern==="none"&&theme.buttonStyle==="minimal")return "Minimalista";
  if(["blue-grid","pulse-blocks","focus-frame","geometric-block","corporate-gradient"].includes(theme.backgroundPattern))return "Visual";
  return "Corporativo";
}

function actionOrderLabel(value){
  if(value==="identity-social-contact")return "Redes antes de contacto";
  if(value==="contact-identity-social")return "Contacto en primer plano";
  return "Contacto antes de redes";
}

export function describeTemplate(template){
  const theme=template.theme;
  const dark=readableTextColor(theme.backgroundColor)==="#FFFFFF";
  const contrast=contrastRatio(theme.backgroundColor,theme.textColor);
  const style=styleLabel(theme);
  return {
    tone:dark?"Oscuro":"Claro",
    style,
    contrast:contrast>=7?"Alto":"Equilibrado",
    photo:theme.photoShape==="rounded"?"Cuadrada redondeada":"Circular",
    actions:actionOrderLabel(theme.contentOrder),
    usage:template.description||`Diseño ${style.toLowerCase()} para identidad profesional.`,
    sentence:`Diseño ${dark?"oscuro":"claro"}, ${style.toLowerCase()} y de contraste ${contrast>=7?"alto":"equilibrado"}.`,
  };
}
