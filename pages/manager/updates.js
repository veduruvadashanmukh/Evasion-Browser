const $=id=>document.getElementById(id);
const api=window.managerAPI;let info=null;
function render(state={}){
 const status=state.status||"idle",pct=Math.max(0,Math.min(100,Number(state.percent||0)));
 $("progressBar").style.width=`${pct}%`;
 const map={
  development:["Development build","Automatic installation runs only in packaged releases."],
  unavailable:["Updater unavailable","This package has no configured update provider."],
  idle:["Automatic updates enabled","Evasion checks for stable releases in the background."],
  checking:["Checking for updates…","Connecting to the official GitHub release channel."],
  downloading:[`Downloading ${state.availableVersion||"update"}…`,`${pct}% downloaded. Continue browsing normally.`],
  "up-to-date":["Evasion is up to date",`Installed version: ${state.currentVersion||""}`],
  "ready-on-quit":[`Evasion ${state.downloadedVersion||state.availableVersion} is ready`,"It will install automatically when Evasion closes."],
  error:["Update check failed",state.error||"Evasion will try again later."]
 };
 const value=map[status]||map.idle;$("statusTitle").textContent=value[0];$("statusText").textContent=value[1];
}
async function load(){
 info=await api.checkUpdates();$("releaseNotes").textContent=info?.notes||"No release notes were provided.";
 render(info?.updater||{status:info?.updateAvailable?"idle":"up-to-date",currentVersion:info?.currentVersion});
}
$("checkButton").onclick=async()=>{$("checkButton").disabled=true;try{const r=await api.checkUpdatesNow();r?.status?render(r):await load()}finally{$("checkButton").disabled=false}};
$("releasesButton").onclick=()=>api.openUpdateURL(info?.releaseUrl);
api.onUpdateStatus?.(render);load().catch(e=>render({status:"error",error:e.message}));
