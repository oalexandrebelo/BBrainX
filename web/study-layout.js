// Disposição do mapa do estudo: uma coluna por situação, sem biblioteca de layout. Pura, sem DOM.
export const SIZE={width:204,height:66,gap:9,pad:12,head:84,columnGap:28,maxRows:10};

/** Devolve os nós do React Flow: cada situação é um nó-pai, seguido dos itens que ela contém. */
export function layoutStudy(situations,tools,size=SIZE){
  const nodes=[];let x=0;
  for(const situation of situations){
    const members=tools.filter(tool=>tool.group===situation.id), columns=Math.max(1,Math.ceil(members.length/size.maxRows)), rows=Math.max(1,Math.ceil(members.length/columns));
    const width=size.pad*2+columns*size.width+(columns-1)*size.gap, height=size.head+rows*size.height+(rows-1)*size.gap+size.pad;
    nodes.push({id:'situation-'+situation.id,type:'situation',position:{x,y:0},style:{width,height},data:{...situation,count:members.length},selectable:false,draggable:false});
    members.forEach((tool,index)=>nodes.push({id:tool.id,type:'tool',parentId:'situation-'+situation.id,extent:'parent',draggable:false,
      position:{x:size.pad+(index%columns)*(size.width+size.gap),y:size.head+Math.floor(index/columns)*(size.height+size.gap)},style:{width:size.width,height:size.height},data:tool}));
    x+=width+size.columnGap;
  }
  return nodes;
}
