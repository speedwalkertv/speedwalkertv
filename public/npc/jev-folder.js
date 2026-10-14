// File System Access: somente uma pasta escolhida e autorizada pelo usuario.
const DB='jev-obsidian-folder-v1';
let handlePromise;
let writing=Promise.resolve();

function openDatabase(){
  return new Promise((resolve,reject)=>{
    const req=indexedDB.open(DB,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('selected');
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}

async function persisted(op,value){
  const db=await openDatabase();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction('selected',op==='get'?'readonly':'readwrite');
      const request=op==='get'?tx.objectStore('selected').get('vault'):tx.objectStore('selected').put(value,'vault');
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
    });
  }finally{db.close();}
}

export const folderSupported=()=>typeof window.showDirectoryPicker==='function';
export function getFolder(){return handlePromise??=persisted('get').catch(()=>null);}
export async function chooseFolder(){
  if(!folderSupported())throw Error('Este navegador nao suporta escolher pastas. Abra o site no Chrome ou Edge.');
  const selected=await window.showDirectoryPicker({mode:'readwrite',id:'jev-obsidian'});
  if(await selected.queryPermission({mode:'readwrite'})!=='granted'){
    if(await selected.requestPermission({mode:'readwrite'})!=='granted')throw Error('Permissao da pasta nao concedida.');
  }
  await persisted('put',selected);
  handlePromise=Promise.resolve(selected);
  return selected;
}
export async function folderGranted(handle){
  return Boolean(handle&&await handle.queryPermission({mode:'readwrite'})==='granted');
}
export async function authorizeFolder(){
  const handle=await getFolder();
  if(!handle)throw Error('Escolha primeiro a pasta do cerebro.');
  if(await handle.requestPermission({mode:'readwrite'})!=='granted')throw Error('Permissao de escrita recusada.');
  return handle;
}

async function writeFile(handle,subdir,name,content){
  if(!/^[\wÀ-ÿ .-]{1,100}$/.test(name)||name.includes('..'))throw Error('Nome de arquivo invalido');
  const dir=await handle.getDirectoryHandle(subdir,{create:true});
  const file=await dir.getFileHandle(name,{create:true});
  const writer=await file.createWritable();
  try{await writer.write(content);}finally{await writer.close();}
}

// Serializa gravacoes; uma aba fechada nao deve interromper o jogo.
function serialize(action){
  const task=writing.then(action);
  writing=task.catch(()=>{});
  return task;
}
function noteForMatch(match){
  return [
    '# Jev — partida '+match.id,'',
    'Data: '+match.date,'Resultado: '+match.outcome,
    'Duracao: '+match.duration+'s','Onda: '+match.wave,'Abates: '+match.kills,
    'Pontuacao: '+match.score,'Dano recebido: '+match.damageTaken,
    'Acertos no heroi: '+match.hitsTaken+' ('+match.projectileHits+' por projeteis)',
    'Precisao dos tiros: '+(match.shots?Math.round(match.shotsHit*100/match.shots):0)+'%',
    'Dados: [['+match.id+'.json]]',''
  ].join('\n');
}
export async function writeMatchToFolder(match){
  const handle=await getFolder();
  if(!await folderGranted(handle))return false;
  if(!/^[\w-]{12,80}$/.test(match?.id||''))return false;
  return serialize(async()=>{
    await writeFile(handle,'04 - Partidas',match.id+'.json',JSON.stringify(match,null,2)+'\n');
    await writeFile(handle,'04 - Partidas',match.id+'.md',noteForMatch(match));
    return true;
  });
}
export async function writeBrainToFolder({policy,notes}){
  const handle=await getFolder();
  if(!await folderGranted(handle))return false;
  return serialize(async()=>{
    await writeFile(handle,'08 - Modelos','politica-jev.json',JSON.stringify(policy,null,2)+'\n');
    await writeFile(handle,'07 - Memoria para API','Memoria editavel.md',notes||'');
    const rules=Object.entries(policy.contexts||{}).map(([key,value])=>
      '- '+key+': '+value.movement+' ('+value.samples+' exemplos; recompensa media '+value.meanReward+')');
    await writeFile(handle,'05 - Aprendizados','Aprendizados automaticos.md',
      '# Aprendizados automaticos da Jev\n\nPartidas registradas: '+policy.matches+
      '\nMaior pontuacao: '+policy.bestScore+'\nMaior onda: '+policy.bestWave+
      '\n\n## Regras observadas\n'+(rules.join('\n')||'- Mais dados necessarios.')+
      '\n\nEstatisticas observacionais; ainda nao representam pesos treinados de uma rede neural.\n');
    return true;
  });
}
export async function syncFolderExport(exported){
  const handle=await getFolder();
  if(!await folderGranted(handle))throw Error('Permissao da pasta expirada. Clique em Autorizar pasta.');
  for(const match of exported.matches||[])await writeMatchToFolder(match);
  await writeBrainToFolder(exported);
  return (exported.matches||[]).length;
}
