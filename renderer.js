const $ = (id) => document.getElementById(id);
const api = window.browserAPI;
if (!api) throw new Error("Browser API unavailable. Check preload.js and main.js.");

const el = Object.fromEntries([
  "addressForm addressBar backButton forwardButton reloadButton homeButton bookmarkButton menuButton securityIcon loadingBar",
  "tabsContainer newTabButton tabTemplate scrollTabsLeftButton scrollTabsRightButton tabActionsButton",
  "browserMenu menuOverlay profileMenuButton menuProfileAvatar menuProfileName menuProfileEmail newTabMenuItem newWindowMenuItem newIncognitoMenuItem passwordsMenuItem historyMenuItem downloadsMenuItem bookmarksMenuItem tabGroupsMenuItem gamingMenuItem securityMenuItem extensionsMenuItem clearDataMenuItem",
  "zoomOutButton zoomResetButton zoomInButton zoomValue fullScreenButton printMenuItem savePdfMenuItem findMenuItem shareMenuItem evolutionMenuItem advancedMenuItem moreToolsMenuItem helpMenuItem settingsMenuItem developerToolsMenuItem exitMenuItem",
  "findBar findInput findResultCount findPreviousButton findNextButton findCloseButton",
  "tabContextMenu tabContextNewButton tabContextReloadButton tabContextDuplicateButton tabContextCloseButton tabContextCloseOthersButton tabContextCloseRightButton tabContextReopenButton",
  "tabActionsMenu tabActionsNewButton tabActionsReopenButton tabActionsDuplicateButton openTabsList openTabListItemTemplate"
].join(" ").split(/\s+/).map((id) => [id, $(id)]));

let state = { tabId: null, url: "", title: "New Tab", canGoBack: false, canGoForward: false, isLoading: false, isHomePage: true, isBookmarked: false, isIncognito: false };
let tabs = [], activeTabId = null, currentZoom = 100, findStarted = false, draggedTabId = null, contextTabId = null;

const safe = async (fn, label = "Action failed:") => {
  try { return await fn(); } catch (error) { console.error(label, error); return null; }
};
const tabById = (id) => tabs.find((tab) => Number(tab.id) === Number(id));
const activeTab = () => tabById(activeTabId);
const isOpen = (node) => node && !node.hidden;
async function refreshProfile() {
  const result = await safe(() => api.getProfile());
  const profile = result?.profile;
  if (!profile) return;
  const initials = String(profile.name || "E").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "E";
  if (el.menuProfileAvatar) { el.menuProfileAvatar.textContent = initials; el.menuProfileAvatar.style.background = `linear-gradient(135deg,${profile.avatarColor || "#845cff"},#35dcff)`; }
  if (el.menuProfileName) el.menuProfileName.textContent = profile.name || "Evasion Browser";
  if (el.menuProfileEmail) el.menuProfileEmail.textContent = profile.email || "Private local profile";
}

const iconMarkup = (name, cls = "ui-icon") => `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#icon-${name}"></use></svg>`;
function setIcon(node, name) { if (node) node.innerHTML = iconMarkup(name); }

function setOverlay() {
  return api.setOverlayVisible([el.browserMenu, el.findBar, el.tabContextMenu, el.tabActionsMenu].some(isOpen));
}
function hideMenus() {
  [el.browserMenu, el.tabContextMenu, el.tabActionsMenu].forEach((node) => { if (node) node.hidden = true; });
  if (el.menuOverlay) el.menuOverlay.hidden = true;
  el.menuButton?.setAttribute("aria-expanded", "false");
  el.tabActionsButton?.setAttribute("aria-expanded", "false");
  contextTabId = null;
  return setOverlay();
}

function updateTabDensity() {
  el.tabsContainer.classList.toggle("many-tabs", tabs.length >= 6);
  el.tabsContainer.classList.toggle("very-many-tabs", tabs.length >= 10);
  updateTabScrollButtons();
}
function updateTabScrollButtons() {
  const c = el.tabsContainer;
  if (!c || !el.scrollTabsLeftButton || !el.scrollTabsRightButton) return;
  const overflow = c.scrollWidth > c.clientWidth + 2;
  el.scrollTabsLeftButton.hidden = !overflow || c.scrollLeft <= 1;
  el.scrollTabsRightButton.hidden = !overflow || c.scrollLeft + c.clientWidth >= c.scrollWidth - 1;
}
function setFavicon(tab, node) {
  node.replaceChildren();
  if (tab.isLoading) return;
  if (!tab.favicon) { node.innerHTML = iconMarkup(tab.isHomePage ? "home" : "globe"); return; }
  const img = document.createElement("img");
  img.src = tab.favicon; img.alt = ""; img.referrerPolicy = "no-referrer";
  img.onerror = () => { node.innerHTML = iconMarkup(tab.isHomePage ? "home" : "globe"); };
  node.appendChild(img);
}
function updateTabNode(node, tab) {
  node.dataset.tabId = String(tab.id);
  node.classList.toggle("active", !!tab.isActive);
  node.setAttribute("aria-selected", String(!!tab.isActive));
  node.classList.toggle("grouped", !!tab.groupId);
  node.style.setProperty("--group-color", tab.groupColor || "transparent");
  if (tab.groupName) node.title = `${tab.groupName} — ${tab.title || "New Tab"}`;
  const title = tab.isHomePage ? "New Tab" : (tab.title || "New Tab");
  node.querySelector(".tab-title").textContent = title;
  node.title = title;
  const loading = node.querySelector(".tab-loading-indicator");
  const favicon = node.querySelector(".tab-favicon");
  const audio = node.querySelector(".tab-audio-indicator");
  loading.hidden = !tab.isLoading;
  favicon.hidden = !!tab.isLoading;
  if (audio) { audio.hidden = !tab.isAudible; setIcon(audio, tab.isMuted ? "volume-off" : "volume"); }
  setFavicon(tab, favicon);
}
function buildTabNode(tab) {
  const node = el.tabTemplate.content.cloneNode(true).querySelector(".browser-tab");
  const close = node.querySelector(".tab-close-button");
  updateTabNode(node, tab);
    node.onclick = (event) => !event.target.closest(".tab-close-button") && safe(() => api.switchTab(tab.id), "Could not switch tab:");
  close.onclick = (event) => { event.preventDefault(); event.stopPropagation(); safe(() => api.closeTab(tab.id), "Could not close tab:"); };
  node.onauxclick = (event) => { if (event.button === 1) { event.preventDefault(); safe(() => api.closeTab(tab.id)); } };
  node.oncontextmenu = (event) => { event.preventDefault(); openTabContextMenu(tab.id, event.clientX, event.clientY); };
  node.ondragstart = (event) => { draggedTabId = tab.id; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(tab.id)); node.classList.add("dragging"); };
  node.ondragend = () => { draggedTabId = null; document.querySelectorAll(".browser-tab").forEach((n) => n.classList.remove("dragging", "drag-over")); };
  node.ondragover = (event) => { event.preventDefault(); node.classList.add("drag-over"); event.dataTransfer.dropEffect = "move"; };
  node.ondragleave = () => node.classList.remove("drag-over");
  node.ondrop = (event) => {
    event.preventDefault(); node.classList.remove("drag-over");
    const source = Number(event.dataTransfer.getData("text/plain") || draggedTabId), target = Number(node.dataset.tabId);
    if (!source || source === target) return;
    safe(() => api.moveTab(source, tabs.findIndex((t) => Number(t.id) === target)), "Could not move tab:");
  };
  return node;
}
function renderTabs(list = [], selected = activeTabId) {
  tabs = Array.isArray(list) ? list : [];
  activeTabId = selected ?? activeTabId;
  el.tabsContainer.replaceChildren(...tabs.map((tab) => buildTabNode({ ...tab, isActive: Number(tab.id) === Number(activeTabId) })));
  updateTabDensity(); renderOpenTabsList();
  el.tabsContainer.querySelector(`[data-tab-id="${activeTabId}"]`)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
}
function updateSingleTab(tab) {
  if (!tab) return;
  const i = tabs.findIndex((t) => Number(t.id) === Number(tab.id));
  i >= 0 ? tabs[i] = { ...tabs[i], ...tab } : tabs.push(tab);
  const node = el.tabsContainer.querySelector(`[data-tab-id="${tab.id}"]`);
  const normalized = { ...tab, isActive: Number(tab.id) === Number(activeTabId) };
  node ? updateTabNode(node, normalized) : el.tabsContainer.appendChild(buildTabNode(normalized));
  updateTabDensity(); renderOpenTabsList();
}
function renderOpenTabsList() {
  if (!el.openTabsList || !el.openTabListItemTemplate) return;
  el.openTabsList.replaceChildren(...tabs.map((tab) => {
    const node = el.openTabListItemTemplate.content.cloneNode(true).querySelector(".open-tab-list-item");
    node.dataset.tabId = String(tab.id); node.classList.toggle("active", Number(tab.id) === Number(activeTabId));
    node.querySelector(".open-tab-title").textContent = tab.isHomePage ? "New Tab" : (tab.title || "New Tab");
    setFavicon(tab, node.querySelector(".open-tab-favicon"));
    node.onclick = (event) => {
      if (event.target.closest(".open-tab-close")) { event.stopPropagation(); safe(() => api.closeTab(tab.id)); }
      else safe(async () => { await api.switchTab(tab.id); await hideMenus(); });
    };
    return node;
  }));
}

async function openTabContextMenu(tabId, x, y) {
  await hideMenus(); contextTabId = Number(tabId);
  const menu = el.tabContextMenu; menu.hidden = false;
  const rightCount = tabs.length - tabs.findIndex((t) => Number(t.id) === contextTabId) - 1;
  el.tabContextCloseOthersButton.disabled = tabs.length <= 1;
  el.tabContextCloseRightButton.disabled = rightCount <= 0;
  el.tabContextReopenButton.disabled = false;
  const rect = menu.getBoundingClientRect();
  menu.style.left = `${Math.max(4, Math.min(x, innerWidth - rect.width - 4))}px`;
  menu.style.top = `${Math.max(4, Math.min(y, innerHeight - rect.height - 4))}px`;
  await setOverlay();
}
async function toggleTabActions() {
  if (!el.tabActionsMenu.hidden) return hideMenus();
  await hideMenus(); renderOpenTabsList(); el.tabActionsMenu.hidden = false;
  el.tabActionsButton.setAttribute("aria-expanded", "true"); await setOverlay();
}
const tabAction = (fn) => async () => { const id = contextTabId ?? activeTabId; await hideMenus(); return id == null ? null : safe(() => fn(id)); };

function updateBookmark(value) {
  setIcon(el.bookmarkButton, value ? "star-filled" : "star");
  el.bookmarkButton.title = value ? "Remove bookmark" : "Bookmark this page";
  el.bookmarkButton.setAttribute("aria-label", el.bookmarkButton.title);
  el.bookmarkButton.dataset.bookmarked = String(!!value);
}
function updateZoom(value) { currentZoom = Number.isFinite(+value) ? Math.round(+value) : 100; el.zoomValue.textContent = `${currentZoom}%`; }
function updateFullscreen(value) { setIcon(el.fullScreenButton, value ? "fullscreen-exit" : "fullscreen"); el.fullScreenButton.title = value ? "Exit full screen" : "Full screen"; }
function updateSecurity(url = "", home = false) {
  if (home || url.startsWith("file://")) { setIcon(el.securityIcon, "home"); el.securityIcon.title = "Evasion homepage"; }
  else if (url.startsWith("https://")) { setIcon(el.securityIcon, "lock"); el.securityIcon.title = "Secure HTTPS connection"; }
  else if (url.startsWith("http://")) { setIcon(el.securityIcon, "warning"); el.securityIcon.title = "Connection is not encrypted"; }
  else { setIcon(el.securityIcon, "globe"); el.securityIcon.title = "Browser page"; }
}
function updateLoading(value) {
  el.reloadButton.dataset.loading = String(!!value);
  setIcon(el.reloadButton, value ? "stop" : "reload");
  el.reloadButton.title = value ? "Stop loading" : "Reload";
  el.loadingBar.classList.toggle("loading", !!value);
  if (!value) { el.loadingBar.classList.add("finished"); setTimeout(() => el.loadingBar.classList.remove("finished"), 250); }
}
function updateAddress(s) {
  if (document.activeElement === el.addressBar) return;
  const url = String(s.url || "");
  if (s.isHomePage || url.startsWith("file://")) el.addressBar.value = "";
  else if (url.startsWith("data:text/html")) el.addressBar.value = `evasion://${String(s.title || "page").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  else el.addressBar.value = url;
}
function applyState(next) {
  if (!next) return;
  state = { ...state, ...next };
  activeTabId = state.tabId ?? activeTabId;
  document.documentElement.classList.toggle("incognito-window", !!state.isIncognito);
  updateAddress(state);
  const label = state.isIncognito ? "Incognito" : "Evasion";
  document.title = `${state.isHomePage ? (state.isIncognito ? "Incognito" : "New Tab") : (state.title || "New Tab")} - ${label}`;
  el.backButton.disabled = !state.canGoBack;
  el.forwardButton.disabled = !state.canGoForward;
  updateSecurity(state.url, !!state.isHomePage);
  updateLoading(!!state.isLoading);
  updateBookmark(!!state.isBookmarked);
}

async function openBrowserMenu() {
  await hideMenus(); el.browserMenu.hidden = false; el.menuOverlay.hidden = false; el.menuButton.setAttribute("aria-expanded", "true");
  await setOverlay(); const zoom = await safe(() => api.getZoom()); if (typeof zoom === "number") updateZoom(zoom);
}
async function toggleBrowserMenu() { return el.browserMenu.hidden ? openBrowserMenu() : hideMenus(); }
async function runMenu(fn, label) { await hideMenus(); return safe(fn, label); }
async function openFind() { await hideMenus(); el.findBar.hidden = false; findStarted = false; el.findResultCount.textContent = "0/0"; await setOverlay(); el.findInput.focus(); el.findInput.select(); }
async function closeFind() { el.findBar.hidden = true; findStarted = false; el.findInput.value = ""; el.findResultCount.textContent = "0/0"; await safe(() => api.stopFindInPage("clearSelection")); await setOverlay(); }
async function findPage({ forward = true, findNext = false } = {}) {
  const text = el.findInput.value.trim();
  if (!text) { el.findResultCount.textContent = "0/0"; await api.stopFindInPage("clearSelection"); return; }
  await safe(() => api.findInPage(text, { forward, findNext, matchCase: false }), "Could not search page:"); findStarted = true;
}

el.newTabButton.onclick = () => safe(() => api.newTab());
el.addressForm.onsubmit = (event) => { event.preventDefault(); safe(() => api.navigate(el.addressBar.value.trim()), "Navigation failed:"); };
el.addressBar.onfocus = () => el.addressBar.select();
el.backButton.onclick = () => safe(() => api.goBack());
el.forwardButton.onclick = () => safe(() => api.goForward());
el.homeButton.onclick = () => safe(() => api.goHome());
el.reloadButton.onclick = () => safe(() => el.reloadButton.dataset.loading === "true" ? api.stop() : api.reload());
el.bookmarkButton.onclick = async () => { const result = await safe(() => api.toggleBookmark()); if (result) updateBookmark(result.isBookmarked); };
el.menuButton.onclick = (event) => { event.stopPropagation(); toggleBrowserMenu(); };
el.menuOverlay.onclick = hideMenus;
el.browserMenu.onclick = (event) => event.stopPropagation();
if (el.profileMenuButton) el.profileMenuButton.onclick = async () => { await hideMenus(); await safe(() => api.openProfile()); };
el.tabActionsButton.onclick = (event) => { event.stopPropagation(); toggleTabActions(); };
el.tabActionsMenu.onclick = (event) => event.stopPropagation();
el.tabContextMenu.onclick = (event) => event.stopPropagation();
el.tabsContainer.onscroll = updateTabScrollButtons;
el.scrollTabsLeftButton.onclick = () => el.tabsContainer.scrollBy({ left: -240, behavior: "smooth" });
el.scrollTabsRightButton.onclick = () => el.tabsContainer.scrollBy({ left: 240, behavior: "smooth" });
window.addEventListener("resize", updateTabScrollButtons);

const actionBindings = [
  [el.newTabMenuItem, () => api.newTab()], [el.newWindowMenuItem, () => api.newWindow()], [el.newIncognitoMenuItem, () => api.newIncognitoWindow()],
  [el.historyMenuItem, () => api.openHistory()], [el.downloadsMenuItem, () => api.openDownloads()], [el.bookmarksMenuItem, () => api.openBookmarks()],
  [el.settingsMenuItem, () => api.openSettings()], [el.helpMenuItem, () => api.openHelp()], [el.passwordsMenuItem, () => api.openPasswords()],
  [el.extensionsMenuItem, () => api.openExtensions()], [el.tabGroupsMenuItem, () => api.openTabGroups()], [el.gamingMenuItem, () => api.openGaming()], [el.securityMenuItem, () => api.openSecurity()], [el.printMenuItem, () => api.printPage()],
  [el.savePdfMenuItem, () => api.savePageAsPDF()], [el.shareMenuItem, () => api.sharePage()], [el.developerToolsMenuItem, () => api.openDeveloperTools()],
  [el.evolutionMenuItem, () => api.openEvolution()], [el.advancedMenuItem, () => api.openAdvanced()], [el.moreToolsMenuItem, () => api.openTools()], [el.clearDataMenuItem, () => api.clearBrowsingData()]
];
actionBindings.forEach(([node, fn]) => node && (node.onclick = () => runMenu(fn)));
el.exitMenuItem.onclick = () => safe(() => api.exitBrowser());
el.zoomOutButton.onclick = async () => updateZoom(await safe(() => api.zoomOut()));
el.zoomInButton.onclick = async () => updateZoom(await safe(() => api.zoomIn()));
el.zoomResetButton.onclick = async () => updateZoom(await safe(() => api.resetZoom()));
el.fullScreenButton.onclick = async () => updateFullscreen(await safe(() => api.toggleFullScreen()));
el.findMenuItem.onclick = openFind;
el.findInput.oninput = () => { findStarted = false; findPage(); };
el.findInput.onkeydown = (event) => {
  if (event.key === "Enter") { event.preventDefault(); findPage({ forward: !event.shiftKey, findNext: findStarted }); }
  else if (event.key === "Escape") { event.preventDefault(); closeFind(); }
};
el.findNextButton.onclick = () => findPage({ forward: true, findNext: true });
el.findPreviousButton.onclick = () => findPage({ forward: false, findNext: true });
el.findCloseButton.onclick = closeFind;

el.tabContextNewButton.onclick = async () => { await hideMenus(); safe(() => api.newTab()); };
el.tabContextReloadButton.onclick = tabAction(() => api.reload());
el.tabContextDuplicateButton.onclick = tabAction((id) => api.duplicateTab(id));
el.tabContextCloseButton.onclick = tabAction((id) => api.closeTab(id));
el.tabContextCloseOthersButton.onclick = tabAction((id) => api.closeOtherTabs(id));
el.tabContextCloseRightButton.onclick = tabAction((id) => api.closeTabsToRight(id));
el.tabContextReopenButton.onclick = async () => { await hideMenus(); safe(() => api.restoreClosedTab()); };
el.tabActionsNewButton.onclick = async () => { await hideMenus(); safe(() => api.newTab()); };
el.tabActionsReopenButton.onclick = async () => { await hideMenus(); safe(() => api.restoreClosedTab()); };
el.tabActionsDuplicateButton.onclick = async () => { const id = activeTabId; await hideMenus(); if (id != null) safe(() => api.duplicateTab(id)); };

document.addEventListener("click", (event) => {
  if (![el.browserMenu, el.tabContextMenu, el.tabActionsMenu, el.menuButton, el.tabActionsButton].some((n) => n?.contains(event.target))) hideMenus();
});
document.addEventListener("keydown", async (event) => {
  const key = String(event.key || "").toLowerCase(), control = event.ctrlKey || event.metaKey;
  if (event.key === "Escape") {
    if (isOpen(el.tabContextMenu) || isOpen(el.tabActionsMenu) || isOpen(el.browserMenu)) { event.preventDefault(); await hideMenus(); return; }
    if (isOpen(el.findBar)) { event.preventDefault(); await closeFind(); return; }
  }
  const prevent = (fn) => { event.preventDefault(); return fn(); };
  if (control && event.shiftKey && key === "p") return prevent(() => safe(() => api.openAdvanced()));
  if (control && event.shiftKey && key === "t") return prevent(() => safe(() => api.restoreClosedTab()));
  if (control && key === "t") return prevent(() => safe(() => api.newTab()));
  if (control && key === "w") return prevent(() => activeTabId != null && safe(() => api.closeTab(activeTabId)));
  if (control && key === "l") return prevent(async () => { await hideMenus(); el.addressBar.focus(); el.addressBar.select(); });
  if (control && key === "r") return prevent(() => safe(() => api.reload()));
  if (control && event.shiftKey && key === "n") return prevent(() => safe(() => api.newIncognitoWindow()));
  if (control && !event.shiftKey && key === "n") return prevent(() => safe(() => api.newWindow()));
  if (control && key === "h") return prevent(() => safe(() => api.openHistory()));
  if (control && key === "j") return prevent(() => safe(() => api.openDownloads()));
  if (control && key === "d") return prevent(async () => { const result = await safe(() => api.toggleBookmark()); if (result) updateBookmark(result.isBookmarked); });
  if (control && key === "f") return prevent(openFind);
  if (control && key === "p") return prevent(() => safe(() => api.printPage()));
  if (control && event.shiftKey && event.key === "Delete") return prevent(() => safe(() => api.clearBrowsingData()));
  if (control && (key === "+" || key === "=")) return prevent(async () => updateZoom(await safe(() => api.zoomIn())));
  if (control && key === "-") return prevent(async () => updateZoom(await safe(() => api.zoomOut())));
  if (control && key === "0") return prevent(async () => updateZoom(await safe(() => api.resetZoom())));
  if (control && /^[1-8]$/.test(key)) return prevent(() => tabs[Number(key) - 1] && safe(() => api.switchTab(tabs[Number(key) - 1].id)));
  if (control && key === "9") return prevent(() => tabs.length && safe(() => api.switchTab(tabs.at(-1).id)));
  if (event.altKey && event.key === "ArrowLeft") return prevent(() => safe(() => api.goBack()));
  if (event.altKey && event.key === "ArrowRight") return prevent(() => safe(() => api.goForward()));
  if (event.altKey && key === "home") return prevent(() => safe(() => api.goHome()));
  if (event.key === "F11") return prevent(() => safe(async () => updateFullscreen(await api.toggleFullScreen())));
  if (event.key === "F12") return prevent(() => safe(() => api.openDeveloperTools()));
});

api.onStateUpdated(applyState);
api.onTabsUpdated((payload) => payload && renderTabs(payload.tabs || [], payload.activeTabId));
api.onTabCreated(updateSingleTab);
api.onTabUpdated(updateSingleTab);
api.onTabClosed(({ tabId } = {}) => { tabs = tabs.filter((t) => Number(t.id) !== Number(tabId)); el.tabsContainer.querySelector(`[data-tab-id="${tabId}"]`)?.remove(); updateTabDensity(); renderOpenTabsList(); });
api.onActiveTabChanged((payload) => {
  if (!payload) return; activeTabId = payload.activeTabId;
  document.querySelectorAll(".browser-tab").forEach((node) => { const selected = Number(node.dataset.tabId) === Number(activeTabId); node.classList.toggle("active", selected); node.setAttribute("aria-selected", String(selected)); });
  if (payload.tab) applyState(payload.tab); renderOpenTabsList();
});
api.onZoomUpdated(updateZoom);
api.onFindResult((result) => { const matches = Number(result?.matches || 0), ordinal = Number(result?.activeMatchOrdinal || 0); el.findResultCount.textContent = matches ? `${ordinal}/${matches}` : "0/0"; });
api.onFullScreenChanged((value) => updateFullscreen(!!value));
api.onBookmarkUpdated((value) => updateBookmark(!!value?.isBookmarked));
api.onSettingsUpdated?.((settings) => {
  const theme = settings?.theme || "dark";
  document.documentElement.dataset.theme = theme === "system"
    ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")
    : theme;
  if (settings?.accentColor) document.documentElement.style.setProperty("--primary", settings.accentColor);
  document.documentElement.classList.toggle("focus-mode", !!settings?.focusMode);
  document.documentElement.classList.toggle("gx-turbo", settings?.performanceMode === "turbo");
});

(async function init() {
  await refreshProfile();
  updateZoom(100); updateBookmark(false); updateFullscreen(false);
  const result = await safe(() => api.getTabs(), "Could not obtain tabs:");
  if (result) renderTabs(result.tabs || [], result.activeTabId);
  const tab = await safe(() => api.getActiveTab(), "Could not obtain active tab:");
  if (tab) { activeTabId = tab.id; applyState(tab); }
})();