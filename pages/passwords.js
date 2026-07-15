const $=id=>document.getElementById(id),api=window.vaultAPI;
if(!api)throw new Error('Vault API unavailable.');
const ui={setupView:$('setupView'),unlockView:$('unlockView'),vaultView:$('vaultView'),setupForm:$('setupForm'),setupPassword:$('setupPassword'),setupConfirm:$('setupConfirm'),setupStrength:$('setupStrength'),unlockForm:$('unlockForm'),unlockPassword:$('unlockPassword'),list:$('list'),emptyState:$('emptyState'),searchInput:$('searchInput'),message:$('message'),addBtn:$('addBtn'),entryDialog:$('entryDialog'),entryForm:$('entryForm'),entryTitle:$('entryTitle'),entryId:$('entryId'),websiteInput:$('websiteInput'),usernameInput:$('usernameInput'),passwordInput:$('passwordInput'),notesInput:$('notesInput'),showInputBtn:$('showInputBtn'),generateInputBtn:$('generateInputBtn'),passwordStrength:$('passwordStrength'),lockBtn:$('lockBtn'),exportBtn:$('exportBtn'),importBtn:$('importBtn'),generatorBtn:$('generatorBtn'),generatorDialog:$('generatorDialog'),lengthInput:$('lengthInput'),lengthValue:$('lengthValue'),lowerCheck:$('lowerCheck'),upperCheck:$('upperCheck'),numberCheck:$('numberCheck'),symbolCheck:$('symbolCheck'),generatedOutput:$('generatedOutput'),regenerateBtn:$('regenerateBtn'),copyGeneratedBtn:$('copyGeneratedBtn'),changeMasterBtn:$('changeMasterBtn'),changeDialog:$('changeDialog'),changeForm:$('changeForm'),currentMaster:$('currentMaster'),newMaster:$('newMaster'),confirmMaster:$('confirmMaster'),forgotPasswordBtn:$('forgotPasswordBtn'),resetDialog:$('resetDialog'),resetForm:$('resetForm'),resetConfirmation:$('resetConfirmation'),resetNewPassword:$('resetNewPassword'),resetConfirmPassword:$('resetConfirmPassword'),resetStrength:$('resetStrength'),resetAcknowledge:$('resetAcknowledge'),resetSubmitBtn:$('resetSubmitBtn'),messageIcon:$('messageIcon'),messageTitle:$('messageTitle'),messageText:$('messageText'),messageClose:$('messageClose')};
let entries=[];
function normalizeError(error){
  let text=String(error?.message||error||"Something went wrong.");
  text=text.replace(/^Error invoking remote method '[^']+': Error:\s*/i,"");
  text=text.replace(/^Error:\s*/i,"");

  if(/Incorrect master password or damaged vault/i.test(text)){
    return {
      title:"Vault could not be unlocked",
      text:"The master password is incorrect. Check Caps Lock and try again. If you no longer remember it, reset the vault to create a new password.",
      type:"error"
    };
  }

  if(/at least 10 characters/i.test(text)){
    return {
      title:"Password is too short",
      text:"Use at least 10 characters for your master password.",
      type:"error"
    };
  }

  return {title:"Request unsuccessful",text,type:"error"};
}

function hideMessage(){
  ui.message.hidden=true;
}

function showMessage(title,text,type="error"){
  ui.messageTitle.textContent=title;
  ui.messageText.textContent=text;
  ui.messageIcon.textContent=type==="success"?"✓":"!";
  ui.message.className=`notice ${type}`;
  ui.message.hidden=false;
}

const run=async(fn)=>{
  try{
    hideMessage();
    return await fn();
  }catch(error){
    const message=normalizeError(error);
    showMessage(message.title,message.text,message.type);
    return null;
  }
};
function show(view){[ui.setupView,ui.unlockView,ui.vaultView].forEach(v=>v.hidden=v!==view);const open=view===ui.vaultView;ui.lockBtn.hidden=!open;ui.exportBtn.hidden=!open}
async function refresh(){const status=await run(()=>api.status());if(!status)return;if(!status.exists)return show(ui.setupView);if(!status.unlocked)return show(ui.unlockView);show(ui.vaultView);entries=await run(()=>api.list())||[];render()}
function render(){const q=ui.searchInput.value.trim().toLowerCase(),filtered=entries.filter(e=>`${e.website} ${e.username} ${e.notes||''}`.toLowerCase().includes(q));ui.emptyState.hidden=entries.length>0;ui.list.replaceChildren(...filtered.map(card))}
function card(entry){const node=document.createElement('article');node.className='card';const site=document.createElement('div');site.innerHTML=`<strong></strong><small>Website</small>`;site.querySelector('strong').textContent=entry.website;const user=document.createElement('div');user.innerHTML=`<strong></strong><small>Username</small>`;user.querySelector('strong').textContent=entry.username;const actions=document.createElement('div');actions.className='card-actions';[['Show',async()=>{const r=await run(()=>api.reveal(entry.id));if(r)alert(`Password: ${r.password}`)}],['Copy user',()=>run(()=>api.copyUsername(entry.id))],['Copy password',()=>run(()=>api.copyPassword(entry.id))],['Edit',()=>openEntry(entry)],['Delete',async()=>{if(confirm(`Delete ${entry.website}?`)){await run(()=>api.remove(entry.id));await refresh()}}]].forEach(([text,fn])=>{const b=document.createElement('button');b.textContent=text;if(text==='Delete')b.className='delete';b.onclick=fn;actions.appendChild(b)});node.append(site,user,actions);return node}
function openEntry(entry=null){ui.entryForm.reset();ui.entryId.value=entry?.id||'';ui.entryTitle.textContent=entry?'Edit login':'Add login';ui.websiteInput.value=entry?.website||'';ui.usernameInput.value=entry?.username||'';ui.notesInput.value=entry?.notes||'';ui.passwordInput.value='';ui.passwordInput.required=!entry;ui.passwordInput.type='password';ui.showInputBtn.textContent='Show';ui.passwordStrength.textContent='Strength: —';ui.entryDialog.showModal()}
async function updateStrength(input,target){const s=await api.strength(input.value);target.textContent=`Strength: ${s.label}`}
async function generate(){const p=await run(()=>api.generate({length:+ui.lengthInput.value,lower:ui.lowerCheck.checked,upper:ui.upperCheck.checked,numbers:ui.numberCheck.checked,symbols:ui.symbolCheck.checked}));if(p)ui.generatedOutput.value=p}
ui.setupForm.onsubmit=async e=>{e.preventDefault();if(ui.setupPassword.value!==ui.setupConfirm.value)return showMessage('Passwords do not match','Enter the same password in both fields.');const r=await run(()=>api.create(ui.setupPassword.value));if(r)refresh()};
ui.unlockForm.onsubmit=async e=>{e.preventDefault();const r=await run(()=>api.unlock(ui.unlockPassword.value));ui.unlockForm.reset();if(r)refresh()};
ui.addBtn.onclick=()=>openEntry();ui.searchInput.oninput=render;ui.lockBtn.onclick=async()=>{await api.lock();refresh()};ui.importBtn.onclick=async()=>{const r=await run(()=>api.importVault());if(r)refresh()};ui.exportBtn.onclick=()=>run(()=>api.exportVault());
ui.entryForm.onsubmit=async e=>{e.preventDefault();const id=ui.entryId.value,entry={website:ui.websiteInput.value,username:ui.usernameInput.value,notes:ui.notesInput.value};if(ui.passwordInput.value)entry.password=ui.passwordInput.value;const r=id?await run(()=>api.update(id,entry)):await run(()=>api.add(entry));if(r){ui.entryDialog.close();refresh()}};
ui.showInputBtn.onclick=()=>{const hide=ui.passwordInput.type==='password';ui.passwordInput.type=hide?'text':'password';ui.showInputBtn.textContent=hide?'Hide':'Show'};ui.generateInputBtn.onclick=async()=>{ui.passwordInput.value=await api.generate({length:20,lower:true,upper:true,numbers:true,symbols:true});updateStrength(ui.passwordInput,ui.passwordStrength)};ui.passwordInput.oninput=()=>updateStrength(ui.passwordInput,ui.passwordStrength);ui.setupPassword.oninput=()=>updateStrength(ui.setupPassword,ui.setupStrength);
ui.generatorBtn.onclick=()=>{ui.generatorDialog.showModal();generate()};ui.lengthInput.oninput=()=>{ui.lengthValue.textContent=ui.lengthInput.value;generate()};[ui.lowerCheck,ui.upperCheck,ui.numberCheck,ui.symbolCheck].forEach(x=>x.onchange=generate);ui.regenerateBtn.onclick=generate;ui.copyGeneratedBtn.onclick=()=>navigator.clipboard.writeText(ui.generatedOutput.value);
ui.changeMasterBtn.onclick=()=>ui.changeDialog.showModal();ui.changeForm.onsubmit=async e=>{e.preventDefault();if(ui.newMaster.value!==ui.confirmMaster.value)return showMessage('Passwords do not match','Enter the same new password in both fields.');const r=await run(()=>api.changeMasterPassword(ui.currentMaster.value,ui.newMaster.value));if(r){ui.changeDialog.close();ui.changeForm.reset();showMessage('Master password changed','Your encrypted vault now uses the new master password.','success')}};
document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
ui.messageClose.onclick=hideMessage;

ui.forgotPasswordBtn.onclick=()=>{
  ui.resetForm.reset();
  ui.resetStrength.textContent="Strength: —";
  hideMessage();
  ui.resetDialog.showModal();
};

ui.resetNewPassword.oninput=()=>updateStrength(ui.resetNewPassword,ui.resetStrength);

ui.resetForm.onsubmit=async event=>{
  event.preventDefault();

  if(ui.resetConfirmation.value.trim()!=="RESET"){
    return showMessage("Confirmation does not match","Type RESET exactly in the confirmation field.");
  }

  if(ui.resetNewPassword.value!==ui.resetConfirmPassword.value){
    return showMessage("Passwords do not match","Enter the same new master password in both fields.");
  }

  if(ui.resetNewPassword.value.length<10){
    return showMessage("Password is too short","Use at least 10 characters for your new master password.");
  }

  if(!ui.resetAcknowledge.checked){
    return showMessage("Confirmation required","Confirm that you understand the existing vault data will be deleted.");
  }

  ui.resetSubmitBtn.disabled=true;
  ui.resetSubmitBtn.textContent="Resetting vault…";

  const resetResult=await run(()=>api.resetVault(ui.resetConfirmation.value));
  if(!resetResult){
    ui.resetSubmitBtn.disabled=false;
    ui.resetSubmitBtn.textContent="Delete vault and reset";
    return;
  }

  const createResult=await run(()=>api.create(ui.resetNewPassword.value));
  ui.resetSubmitBtn.disabled=false;
  ui.resetSubmitBtn.textContent="Delete vault and reset";

  if(createResult){
    ui.resetDialog.close();
    ui.resetForm.reset();
    showMessage("Vault reset complete","A new encrypted vault was created with your new master password.","success");
    await refresh();
  }
};

refresh();
