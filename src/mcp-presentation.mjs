// Apresentação do servidor MCP (Implementation: title, description, websiteUrl, icons), separada do protocolo.
const plainObject=value=>typeof value==='object'&&value!==null&&!Array.isArray(value);
/** Teto do total de `src` dos ícones: eles seguem em todo início de sessão. */
export const MAX_ICON_BYTES=12288;
const RASTER_ICON=/^data:(image\/(?:png|jpeg|webp|gif));base64,[A-Za-z0-9+/]+={0,2}$/;
/**
 * Ícones do servidor (Implementation.icons). Só data: URI raster: servidor stdio não tem origem HTTP confiável,
 * `file:` amarraria um caminho da máquina, e IDEs derivadas do VS Code descartam SVG. Declaração inválida falha no início.
 */
function serverIcons(icons){
  if(!Array.isArray(icons)||icons.length===0||icons.length>4)throw new TypeError('INVALID_SERVER_ICONS');
  let bytes=0;
  return icons.map(icon=>{
    const type=plainObject(icon)&&typeof icon.src==='string'?RASTER_ICON.exec(icon.src)?.[1]:undefined;
    if(!type||icon.mimeType!==type||!Array.isArray(icon.sizes)||icon.sizes.length===0||!icon.sizes.every(size=>typeof size==='string'&&/^[1-9]\d{0,3}x[1-9]\d{0,3}$/.test(size)))throw new TypeError('INVALID_SERVER_ICONS');
    if((bytes+=icon.src.length)>MAX_ICON_BYTES)throw new TypeError('INVALID_SERVER_ICONS');
    return {src:icon.src,mimeType:type,sizes:[...icon.sizes]};
  });
}
const PRESENTATION_TEXT=['title','description','websiteUrl'];
/** Apresentação do servidor (Implementation): só campos conhecidos, validados no início e anunciados na abertura da sessão. */
export function serverPresentation(metadata){
  if(!plainObject(metadata)||Object.keys(metadata).some(key=>key!=='icons'&&!PRESENTATION_TEXT.includes(key)))throw new TypeError('INVALID_SERVER_METADATA');
  const presentation={};
  for(const key of PRESENTATION_TEXT)if(metadata[key]!==undefined){
    if(typeof metadata[key]!=='string'||metadata[key].length===0||metadata[key].length>512)throw new TypeError('INVALID_SERVER_METADATA');
    presentation[key]=metadata[key];
  }
  if(metadata.icons!==undefined)presentation.icons=serverIcons(metadata.icons);
  return presentation;
}
