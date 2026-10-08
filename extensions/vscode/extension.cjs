const vscode=require('vscode');
const os=require('node:os');
const path=require('node:path');
const fs=require('node:fs');
const {execFile}=require('node:child_process');
const {randomUUID}=require('node:crypto');

// Machine settings only: a repository cannot select a binary, Node path or endpoint.
function setting(key){const inspected=vscode.workspace.getConfiguration('bbrainx').inspect(key);return inspected?.globalValue??inspected?.defaultValue;}
function executablePath(value){
  if(typeof value!=='string')throw new Error('CONFIGURATION_REQUIRED');
  const expanded=value.startsWith('~/')||value.startsWith('~\\')?path.join(os.homedir(),value.slice(2)):value;
  if(!path.isAbsolute(expanded)||/[\x00-\x1f\x7f]/.test(expanded))throw new Error('ABSOLUTE_EXECUTABLE_REQUIRED');return expanded;
}
function launch(){const executable=executablePath(setting('executable')),node=setting('nodeExecutable');return node?{file:executablePath(node),prefix:[executable]}:{file:executable,prefix:[]};}
function localFolders(){return (vscode.workspace.workspaceFolders||[]).filter(folder=>folder.uri.scheme==='file');}
function canonicalRoot(folder){return fs.realpathSync(folder.uri.fsPath);}

function activate(context){
  const session=randomUUID(),children=new Set(),pending=new Set(),states=new Map(),events=new vscode.EventEmitter();let disposed=false,panelTerminal;
  const harness=/antigravity/i.test(vscode.env.appName)?'antigravity':'vscode';
  const status=vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,10);status.name='BBrainX';status.command='bbrainx.workspaces.focus';
  function refresh(){
    const folders=localFolders();status.text='BBrainX'+(folders.length===1?' · '+folders[0].name:folders.length>1?' · '+folders.length+' pastas':'');
    status.tooltip=vscode.workspace.isTrusted?'Pastas abertas detectadas. Configuração MCP e conexão nativa têm verificações separadas.':'Workspace sem confiança. BBrainX exibe pastas; execução desativada.';
    status.show();events.fire();
  }
  const provider={onDidChangeTreeData:events.event,getTreeItem:item=>item,getChildren:()=>{
    const folders=localFolders(),rows=[];
    const trust=new vscode.TreeItem(vscode.workspace.isTrusted?'Workspace confiável':'Execução aguarda confiança');trust.iconPath=new vscode.ThemeIcon(vscode.workspace.isTrusted?'shield':'lock');rows.push(trust);
    if(!folders.length)rows.push(new vscode.TreeItem('Abra uma pasta local para conectar.'));
    for(const folder of folders){const item=new vscode.TreeItem(folder.name);item.description=states.get(folder.uri.toString())||'Pasta detectada';item.tooltip=folder.uri.fsPath;item.iconPath=new vscode.ThemeIcon('folder');item.command={command:'bbrainx.connect',title:'Conectar workspace',arguments:[folder.uri]};rows.push(item);}
    const panel=new vscode.TreeItem('Abrir painel BBrainX');panel.iconPath=new vscode.ThemeIcon('link-external');panel.command={command:'bbrainx.openPanel',title:'Abrir painel'};rows.push(panel);
    return rows;
  }};
  function run(args,{root,timeout=10000}={}){
    if(disposed||!vscode.workspace.isTrusted)return Promise.reject(new Error('WORKSPACE_TRUST_REQUIRED'));
    const command=launch();return new Promise((resolve,reject)=>{
      const child=execFile(command.file,[...command.prefix,...args],{cwd:root,timeout,maxBuffer:65536,windowsHide:true,shell:false},(error,stdout)=>{
        children.delete(child);if(error){reject(new Error(error.code==='ENOENT'?'CLI_NOT_FOUND':error.killed?'CLI_TIMEOUT':'CLI_FAILED'));return;}
        let result;try{result=JSON.parse(stdout);}catch{reject(new Error('CLI_RESPONSE_INVALID'));return;}resolve(result);
      });children.add(child);
    });
  }
  async function seen(){
    if(disposed||!vscode.workspace.isTrusted||!setting('activityReceipts'))return;
    for(const folder of localFolders()){
      const key=folder.uri.toString();if(pending.has(key))continue;pending.add(key);
      try{const root=canonicalRoot(folder);await run(['workspace-seen','--root',root,'--harness',harness,'--session',session],{root});}
      catch{/* Metadata receipt is optional; do not expose command output or notification noise. */}
      finally{pending.delete(key);}
    }
  }
  async function chooseFolder(uri){
    const folders=localFolders();if(uri)return folders.find(folder=>folder.uri.toString()===uri.toString());
    if(folders.length===1)return folders[0];if(!folders.length){await vscode.window.showInformationMessage('BBrainX: abra uma pasta local primeiro.');return;}
    const picked=await vscode.window.showQuickPick(folders.map(folder=>({label:folder.name,description:folder.uri.fsPath,folder})),{placeHolder:'Selecione a pasta para o BBrainX'});return picked?.folder;
  }
  async function integrate(apply,uri){
    const folder=await chooseFolder(uri);if(!folder)return;
    if(!vscode.workspace.isTrusted){await vscode.window.showWarningMessage('BBrainX: a execução requer confiança do workspace no editor.');return;}
    const key=folder.uri.toString();states.set(key,apply?'Aplicando configuração…':'Verificando configuração…');refresh();
    try{const root=canonicalRoot(folder),result=await run(['integrate','--root',root,...(apply?['--apply']:[])],{root,timeout:apply?120000:10000});
      const files=result.plan?.files||result.files||[],manual=files.some(file=>file.status==='manual-required'),blocked=files.some(file=>file.status==='blocked');
      states.set(key,blocked?'Configuração bloqueada':manual?'Etapa manual pendente':apply?'Configuração aplicada; conexão a verificar':'Plano disponível; conexão a verificar');
      await vscode.window.showInformationMessage('BBrainX: '+states.get(key)+'.');
    }catch(error){states.set(key,'Configuração pendente');const detail=error.message==='CLI_NOT_FOUND'?'Configure bbrainx.executable nos ajustes de usuário.':'Confira o CLI e o estado do projeto no painel.';await vscode.window.showErrorMessage('BBrainX: operação não concluída. '+detail);}
    finally{refresh();}
  }
  async function openPanel(){
    let url;try{url=new URL(setting('panelUrl'));if(url.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password)throw new Error();}
    catch{await vscode.window.showErrorMessage('BBrainX: panelUrl deve apontar para HTTP local, sem credenciais.');return;}
    if(vscode.env.remoteName){await vscode.window.showWarningMessage('BBrainX: painel local em host remoto requer encaminhamento explícito.');return;}
    await vscode.env.openExternal(vscode.Uri.parse(url.href));
  }
  async function startPanel(){
    if(!vscode.workspace.isTrusted){await vscode.window.showWarningMessage('BBrainX: a execução requer confiança do workspace no editor.');return;}
    if(panelTerminal){panelTerminal.show();return;}
    try{const command=launch();panelTerminal=vscode.window.createTerminal({name:'BBrainX painel',shellPath:command.file,shellArgs:[...command.prefix,'serve']});panelTerminal.show();}
    catch{await vscode.window.showErrorMessage('BBrainX: configure o executável nos ajustes de usuário.');}
  }
  const timer=setInterval(()=>{void seen();},30000);timer.unref?.();
  context.subscriptions.push(status,events,vscode.window.registerTreeDataProvider('bbrainx.workspaces',provider),
    vscode.commands.registerCommand('bbrainx.detect',uri=>integrate(false,uri)),vscode.commands.registerCommand('bbrainx.connect',uri=>integrate(true,uri)),
    vscode.commands.registerCommand('bbrainx.openPanel',openPanel),vscode.commands.registerCommand('bbrainx.startPanel',startPanel),
    vscode.workspace.onDidChangeWorkspaceFolders(()=>{refresh();void seen();}),vscode.workspace.onDidGrantWorkspaceTrust(()=>{refresh();void seen();}),
    vscode.workspace.onDidChangeConfiguration(event=>{if(event.affectsConfiguration('bbrainx')){refresh();void seen();}}),
    vscode.window.onDidCloseTerminal(terminal=>{if(terminal===panelTerminal)panelTerminal=undefined;}),
    {dispose(){disposed=true;clearInterval(timer);for(const child of children)child.kill();panelTerminal?.dispose();}}
  );refresh();void seen();
}
module.exports={activate};
