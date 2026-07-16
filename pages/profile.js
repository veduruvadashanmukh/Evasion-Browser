const $ = (id) => document.getElementById(id);
const api = window.profileAPI;
const views = ['loadingView','createView','loginView','manageView'];
let status = null, method = 'password';
const show = (id) => views.forEach((name) => $(name).hidden = name !== id);
const initials = (name) => String(name || 'E').split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]).join('').toUpperCase() || 'E';
const setAvatar = (node, profile) => { node.textContent = initials(profile?.name); node.style.background = `linear-gradient(135deg,${profile?.avatarColor || '#845cff'},#35dcff)`; };
const error = (id, message='') => $(id).textContent = message;

function strength(value){
  let score=0; if(value.length>=8)score++; if(value.length>=12)score++; if(/[a-z]/.test(value)&&/[A-Z]/.test(value))score++; if(/\d/.test(value))score++; if(/[^\w\s]/.test(value))score++;
  const pct=Math.min(100,score*20), colors=['#ff5f7c','#ff8a5b','#ffd166','#61d095','#35dcff'];
  $('strengthBar').style.width=`${pct}%`; $('strengthBar').style.background=colors[Math.max(0,score-1)]; $('strengthText').textContent=['Very weak','Weak','Fair','Strong','Excellent'][Math.max(0,score-1)] || 'Password strength';
}

async function load(){
  status=await api.status();
  if(!status.exists){show('createView');$('createName').focus();return;}
  if(status.unlocked){fillManage(status.profile);show('manageView');return;}
  fillLogin(status.profile);show('loginView');$('credential').focus();
}
function fillLogin(profile){setAvatar($('loginAvatar'),profile);$('loginTitle').textContent=`Welcome back, ${profile?.name || 'User'}`;$('loginEmail').textContent=profile?.email || 'Your local Evasion profile';}
function fillManage(profile){setAvatar($('manageAvatar'),profile);$('manageName').value=profile?.name||'';$('manageEmail').value=profile?.email||'';$('manageColor').value=profile?.avatarColor||'#845cff';}
function setMethod(next){method=next;$('passwordTab').classList.toggle('active',method==='password');$('pinTab').classList.toggle('active',method==='pin');$('credentialLabel').firstChild.textContent=method==='pin'?'PIN':'Password';$('credential').value='';$('credential').inputMode=method==='pin'?'numeric':'text';$('credential').focus();}

$('createName').addEventListener('input',()=>setAvatar($('createAvatar'),{name:$('createName').value}));
$('createPassword').addEventListener('input',e=>strength(e.target.value));
$('createForm').addEventListener('submit',async e=>{e.preventDefault();error('createError');if($('createPassword').value!==$('confirmPassword').value)return error('createError','Passwords do not match.');try{await api.create({name:$('createName').value,email:$('createEmail').value,password:$('createPassword').value,pin:$('createPin').value,});window.close();}catch(err){error('createError',err.message);}});
$('passwordTab').onclick=()=>setMethod('password');$('pinTab').onclick=()=>setMethod('pin');
$('loginForm').addEventListener('submit',async e=>{e.preventDefault();error('loginError');try{await api.login({method,credential:$('credential').value});window.close();}catch(err){error('loginError',err.message);$('credential').select();}});
$('manageForm').addEventListener('submit',async e=>{e.preventDefault();error('manageError');try{status=await api.update({name:$('manageName').value,email:$('manageEmail').value,avatarColor:$('manageColor').value});error('manageError','Saved successfully.');fillManage(status.profile);}catch(err){error('manageError',err.message);}});
$('logoutNow').onclick=async()=>{await api.logout();window.close();};
$('resetBrowser').onclick=async()=>{
  error('resetError');
  if(!$('resetConfirm').checked)return error('resetError','Confirm that you understand this cannot be undone.');
  if(!$('resetPassword').value)return error('resetError','Enter your profile password.');
  const confirmed=confirm('Permanently erase all Evasion Browser data on this computer?');
  if(!confirmed)return;
  $('resetBrowser').disabled=true;
  $('resetBrowser').textContent='Resetting…';
  try{await api.resetBrowserData($('resetPassword').value);}catch(err){
    $('resetBrowser').disabled=false;
    $('resetBrowser').textContent='Reset browser and restart';
    error('resetError',err.message);
  }
};
load().catch(err=>{show('loginView');error('loginError',err.message);});

const refreshProfileSession=()=>api.refreshSession?.().catch(()=>{});
setInterval(refreshProfileSession,30*60*1000);
window.addEventListener('focus',refreshProfileSession);
