const $ = (id) => document.getElementById(id);
const searchForm = $("searchForm"), searchInput = $("searchInput"), clearButton = $("clearButton");
const currentDate = $("currentDate"), currentTime = $("currentTime"), greeting = $("greeting");
const focusButton = $("focusButton"), focusStatus = $("focusStatus");
const profileButton = $("profileButton"), profileAvatar = $("profileAvatar"), profileName = $("profileName");
const profileModal = $("profileModal"), profileForm = $("profileForm"), profileCancel = $("profileCancel");
const nameInput = $("nameInput"), emailInput = $("emailInput"), profileTitle = $("profileTitle");
const PROFILE_KEY = "evasion.localProfile.v2";
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
profile = readProfile();
applyProfile();
if (!profile) profileName.textContent = "Evasion";
setInterval(updateClock, 30000);
if (profile) searchInput.focus();
