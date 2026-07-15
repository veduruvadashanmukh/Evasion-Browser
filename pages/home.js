const $ = (id) => document.getElementById(id);
const searchForm = $("searchForm"), searchInput = $("searchInput"), clearButton = $("clearButton");
const currentDate = $("currentDate"), currentTime = $("currentTime"), greeting = $("greeting");
const focusButton = $("focusButton"), focusStatus = $("focusStatus");
const profileButton = $("profileButton"), profileAvatar = $("profileAvatar"), profileName = $("profileName");
const profileModal = $("profileModal"), profileForm = $("profileForm"), profileCancel = $("profileCancel");
const nameInput = $("nameInput"), emailInput = $("emailInput"), profileTitle = $("profileTitle");
const PROFILE_KEY = "evasion.localProfile.v2";

const QUICK_LAUNCH_KEY = "evasion.quickLaunch.v1";
const DEFAULT_QUICK_LAUNCH = [
  {name:"Discord",url:"https://discord.com/app",icon:"discord",tone:"neon-purple"},
  {name:"YouTube",url:"https://www.youtube.com",icon:"youtube",tone:"neon-red"},
  {name:"Gmail",url:"https://mail.google.com",icon:"gmail",tone:"neon-blue"},
  {name:"GitHub",url:"https://github.com",icon:"github",tone:"neon-cyan"},
  {name:"ChatGPT",url:"https://chatgpt.com",icon:"chatgpt",tone:"neon-green"},
  {name:"Spotify",url:"https://open.spotify.com",icon:"spotify",tone:"neon-green"}
];
function readQuickLaunch(){try{const value=JSON.parse(localStorage.getItem(QUICK_LAUNCH_KEY)||"null");return Array.isArray(value)?value:structuredClone(DEFAULT_QUICK_LAUNCH)}catch{return structuredClone(DEFAULT_QUICK_LAUNCH)}}
function writeQuickLaunch(items){localStorage.setItem(QUICK_LAUNCH_KEY,JSON.stringify(items.slice(0,18)));renderHomeLaunch();}
function shortcutIcon(item){
  const known=new Set(["discord","twitch","steam","youtube","spotify","github","gmail","chatgpt","whatsapp","reddit"]);
  if(known.has(item.icon))return `<img src="../assets/brands/${item.icon}.svg" alt="">`;
  return `<b class="custom-shortcut-initial">${String(item.name||"E").trim().charAt(0).toUpperCase()}</b>`;
}
function renderHomeLaunch(){
  const items=readQuickLaunch(),root=$("homeShortcutGrid"); if(!root)return;
  root.innerHTML=items.map((item,index)=>`<button class="shortcut ${item.tone||"neon-blue"}" data-home-launch="${index}"><span class="shortcut-logo">${shortcutIcon(item)}</span><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(new URL(item.url).hostname.replace(/^www\./,""))}</small></span></button>`).join("");
  root.querySelectorAll("[data-home-launch]").forEach(node=>node.onclick=()=>openUrl(items[Number(node.dataset.homeLaunch)].url));
  renderHomeLaunchEditor();
}
function escapeHTML(value){return String(value||"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function renderHomeLaunchEditor(){
  const root=$("homeLaunchList");if(!root)return;const items=readQuickLaunch();
  root.innerHTML=items.map((item,index)=>`<div><span>${escapeHTML(item.name)}</span><span class="home-launch-actions"><button type="button" data-move="${index}:-1" ${index===0?"disabled":""}>↑</button><button type="button" data-move="${index}:1" ${index===items.length-1?"disabled":""}>↓</button><button type="button" data-remove="${index}">Remove</button></span></div>`).join("");
  root.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>{const next=readQuickLaunch();next.splice(Number(b.dataset.remove),1);writeQuickLaunch(next)});
  root.querySelectorAll("[data-move]").forEach(b=>b.onclick=()=>{const [i,d]=b.dataset.move.split(":").map(Number),next=readQuickLaunch(),j=i+d;[next[i],next[j]]=[next[j],next[i]];writeQuickLaunch(next)});
}

let profile = null;

function readProfile() {
  const params = new URLSearchParams(location.search);
  const name = params.get("profileName");
  if (name) {
    const value = { name, email: params.get("profileEmail") || "", avatarColor: params.get("profileColor") || "#845cff" };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
    return value;
  }
  try { return JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch { return null; }
}
function saveProfile(value) {
  profile = value;
  localStorage.setItem(PROFILE_KEY, JSON.stringify(value));
  applyProfile();
}
function initials(name) {
  return String(name || "E").trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "E";
}
function applyProfile() {
  
$("customizeLaunch")?.addEventListener("click",()=>{$("launchModal").hidden=false;renderHomeLaunchEditor();$("homeLaunchName").focus();});
$("closeLaunchModal")?.addEventListener("click",()=>{$("launchModal").hidden=true;});
$("restoreHomeLaunch")?.addEventListener("click",()=>writeQuickLaunch(structuredClone(DEFAULT_QUICK_LAUNCH)));
$("homeLaunchForm")?.addEventListener("submit",(event)=>{event.preventDefault();const items=readQuickLaunch();if(items.length>=18)return;const name=$("homeLaunchName").value.trim(),url=$("homeLaunchUrl").value.trim();if(!name||!/^https?:\/\//i.test(url))return;items.push({name,url,icon:"",tone:["neon-purple","neon-violet","neon-blue","neon-red","neon-green","neon-cyan"][items.length%6]});writeQuickLaunch(items);event.target.reset();});
$("launchModal")?.addEventListener("click",(event)=>{if(event.target===$("launchModal"))$("launchModal").hidden=true;});
renderHomeLaunch();

profile = readProfile();
  profileName.textContent = profile?.name || "Create profile";
  profileAvatar.textContent = initials(profile?.name);
  if (profile?.avatarColor) profileAvatar.style.background = `linear-gradient(135deg,${profile.avatarColor},#35dcff)`;
  updateClock();
}
function openProfile(firstRun = false) {
  profileTitle.textContent = firstRun ? "Create your browser profile" : "Edit your browser profile";
  nameInput.value = profile?.name || "";
  emailInput.value = profile?.email || "";
  profileCancel.hidden = firstRun;
  profileModal.hidden = false;
  setTimeout(() => nameInput.focus(), 0);
}
function closeProfile() { if (profile) profileModal.hidden = true; }
function destination(input) {
  const value = String(input || "").trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.includes(".") && !value.includes(" ")) return `https://${value}`;
  return `https://www.google.com/search?q=${encodeURIComponent(value)}`;
}
function updateClock() {
  const now = new Date(), hour = now.getHours();
  currentTime.textContent = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }).format(now);
  currentDate.textContent = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short" }).format(now);
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  greeting.textContent = profile?.name ? `${part}, ${profile.name}` : `${part}. Welcome to Evasion`;
}
function openUrl(value) {
  const url = destination(value);
  if (url) window.location.href = url;
}
searchForm.addEventListener("submit", (event) => { event.preventDefault(); openUrl(searchInput.value); });
searchInput.addEventListener("input", () => { clearButton.hidden = !searchInput.value.trim(); });
clearButton.addEventListener("click", () => { searchInput.value = ""; clearButton.hidden = true; searchInput.focus(); });
document.querySelectorAll("[data-url]").forEach((node) => node.addEventListener("click", () => openUrl(node.dataset.url)));
document.querySelector("[data-action='open-control']")?.addEventListener("click", () => { window.location.href = "evasion://performance"; });
focusButton.addEventListener("click", () => {
  const enabled = document.body.classList.toggle("focus-mode");
  focusStatus.textContent = enabled ? "On" : "Off";
  focusButton.classList.toggle("active", enabled);
});
profileButton.addEventListener("click", () => { profileButton.title = "Open the browser menu to manage your profile"; });
profileCancel.addEventListener("click", closeProfile);
profileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) return;
  saveProfile({ name, email: emailInput.value.trim(), updatedAt: Date.now() });
  profileModal.hidden = true;
});
profileModal.addEventListener("click", (event) => { if (event.target === profileModal) closeProfile(); });
document.addEventListener("keydown", (event) => {
  if (event.key === "/" && document.activeElement !== searchInput && profileModal.hidden) { event.preventDefault(); searchInput.focus(); }
  if (event.key === "Escape") {
    if (!profileModal.hidden) closeProfile();
    else if (document.activeElement === searchInput) { searchInput.value = ""; clearButton.hidden = true; }
  }
});

$("customizeLaunch")?.addEventListener("click",()=>{$("launchModal").hidden=false;renderHomeLaunchEditor();$("homeLaunchName").focus();});
$("closeLaunchModal")?.addEventListener("click",()=>{$("launchModal").hidden=true;});
$("restoreHomeLaunch")?.addEventListener("click",()=>writeQuickLaunch(structuredClone(DEFAULT_QUICK_LAUNCH)));
$("homeLaunchForm")?.addEventListener("submit",(event)=>{event.preventDefault();const items=readQuickLaunch();if(items.length>=18)return;const name=$("homeLaunchName").value.trim(),url=$("homeLaunchUrl").value.trim();if(!name||!/^https?:\/\//i.test(url))return;items.push({name,url,icon:"",tone:["neon-purple","neon-violet","neon-blue","neon-red","neon-green","neon-cyan"][items.length%6]});writeQuickLaunch(items);event.target.reset();});
$("launchModal")?.addEventListener("click",(event)=>{if(event.target===$("launchModal"))$("launchModal").hidden=true;});
renderHomeLaunch();

profile = readProfile();
applyProfile();
if (!profile) profileName.textContent = "Evasion";
setInterval(updateClock, 30000);
if (profile) searchInput.focus();
