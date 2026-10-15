import { getFolder, chooseFolder, folderSupported, folderGranted, authorizeFolder, syncFolderExport } from '../jev-folder.js';

const $=id=>document.getElementById(id);
const tokenKey='jev-control';
let connected=false;
let lastCount=-1;
let syncing=false;
let currentPolicy=null;

function notice(message,type=''){
  $('notice').textContent=message;
  $('notice').className='notice '+type;
}
function enable(value){
  connected=value;
  for(const id of ['notes','save-notes','refresh','export-brain','export-dataset','import-file','import-brain'])
    $(id).disabled=!value;
  $('connection').textContent=value?'Memória conectada':'Aguardando autorização';
  document.querySelector('.status-dot').style.background=value?'#73ffe0':'#ffb26c';
}
function auth(){const token=sessionStorage.getItem(tokenKey);if(!token||token.length<24)throw Error('Informe seu código de controle antes de acessar.');return token;}
async function api(url,opts={}){
  const response=await fetch(url,{cache:'no-store',...opts,headers:{Authorization:'Bearer '+auth(),...(opts.body?{'Content-Type':'application/json'}:{}),...opts.headers}});
  let body;
  try{body=await response.json();}catch{body={};}
  if(!response.ok)throw Error(response.status===401?'Código incorreto. Revise JEV_CONTROL_TOKEN.':
    body.error==='missing_control_token'?'Servidor sem JEV_CONTROL_TOKEN.':body.error||'Falha '+response.status);
  return body;
}

function download(content,name,mime){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}

function drawMatches(matches){
  const list=$('match-list');list.replaceChildren();
  if(!matches.length){list.textContent='Ainda não há partidas registradas. Jogue para começar a gerar memória.';return;}
  for(const match of matches){
    const item=document.createElement('article');item.className='match';
    const wave=document.createElement('div');wave.className='wave';wave.textContent=String(match.wave).padStart(2,'0');
    const tag=document.createElement('small');tag.textContent='ONDA';wave.prepend(tag);
    const info=document.createElement('div');
    const title=document.createElement('strong');title.textContent=match.score.toLocaleString('pt-BR')+' pontos · '+match.kills+' abates';
    const desc=document.createElement('p');
    desc.textContent='Dano recebido: '+Math.round(match.damageTaken)+' · Impactos: '+match.hitsTaken+' · '+Math.round(match.duration)+'s de sobrevivência';
    info.append(title,desc);
    const right=document.createElement('div');const status=document.createElement('span');status.className='tag';status.textContent='REGISTRADA';
    const time=document.createElement('time');time.textContent=new Date(match.date).toLocaleDateString('pt-BR');
    right.append(status,document.createElement('br'),time);item.append(wave,info,right);list.append(item);
  }
}
function drawRules(policy){
  const list=$('rule-list');list.replaceChildren();
  const entries=Object.entries(policy.contexts||{});
  if(!entries.length){list.textContent='A Jev ainda não possui amostras suficientes para recomendar uma movimentação. Continue jogando.';return;}
  const labels={projectile_danger:'Projéteis próximos',low_health:'Vida crítica',surrounded:'Cercado',far_target:'Alvo distante',normal:'Combate comum'};
  const moves={retreat:'Recuar',approach:'Avançar',orbit_left:'Circular esquerda',orbit_right:'Circular direita',north:'Subir',south:'Descer',east:'Direita',west:'Esquerda'};
  for(const [context,rule]of entries){
    const row=document.createElement('div');row.className='rule';
    const left=document.createElement('div'),right=document.createElement('div');right.className='value';
    const title=document.createElement('strong');title.textContent=labels[context]||context;
    const comment=document.createElement('p');comment.textContent='Preferência baseada nos resultados de combate';left.append(title,comment);
    right.textContent=moves[rule.movement]||rule.movement;
    const samples=document.createElement('span');samples.textContent=rule.samples+' amostras';right.append(samples);
    row.append(left,right);list.append(row);
  }
}
async function refresh(){
  const data=await api('/api/jev/memory/dashboard');
  const policy=data.policy||{};
  currentPolicy=policy;
  $('metric-matches').textContent=(policy.matches||0).toLocaleString('pt-BR');
  $('metric-score').textContent=(policy.bestScore||0).toLocaleString('pt-BR');
  $('metric-wave').textContent=(policy.bestWave||0).toLocaleString('pt-BR');
  $('metric-rules').textContent=Object.keys(policy.contexts||{}).length;
  if(document.activeElement!==$('notes')){
    $('notes').value=data.notes||'';
    $('note-count').textContent=$('notes').value.length;
  }
  drawMatches(data.recent||[]);
  drawRules(policy);
  return data;
}
async function connect(){
  const input=$('access-token').value.trim();
  if(input)sessionStorage.setItem(tokenKey,input);
  $('access-token').value='';
  try{
    await refresh();
    enable(true);
    notice('Memória conectada. Você pode editar, importar, exportar e sincronizar experiências.','ok');
  }catch(error){
    enable(false);
    notice(error.message,'error');
  }
}

async function updateFolderStatus(){
  const handle=await getFolder();
  $('folder-name').textContent=handle?.name||'Nenhuma pasta escolhida';
  $('folder-state').textContent=!folderSupported()?'Use Chrome ou Edge para acessar pastas locais.':
    handle?(await folderGranted(handle)?'Autorizada para escrita automática':'Acesso requer autorização novamente'):
    'Selecione a pasta do Obsidian.';
}
async function withProgress(action,message){
  if(syncing)return;
  syncing=true;
  notice(message);
  try{await action();}
  catch(error){notice(error.message,'error');}
  finally{syncing=false;}
}
async function syncNow(){
  const result=await api('/api/jev/memory/export');
  const copied=await syncFolderExport(result);
  lastCount=result.policy?.matches??lastCount;
  notice(copied+' partidas e arquivos de aprendizado sincronizados com a pasta escolhida.','ok');
  await updateFolderStatus();
}
$('connect').addEventListener('click',()=>void connect());
$('access-token').addEventListener('keydown',event=>{if(event.key==='Enter')void connect();});
$('notes').addEventListener('input',()=>{$('note-count').textContent=$('notes').value.length;});
$('refresh').addEventListener('click',()=>void withProgress(async()=>{await refresh();notice('Histórico atualizado.','ok');},'Atualizando memória...'));
$('save-notes').addEventListener('click',()=>void withProgress(async()=>{
  await api('/api/jev/memory/notes',{method:'PUT',body:JSON.stringify({notes:$('notes').value})});
  notice('Instruções salvas no cérebro da Jev.','ok');
  if(await folderGranted(await getFolder()))await syncNow();
},'Salvando instruções...'));
$('choose-folder').addEventListener('click',()=>void withProgress(async()=>{
  const handle=await chooseFolder();
  await updateFolderStatus();
  notice('Pasta '+handle.name+' selecionada. Conecte-se para sincronizar o histórico.','ok');
  if(connected)await syncNow();
},'Aguardando escolha da pasta...'));
$('authorize-folder').addEventListener('click',()=>void withProgress(async()=>{
  await authorizeFolder();
  await updateFolderStatus();
  notice('Permissão de escrita concedida.','ok');
  if(connected)await syncNow();
},'Solicitando permissão...'));
$('sync-folder').addEventListener('click',()=>void withProgress(syncNow,'Sincronizando arquivos...'));
$('export-brain').addEventListener('click',()=>void withProgress(async()=>{
  const data=await api('/api/jev/memory/export');
  download(JSON.stringify(data,null,2),'cerebro-jev-backup.json','application/json');
  notice('Backup completo baixado.','ok');
},'Preparando backup...'));
$('export-dataset').addEventListener('click',()=>void withProgress(async()=>{
  const data=await api('/api/jev/memory/export');
  const rows=[];
  for(const match of data.matches||[]){
    for(let i=0;i+1<match.frames.length;i++){
      const a=match.frames[i],b=match.frames[i+1];
      rows.push(JSON.stringify({matchId:match.id,state:{hpRatio:a.hpRatio,nearestDistance:a.nearestDistance,
        closeEnemies:a.closeEnemies,projectiles:a.projectiles,wave:a.wave},
        action:a.movement,source:a.source,reward:Math.max(-15,Math.min(12,(b.t-a.t)*.12+
        (b.kills-a.kills)*1.8-(b.damageTaken-a.damageTaken)*.075-(b.hitsTaken-a.hitsTaken)*1.5))}));
    }
  }
  download(rows.join('\n')+'\n','jev-treinamento.jsonl','application/x-ndjson');
  notice(rows.length+' experiências exportadas para treinamento local.','ok');
},'Gerando dataset...'));
$('import-brain').addEventListener('click',()=>void withProgress(async()=>{
  const file=$('import-file').files?.[0];
  if(!file)throw Error('Selecione primeiro o arquivo JSON do cérebro.');
  if(file.size>6000000)throw Error('Arquivo excede 6 MB; divida o backup antes de importar.');
  let data;
  try{data=JSON.parse(await file.text());}catch{throw Error('Arquivo JSON inválido.');}
  if(!Array.isArray(data.matches))throw Error('Este arquivo não contém um histórico de partidas.');
  const mode=$('replace-memory').checked?'replace':'merge';
  if(mode==='replace'&&!confirm('Substituir TODAS as partidas da memória do servidor? Uma cópia das antigas ficará na pasta de backups do servidor.'))return;
  const result=await api('/api/jev/memory/import',{method:'POST',body:JSON.stringify({mode,matches:data.matches,notes:typeof data.notes==='string'?data.notes:''})});
  $('import-file').value='';
  await refresh();
  notice(result.added+' partidas importadas. Memória '+(mode==='replace'?'substituída':'mesclada')+'.','ok');
  if(await folderGranted(await getFolder()))await syncNow();
},'Importando experiências...'));

// Se a pagina permanecer aberta, verifica partidas novas sem regravar arquivos desnecessariamente.
setInterval(async()=>{
  if(!connected||syncing||document.hidden)return;
  try{
    const data=await refresh();
    if(await folderGranted(await getFolder())&&lastCount!==data.policy.matches){
      await withProgress(syncNow,'Atualizando pasta automaticamente...');
    }
  }catch{/* Falhas de rede nao interrompem a interface. */}
},20000);

void updateFolderStatus();
if(sessionStorage.getItem(tokenKey))void connect();
