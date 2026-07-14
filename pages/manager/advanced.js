const api=window.managerAPI; const $=(id)=>document.getElementById(id); let data=null;
const fmtBytes=(n)=>{const units=['B','KB','MB','GB','TB'];let i=0,v=Number(n)||0;while(v>=1024&&i<units.length-1){v/=1024;i++}return `${v.toFixed(i>1?1:0)} ${units[i]}`};
const escapeHTML=(v)=>String(v??'').replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function empty(text){return `<div class="empty">${escapeHTML(text)}</div>`}
function render(){
  $('sleepingCount').textContent=data.sleepingCount||0; $('securityTotal').textContent=data.security?.total||0; $('openTabsCount').textContent=data.tabs?.length||0;
  $('audibleCount').textContent=`${data.audibleTabs?.length||0} playing audio`; $('memoryValue').textContent=fmtBytes((data.system?.totalMemory||0)-(data.system?.freeMemory||0));
  $('systemValue').textContent=`${data.system?.cpuCount||0} CPU threads · ${fmtBytes(data.system?.freeMemory||0)} free`;
  $('sleepMinutes').value=data.settings?.sleepingTabsMinutes||20; $('streamingToggle').checked=!!data.settings?.streamingMode; $('gamingToggle').checked=!!data.settings?.gamingSessionMode;
  const tabs=(data.tabs||[]).map((tab)=>`<div class="list-item"><div class="grow"><strong>${escapeHTML(tab.title||'New Tab')}</strong><small>${escapeHTML(tab.url||'')} ${tab.isSleeping?'· Sleeping':''}</small></div><button data-tab="${tab.id}" data-action="${tab.isSleeping?'wake':'sleep'}" ${tab.isActive&&!tab.isSleeping?'disabled':''}>${tab.isSleeping?'Wake':'Sleep'}</button></div>`).join('');
  $('tabsList').innerHTML=tabs||empty('No tabs available.');
  const media=(data.audibleTabs||[]).map((tab)=>`<div class="list-item"><div class="grow"><strong>${escapeHTML(tab.title)}</strong><small>${tab.isMuted?'Muted':'Playing audio'}</small></div><button data-media="${tab.id}" data-action="activate">Open</button><button data-media="${tab.id}" data-action="${tab.isMuted?'unmute':'mute'}">${tab.isMuted?'Unmute':'Mute'}</button></div>`).join('');
  $('mediaList').innerHTML=media||empty('No tabs are playing audio.');
  const knowledge=(data.knowledgeVault||[]).map((item)=>`<div class="list-item"><div class="grow"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.note||item.url)}</small></div><button data-delete-knowledge="${item.id}">Delete</button></div>`).join('');
  $('knowledgeList').innerHTML=knowledge||empty('No saved research yet.');
}
async function load(){data=await api.getAdvancedData();render()}
async function status(id,promise){const node=$(id);try{const result=await promise;node.textContent=result?.success===false?(result.error||'Action failed.'):'Done.';await load()}catch(e){node.textContent=e.message}}
$('refreshBtn').onclick=load;
$('sleepInactiveBtn').onclick=()=>status('commandStatus',api.sleepInactiveTabs(Number($('sleepMinutes').value)||20));
$('shredBtn').onclick=()=>status('privacyStatus',api.shredCurrentSite());
$('streamingToggle').onchange=(e)=>status('privacyStatus',api.toggleAdvancedMode('streaming',e.target.checked));
$('gamingToggle').onchange=(e)=>status('privacyStatus',api.toggleAdvancedMode('gaming',e.target.checked));
$('runCommandBtn').onclick=()=>status('commandStatus',api.runCommand($('commandInput').value));
$('commandInput').onkeydown=(e)=>{if(e.key==='Enter')$('runCommandBtn').click()};
document.querySelectorAll('[data-command]').forEach((b)=>b.onclick=()=>{ $('commandInput').value=b.dataset.command;$('runCommandBtn').click() });
$('saveKnowledgeBtn').onclick=()=>status('commandStatus',api.saveKnowledge({note:$('knowledgeNote').value.trim()}));
document.onclick=async(e)=>{const tab=e.target.closest('[data-tab]');if(tab){await (tab.dataset.action==='wake'?api.wakeTab(tab.dataset.tab):api.sleepTab(tab.dataset.tab));return load()}const media=e.target.closest('[data-media]');if(media){await api.mediaAction(media.dataset.media,media.dataset.action);return load()}const del=e.target.closest('[data-delete-knowledge]');if(del){await api.deleteKnowledge(del.dataset.deleteKnowledge);return load()}};
load(); setInterval(load,5000);
