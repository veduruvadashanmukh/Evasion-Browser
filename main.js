const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  shell,
  dialog,
  clipboard,
  session,
  safeStorage,
  net
} = require("electron");

const path = require("path");
const os = require("os");
const crypto = require("crypto");
const fs = require("fs/promises");
const { pathToFileURL, fileURLToPath } = require("url");
const { VaultService, generatePassword, strength } = require("./password-manager/vault-service");
const { BrowserStore } = require("./browser-store");
const { ProfileService } = require("./profile-service");

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (error) {
  console.warn("Automatic updater unavailable:", error.message);
}


const UPDATE_REPOSITORY = "veduruvadashanmukh/Evasion-Browser";
const UPDATE_RELEASES_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`;

function versionParts(value) {
  return String(value || "0").replace(/^v/i, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
}

function isNewerVersion(candidate, current = app.getVersion()) {
  const next = versionParts(candidate);
  const now = versionParts(current);
  for (let index = 0; index < Math.max(next.length, now.length); index += 1) {
    const difference = (next[index] || 0) - (now[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

async function fetchUpdateInfo() {
  try {
    const response = await net.fetch(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`, {
      headers: { "User-Agent": "Evasion-Browser-Updater", Accept: "application/vnd.github+json" }
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    const release = await response.json();
    const version = String(release.tag_name || "").replace(/^v/i, "");
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const preferredAsset = assets.find((asset) => /Offline-Setup.*x64\.exe$/i.test(asset.name))
      || assets.find((asset) => /Setup.*\.exe$/i.test(asset.name))
      || assets.find((asset) => /Portable.*\.exe$/i.test(asset.name));
    return {
      success: true, currentVersion: app.getVersion(), latestVersion: version || app.getVersion(),
      updateAvailable: Boolean(version) && isNewerVersion(version),
      name: release.name || `Evasion Browser ${version}`, notes: release.body || "Performance, privacy and interface improvements.",
      publishedAt: release.published_at || null,
      downloadUrl: preferredAsset?.browser_download_url || release.html_url || UPDATE_RELEASES_URL,
      releaseUrl: release.html_url || UPDATE_RELEASES_URL
    };
  } catch (error) {
    return { success: false, currentVersion: app.getVersion(), latestVersion: app.getVersion(), updateAvailable: false, error: error.message, releaseUrl: UPDATE_RELEASES_URL };
  }
}

const APP_ICON = process.platform === "win32"
  ? path.join(__dirname, "assets", "branding", "evasion-icon.ico")
  : path.join(__dirname, "assets", "branding", "evasion-mark-512.png");

const HOME_FILE = path.join(
  __dirname,
  "pages",
  "home.html"
);

const HOME_URL =
  pathToFileURL(HOME_FILE).toString();

const INCOGNITO_HOME_FILE = path.join(
  __dirname,
  "pages",
  "incognito.html"
);

const INCOGNITO_HOME_URL =
  pathToFileURL(INCOGNITO_HOME_FILE).toString();

const TOOLBAR_HEIGHT = 82;

const ZOOM = {
  min: 0.25,
  max: 5,
  step: 0.1
};

const contexts = new Map();
const bookmarks = new Map();
const history = [];
const downloads = [];

const configuredSessions =
  new WeakSet();

let nextTabId = 1;
let vault = null;
let passwordWindow = null;
let browserStore = null;
let profileService = null;
let profileWindow = null;
let browserSettings = {};
const securityStats = { blockedAds: 0, blockedTrackers: 0, blockedMiners: 0, blockedOther: 0, startedAt: Date.now() };
const managerWindows = new Map();
const loadedExtensions = new Map();

const updaterState = {
  supported: Boolean(autoUpdater),
  status: "idle",
  currentVersion: app.getVersion(),
  availableVersion: "",
  downloadedVersion: "",
  percent: 0,
  error: ""
};

function broadcastUpdaterState(extra = {}) {
  Object.assign(updaterState, extra);
  const payload = { ...updaterState };
  for (const ctx of contexts.values()) send(ctx, "browser-update-status", payload);
  for (const record of managerWindows.values()) {
    const win = record?.window || record;
    if (
      win &&
      typeof win.isDestroyed === "function" &&
      !win.isDestroyed() &&
      win.webContents &&
      !win.webContents.isDestroyed()
    ) {
      win.webContents.send("manager-update-status", payload);
    }
  }
  return payload;
}

async function rememberInstalledVersion() {
  if (!browserStore) return;
  const advanced = browserStore.data.advanced || (browserStore.data.advanced = {});
  const previous = String(advanced.lastLaunchedVersion || "");
  const current = app.getVersion();
  advanced.lastLaunchedVersion = current;
  if (advanced.pendingUpdateVersion === current) advanced.pendingUpdateVersion = "";
  await browserStore.save();
  if (previous && previous !== current && browserSettings.showWhatsNew !== false) {
    setTimeout(() => {
      for (const ctx of contexts.values()) {
        send(ctx, "browser-updated", { previousVersion: previous, currentVersion: current });
      }
    }, 1600).unref?.();
  }
}

function configureAutomaticUpdater() {
  if (!autoUpdater || !app.isPackaged) {
    return broadcastUpdaterState({
      supported: Boolean(autoUpdater),
      status: app.isPackaged ? "unavailable" : "development"
    });
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = browserSettings.updateChannel === "beta";
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () =>
    broadcastUpdaterState({ status: "checking", error: "", percent: 0 }));

  autoUpdater.on("update-available", (info) =>
    broadcastUpdaterState({
      status: "downloading",
      availableVersion: String(info?.version || ""),
      error: ""
    }));

  autoUpdater.on("update-not-available", () =>
    broadcastUpdaterState({
      status: "up-to-date",
      availableVersion: "",
      percent: 0,
      error: ""
    }));

  autoUpdater.on("download-progress", (progress) =>
    broadcastUpdaterState({
      status: "downloading",
      percent: Math.max(0, Math.min(100, Math.round(Number(progress?.percent || 0))))
    }));

  autoUpdater.on("update-downloaded", async (info) => {
    const version = String(info?.version || updaterState.availableVersion || "");
    broadcastUpdaterState({
      status: "ready-on-quit",
      downloadedVersion: version,
      availableVersion: version,
      percent: 100,
      error: ""
    });
    if (browserStore) {
      browserStore.data.advanced.pendingUpdateVersion = version;
      browserStore.data.advanced.lastUpdateError = "";
      await browserStore.save();
    }
  });

  autoUpdater.on("error", async (error) => {
    const message = String(error?.message || error || "Update failed.");
    broadcastUpdaterState({ status: "error", error: message });
    if (browserStore) {
      browserStore.data.advanced.lastUpdateError = message;
      await browserStore.save();
    }
  });

  return broadcastUpdaterState();
}

async function checkAutomaticUpdate() {
  if (!autoUpdater || !app.isPackaged || browserSettings.autoUpdateEnabled === false) {
    return { ...updaterState };
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    broadcastUpdaterState({ status: "error", error: error.message });
  }
  return { ...updaterState };
}

const ctxFrom = (event) =>
  contexts.get(event.sender.id) || null;

const windowReady = (ctx) =>
  Boolean(
    ctx?.window &&
    !ctx.window.isDestroyed()
  );

const activeTab = (ctx) =>
  windowReady(ctx)
    ? ctx.tabs.get(ctx.activeTabId) || null
    : null;

const tabReady = (tab) =>
  Boolean(
    tab?.view?.webContents &&
    !tab.view.webContents.isDestroyed()
  );

const activeWC = (ctx) => {
  const tab = activeTab(ctx);

  return tabReady(tab)
    ? tab.view.webContents
    : null;
};

const send = (
  ctx,
  channel,
  payload
) => {
  if (windowReady(ctx)) {
    ctx.window.webContents.send(
      channel,
      payload
    );
  }
};

const esc = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function isHomeRequest(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase();

  return [
    "",
    "home",
    "evasion://home",
    "devika://home",
    "browser://home"
  ].includes(input);
}

function isTrustedLocalBrowserPage(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "file:") return false;

    const requestedPath = path.normalize(fileURLToPath(url));
    return (
      requestedPath === path.normalize(HOME_FILE) ||
      requestedPath === path.normalize(INCOGNITO_HOME_FILE)
    );
  } catch {
    return false;
  }
}

function isHomePageURL(value) {
  try {
    const url = new URL(String(value || ""));
    return (
      url.protocol === "file:" &&
      path.normalize(fileURLToPath(url)) === path.normalize(HOME_FILE)
    );
  } catch {
    return false;
  }
}

function isIncognitoHomePageURL(value) {
  try {
    const url = new URL(String(value || ""));
    return (
      url.protocol === "file:" &&
      path.normalize(fileURLToPath(url)) === path.normalize(INCOGNITO_HOME_FILE)
    );
  } catch {
    return false;
  }
}

function createURL(input) {
  const value =
    String(input || "").trim();

  if (isHomeRequest(value)) {
    return HOME_URL;
  }

  // Preserve trusted local browser pages, including profile query
  // parameters such as home.html?profileName=...
  if (isTrustedLocalBrowserPage(value)) {
    return value;
  }

  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  if (value.includes(" ") || !value.includes(".")) {
    const query = encodeURIComponent(value);
    const engines = {
      google: `https://www.google.com/search?q=${query}`,
      bing: `https://www.bing.com/search?q=${query}`,
      duckduckgo: `https://duckduckgo.com/?q=${query}`,
      brave: `https://search.brave.com/search?q=${query}`
    };
    if (browserSettings.searchEngine === "custom" && browserSettings.customSearchUrl?.includes("%s")) {
      return browserSettings.customSearchUrl.replace("%s", query);
    }
    return engines[browserSettings.searchEngine] || engines.google;
  }

  return `https://${value}`;
}

function isAllowedURL(value) {
  try {
    const url = new URL(value);

    return (
      url.protocol === "http:" ||
      url.protocol === "https:" ||
      (
        url.protocol === "file:" &&
        isTrustedLocalBrowserPage(url.href)
      )
    );
  } catch {
    return false;
  }
}

function serializeTab(ctx, tab) {
  if (!tabReady(tab)) {
    return null;
  }

  const webContents =
    tab.view.webContents;

  const url =
    webContents.getURL();

  return {
    id: tab.id,

    title:
      webContents.getTitle() ||
      tab.title ||
      "New Tab",

    url,

    favicon:
      tab.favicon || "",

    isLoading:
      webContents.isLoading(),

    isActive:
      ctx.activeTabId === tab.id,

    canGoBack:
      webContents.navigationHistory
        .canGoBack(),

    canGoForward:
      webContents.navigationHistory
        .canGoForward(),

    isHomePage:
      url === HOME_URL || url === INCOGNITO_HOME_URL,

    isBookmarked:
      bookmarks.has(url),

    zoomPercentage:
      Math.round(
        webContents.getZoomFactor() *
        100
      ),

    isAudible:
      typeof webContents.isCurrentlyAudible ===
      "function"
        ? webContents.isCurrentlyAudible()
        : false,

    isMuted: webContents.isAudioMuted(),
    groupId: tab.groupId || null,
    groupName: tab.groupId ? ctx.groups.get(tab.groupId)?.name || "" : "",
    groupColor: tab.groupId ? ctx.groups.get(tab.groupId)?.color || "" : "",
    isSleeping: Boolean(tab.sleeping),
    lastActiveAt: tab.lastActiveAt || Date.now()
  };
}

const tabsSnapshot = (ctx) =>
  windowReady(ctx)
    ? ctx.tabOrder
        .map((tabId) =>
          serializeTab(
            ctx,
            ctx.tabs.get(tabId)
          )
        )
        .filter(Boolean)
    : [];

function sendTabs(ctx) {
  send(
    ctx,
    "browser-tabs-updated",
    {
      tabs: tabsSnapshot(ctx),

      activeTabId:
        ctx.activeTabId,

      canRestoreClosedTab:
        ctx.closedTabs.length > 0
    }
  );
}

function sendActiveState(ctx) {
  const tab = activeTab(ctx);

  if (!tabReady(tab)) {
    return;
  }

  const webContents =
    tab.view.webContents;

  const url =
    webContents.getURL();

  send(
    ctx,
    "browser-state-updated",
    {
      tabId: tab.id,

      url,

      title:
        webContents.getTitle() ||
        "New Tab",

      favicon:
        tab.favicon || "",

      canGoBack:
        webContents.navigationHistory
          .canGoBack(),

      canGoForward:
        webContents.navigationHistory
          .canGoForward(),

      isLoading:
        webContents.isLoading(),

      isHomePage:
        url === HOME_URL || url === INCOGNITO_HOME_URL,

      isBookmarked:
        bookmarks.has(url),

      isIncognito:
        ctx.isIncognito
    }
  );
}

const sendZoom = (ctx) => {
  const webContents = activeWC(ctx);

  send(
    ctx,
    "browser-zoom-updated",
    webContents
      ? Math.round(
          webContents.getZoomFactor() *
          100
        )
      : 100
  );
};

function setTabBounds(ctx, tab) {
  if (
    !windowReady(ctx) ||
    !tabReady(tab)
  ) {
    return;
  }

  const [width, height] =
    ctx.window.getContentSize();

  const visible =
    !ctx.overlayVisible &&
    ctx.activeTabId === tab.id;

  tab.view.setBounds(
    visible
      ? {
          x: 0,
          y: TOOLBAR_HEIGHT,
          width,
          height: Math.max(
            0,
            height - TOOLBAR_HEIGHT
          )
        }
      : {
          x: 0,
          y: height,
          width,
          height: 0
        }
  );
}

function resizeTabs(ctx) {
  if (!windowReady(ctx)) {
    return;
  }

  for (const tab of ctx.tabs.values()) {
    setTabBounds(ctx, tab);
  }
}

async function loadHome(tab, ctx = null) {
  if (!tabReady(tab)) return;

  const file = ctx?.isIncognito
    ? INCOGNITO_HOME_FILE
    : HOME_FILE;

  try {
    const profile = !ctx?.isIncognito && profileService?.unlocked ? profileService.publicProfile() : null;
    await tab.view.webContents.loadFile(file, profile ? {
      query: {
        profileName: profile.name || "",
        profileEmail: profile.email || "",
        profileColor: profile.avatarColor || "#845cff"
      }
    } : undefined);
  } catch (error) {
    if (error.code !== "ERR_ABORTED") {
      console.error("Homepage error:", error.message);
    }
  }
}

async function navigateTab(
  tab,
  input,
  ctx = null
) {
  if (!tabReady(tab)) {
    return;
  }

  let destination =
    createURL(input);

  if (browserSettings.httpsFirst && /^http:\/\//i.test(destination)) {
    destination = destination.replace(/^http:/i, "https:");
  }

  if (isHomePageURL(destination) || isIncognitoHomePageURL(destination)) {
    return loadHome(tab, ctx);
  }

  if (!isAllowedURL(destination)) {
    console.error(
      "Blocked URL:",
      destination
    );

    return;
  }

  try {
    await tab.view.webContents.loadURL(
      destination
    );
  } catch (error) {
    if (error.code !== "ERR_ABORTED") {
      console.error(
        "Navigation error:",
        error.message
      );
    }
  }
}

const navigateActive = (
  ctx,
  input
) => {
  const tab = activeTab(ctx);

  return tab
    ? navigateTab(tab, input, ctx)
    : undefined;
};

function recordHistory(ctx, tab) {
  if (
    !windowReady(ctx) ||
    ctx.isIncognito ||
    !tabReady(tab)
  ) {
    return;
  }

  const webContents =
    tab.view.webContents;

  const url =
    webContents.getURL();

  if (!/^https?:\/\//.test(url)) {
    return;
  }

  history.push({
    url,

    title:
      webContents.getTitle() ||
      url,

    visitedAt:
      Date.now()
  });

  if (history.length > 1000) history.splice(0, history.length - 1000);
  if (browserStore) { browserStore.data.history = history.slice(); browserStore.save(); }
}
function configureDownloads(browserSession) {
  if (configuredSessions.has(browserSession)) {
    return;
  }

  configuredSessions.add(browserSession);

  browserSession.on(
    "will-download",
    (_event, item) => {
      const record = {
        filename: item.getFilename(),
        path: "",
        state: "progressing"
      };

      downloads.push(record);
      if (browserSettings.downloadPath && !browserSettings.askDownloadLocation) {
        item.setSavePath(path.join(browserSettings.downloadPath, item.getFilename()));
      }

      item.on("updated", () => {
        record.state = item.isPaused()
          ? "paused"
          : "progressing";
      });

      item.once(
        "done",
        (_event, state) => {
          record.state = state;
          record.path =
            item.getSavePath() || "";
        }
      );
    }
  );
}

function createInternalHTML(
  title,
  heading,
  content
) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width,initial-scale=1"
>

<title>${esc(title)}</title>

<style>
* {
  box-sizing: border-box;
}

body {
  min-height: 100vh;
  margin: 0;
  padding: 45px 24px;

  color: #172033;

  background:
    linear-gradient(
      145deg,
      #edf3ff,
      #fafcff
    );

  font-family:
    Arial,
    Helvetica,
    sans-serif;
}

main {
  width: min(850px, 100%);
  margin: auto;
}

h1 {
  margin: 0 0 8px;
  font-size: 34px;
}

.subtitle {
  margin: 0 0 28px;
  color: #687188;
}

.card {
  margin-bottom: 12px;
  padding: 17px;

  border:
    1px solid
    rgba(67, 82, 130, 0.15);

  border-radius: 16px;

  background:
    rgba(255, 255, 255, 0.86);

  box-shadow:
    0 8px 24px
    rgba(36, 51, 98, 0.08);
}

.card strong {
  display: block;
  margin-bottom: 6px;
}

.card a {
  color: #4656d8;
  text-decoration: none;
  word-break: break-all;
}

.card small {
  color: #6f7890;
}

.empty {
  padding: 40px 20px;

  border:
    1px dashed
    rgba(67, 82, 130, 0.3);

  border-radius: 18px;

  color: #6f7890;
  text-align: center;
}
</style>
</head>

<body>
<main>
  <h1>${esc(heading)}</h1>

  <p class="subtitle">
    Evasion Browser
  </p>

  ${content}
</main>
</body>
</html>`;
}

async function loadInternal(
  ctx,
  title,
  heading,
  content
) {
  const tab = activeTab(ctx);

  if (!tabReady(tab)) {
    return;
  }

  const html =
    createInternalHTML(
      title,
      heading,
      content
    );

  const dataURL =
    "data:text/html;charset=UTF-8," +
    encodeURIComponent(html);

  try {
    await tab.view.webContents.loadURL(
      dataURL
    );
  } catch (error) {
    if (error.code !== "ERR_ABORTED") {
      console.error(
        "Internal page error:",
        error.message
      );
    }
  }
}

function openHistory(ctx) {
  const content =
    history
      .slice()
      .reverse()
      .map(
        (item) => `
          <article class="card">
            <strong>
              ${esc(item.title || item.url)}
            </strong>

            <a href="${esc(item.url)}">
              ${esc(item.url)}
            </a>

            <br>

            <small>
              ${esc(
                new Date(
                  item.visitedAt
                ).toLocaleString()
              )}
            </small>
          </article>
        `
      )
      .join("") ||
    `
      <div class="empty">
        No browsing history yet.
      </div>
    `;

  return loadInternal(
    ctx,
    "History",
    "Browsing history",
    content
  );
}

function openBookmarks(ctx) {
  const content =
    [...bookmarks.values()]
      .map(
        (item) => `
          <article class="card">
            <strong>
              ${esc(item.title || item.url)}
            </strong>

            <a href="${esc(item.url)}">
              ${esc(item.url)}
            </a>
          </article>
        `
      )
      .join("") ||
    `
      <div class="empty">
        No bookmarks have been added.
      </div>
    `;

  return loadInternal(
    ctx,
    "Bookmarks",
    "Bookmarks",
    content
  );
}

function openDownloads(ctx) {
  const content =
    downloads
      .slice()
      .reverse()
      .map(
        (item) => `
          <article class="card">
            <strong>
              ${esc(item.filename)}
            </strong>

            <small>
              Status: ${esc(item.state)}
            </small>

            <br>

            <small>
              ${esc(item.path || "")}
            </small>
          </article>
        `
      )
      .join("") ||
    `
      <div class="empty">
        No downloads yet.
      </div>
    `;

  return loadInternal(
    ctx,
    "Downloads",
    "Downloads",
    content
  );
}

const infoPage = (
  ctx,
  title,
  message
) =>
  loadInternal(
    ctx,
    title,
    title,
    `
      <div class="card">
        ${esc(message)}
      </div>
    `
  );

function attachTabEvents(ctx, tab) {
  const webContents =
    tab.view.webContents;

  const refresh = () => {
    send(
      ctx,
      "browser-tab-updated",
      serializeTab(ctx, tab)
    );

    sendTabs(ctx);

    if (ctx.activeTabId === tab.id) {
      sendActiveState(ctx);
    }
  };

  webContents.on(
    "did-start-loading",
    refresh
  );

  webContents.on(
    "did-stop-loading",
    refresh
  );

  webContents.on(
    "did-navigate",
    () => {
      recordHistory(ctx, tab);
      refresh();
    }
  );

  webContents.on(
    "did-navigate-in-page",
    refresh
  );

  webContents.on(
    "page-title-updated",
    (_event, title) => {
      tab.title =
        title || "New Tab";

      refresh();
    }
  );

  webContents.on(
    "page-favicon-updated",
    (_event, favicons) => {
      tab.favicon =
        favicons?.[0] || "";

      refresh();
    }
  );

  webContents.on(
    "audio-state-changed",
    refresh
  );

  webContents.on(
    "found-in-page",
    (_event, result) => {
      if (ctx.activeTabId === tab.id) {
        send(
          ctx,
          "browser-find-result",
          result
        );
      }
    }
  );

  webContents.on("will-navigate", (event, url) => {
    if (url === "evasion://performance" || url === "evasion://control") {
      event.preventDefault();
      openManagerWindow("gaming", ctx);
    }
  });

  webContents.on(
    "did-fail-load",
    (
      _event,
      code,
      description,
      url,
      isMainFrame
    ) => {
      if (isMainFrame && code !== -3) {
        console.error(
          `Load failed: ${url}`,
          description
        );

        refresh();
      }
    }
  );

  webContents.setWindowOpenHandler(
    ({ url, disposition }) => {
      if (isAllowedURL(url)) {
        createTab(ctx, {
          url,
          activate:
            disposition !==
            "background-tab"
        });
      } else {
        shell
          .openExternal(url)
          .catch((error) => {
            console.error(
              "External link error:",
              error.message
            );
          });
      }

      return {
        action: "deny"
      };
    }
  );
}

function createTab(
  ctx,
  {
    url = HOME_URL,
    activate = true,
    index = null
  } = {}
) {
  if (!windowReady(ctx)) {
    return null;
  }

  const tab = {
    id: nextTabId++,
    title: "New Tab",
    favicon: "",
    groupId: null,
    lastActiveAt: Date.now(),
    sleeping: false,
    sleepURL: "",

    view: new WebContentsView({
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        backgroundThrottling: performancePolicy().backgroundThrottling,
        session: ctx.session
      }
    })
  };

  ctx.tabs.set(tab.id, tab);

  if (
    Number.isInteger(index) &&
    index >= 0 &&
    index <= ctx.tabOrder.length
  ) {
    ctx.tabOrder.splice(
      index,
      0,
      tab.id
    );
  } else {
    ctx.tabOrder.push(tab.id);
  }

  ctx.window.contentView.addChildView(
    tab.view
  );

  attachTabEvents(ctx, tab);
  tab.view.webContents.setZoomFactor(Math.max(0.5, Math.min(3, Number(browserSettings.defaultZoom || 100) / 100)));

  if (activate) {
    switchTab(ctx, tab.id);
  } else {
    setTabBounds(ctx, tab);
  }

  if (
    !url ||
    url === HOME_URL ||
    isHomeRequest(url)
  ) {
    loadHome(tab, ctx);
  } else {
    navigateTab(tab, url, ctx);
  }

  send(
    ctx,
    "browser-tab-created",
    serializeTab(ctx, tab)
  );

  sendTabs(ctx);

  return tab;
}
function switchTab(ctx, tabId) {
  const id = Number(tabId);

  if (
    !windowReady(ctx) ||
    !ctx.tabs.has(id)
  ) {
    return null;
  }

  const target = ctx.tabs.get(id);
  if (target?.sleeping) wakeTab(ctx, id);
  ctx.activeTabId = id;
  if (target) target.lastActiveAt = Date.now();

  resizeTabs(ctx);
  sendTabs(ctx);

  send(
    ctx,
    "browser-active-tab-changed",
    {
      activeTabId: id,

      tab: serializeTab(
        ctx,
        ctx.tabs.get(id)
      )
    }
  );

  sendActiveState(ctx);
  sendZoom(ctx);

  return serializeTab(
    ctx,
    ctx.tabs.get(id)
  );
}

function closeTab(
  ctx,
  tabId,
  saveClosed = true
) {
  const id = Number(tabId);

  if (
    !windowReady(ctx) ||
    !ctx.tabs.has(id)
  ) {
    return {
      success: false
    };
  }

  const tab = ctx.tabs.get(id);

  if (browserSettings.autoShredOnClose && tabReady(tab)) {
    try {
      const origin = new URL(tab.view.webContents.getURL()).origin;
      if (/^https?:/.test(origin)) ctx.session.clearStorageData({ origin, storages: ["cookies","localstorage","indexdb","serviceworkers","cachestorage"] }).catch(() => {});
    } catch {}
  }

  const oldIndex =
    ctx.tabOrder.indexOf(id);

  if (
    saveClosed &&
    tabReady(tab)
  ) {
    const url =
      tab.view.webContents.getURL();

    ctx.closedTabs.unshift({
      url:
        url &&
        !url.startsWith(
          "data:text/html"
        )
          ? url
          : (ctx.isIncognito ? INCOGNITO_HOME_URL : HOME_URL),

      title:
        tab.view.webContents.getTitle() ||
        "New Tab"
    });

    ctx.closedTabs =
      ctx.closedTabs.slice(0, 25);
  }

  ctx.tabs.delete(id);

  ctx.tabOrder =
    ctx.tabOrder.filter(
      (value) => value !== id
    );

  try {
    ctx.window.contentView.removeChildView(
      tab.view
    );
  } catch {
    // View may already be removed.
  }

  if (tabReady(tab)) {
    try {
      tab.view.webContents.close();
    } catch {
      // Web contents may already be closed.
    }
  }

  send(
    ctx,
    "browser-tab-closed",
    {
      tabId: id
    }
  );

  if (!ctx.tabOrder.length) {
    createTab(ctx);
  } else if (
    ctx.activeTabId === id
  ) {
    const nextIndex =
      Math.min(
        oldIndex,
        ctx.tabOrder.length - 1
      );

    switchTab(
      ctx,
      ctx.tabOrder[nextIndex]
    );
  } else {
    sendTabs(ctx);
  }

  return {
    success: true,
    activeTabId: ctx.activeTabId
  };
}

function closeOtherTabs(
  ctx,
  keepTabId
) {
  const keepId =
    Number(keepTabId);

  if (
    !windowReady(ctx) ||
    !ctx.tabs.has(keepId)
  ) {
    return {
      success: false
    };
  }

  const tabIds =
    ctx.tabOrder.filter(
      (tabId) => tabId !== keepId
    );

  for (const tabId of tabIds) {
    closeTab(
      ctx,
      tabId,
      false
    );
  }

  switchTab(ctx, keepId);

  return {
    success: true,
    closedCount: tabIds.length
  };
}

function closeTabsToRight(
  ctx,
  tabId
) {
  const id = Number(tabId);

  const tabIndex =
    ctx?.tabOrder.indexOf(id);

  if (
    !windowReady(ctx) ||
    tabIndex < 0
  ) {
    return {
      success: false
    };
  }

  const tabIds =
    ctx.tabOrder.slice(
      tabIndex + 1
    );

  for (
    const rightTabId of tabIds
  ) {
    closeTab(
      ctx,
      rightTabId,
      false
    );
  }

  sendTabs(ctx);

  return {
    success: true,
    closedCount: tabIds.length
  };
}

function duplicateTab(
  ctx,
  tabId
) {
  const id = Number(tabId);

  const source =
    ctx?.tabs.get(id);

  if (!tabReady(source)) {
    return null;
  }

  const url =
    source.view.webContents.getURL();

  return createTab(ctx, {
    url:
      url &&
      !url.startsWith(
        "data:text/html"
      )
        ? url
        : (ctx.isIncognito ? INCOGNITO_HOME_URL : HOME_URL),

    activate: true,

    index:
      ctx.tabOrder.indexOf(id) + 1
  });
}

function restoreClosedTab(ctx) {
  const closed =
    ctx?.closedTabs.shift();

  if (!closed) {
    return null;
  }

  return createTab(ctx, {
    url: closed.url,
    activate: true
  });
}

function moveTab(
  ctx,
  tabId,
  newIndex
) {
  const id = Number(tabId);

  const oldIndex =
    ctx?.tabOrder.indexOf(id);

  if (oldIndex < 0) {
    return {
      success: false
    };
  }

  const safeIndex =
    Math.max(
      0,
      Math.min(
        Number(newIndex),
        ctx.tabOrder.length - 1
      )
    );

  ctx.tabOrder.splice(
    oldIndex,
    1
  );

  ctx.tabOrder.splice(
    safeIndex,
    0,
    id
  );

  sendTabs(ctx);

  return {
    success: true,
    tabs: tabsSnapshot(ctx)
  };
}



function performancePolicy() {
  const totalGB = os.totalmem() / 1073741824;
  const mode = ["eco","balanced","turbo"].includes(browserSettings.performanceMode)
    ? browserSettings.performanceMode : "balanced";
  const lowMemory = Boolean(browserSettings.lowMemoryMode) || totalGB <= 4.5;
  const policies = {
    eco: { sleepMinutes: 2, backgroundThrottling: true, maxAwakeTabs: lowMemory ? 4 : 8 },
    balanced: { sleepMinutes: lowMemory ? 5 : 15, backgroundThrottling: true, maxAwakeTabs: lowMemory ? 6 : 14 },
    turbo: { sleepMinutes: lowMemory ? 10 : 30, backgroundThrottling: false, maxAwakeTabs: lowMemory ? 8 : 24 }
  };
  return { mode, lowMemory, ...policies[mode] };
}

function applyPerformancePolicy(ctx = null) {
  const policy = performancePolicy();
  const targets = ctx ? [ctx] : [...contexts.values()];
  for (const current of targets) {
    if (!windowReady(current)) continue;
    for (const tab of current.tabs.values()) {
      if (!tabReady(tab)) continue;
      try { tab.view.webContents.setBackgroundThrottling(policy.backgroundThrottling); } catch {}
    }
    if (browserSettings.memorySaver) {
      sleepInactiveTabs(current, Math.min(Number(browserSettings.sleepingTabsMinutes || policy.sleepMinutes), policy.sleepMinutes));
      const awake = [...current.tabs.values()]
        .filter((tab) => tabReady(tab) && !tab.sleeping && tab.id !== current.activeTabId)
        .sort((a,b)=>(a.lastActiveAt||0)-(b.lastActiveAt||0));
      while (awake.length > policy.maxAwakeTabs - 1) {
        const tab = awake.shift();
        if (tab) sleepTab(current, tab.id);
      }
    }
  }
  return policy;
}

function sleepTab(ctx, tabId) {
  const tab = ctx?.tabs.get(Number(tabId));
  if (!tabReady(tab) || ctx.activeTabId === tab.id || tab.sleeping) return { success: false };
  const url = tab.view.webContents.getURL();
  if (!/^https?:\/\//.test(url)) return { success: false };
  tab.sleepURL = url;
  tab.sleeping = true;
  tab.title = tab.view.webContents.getTitle() || tab.title || "Sleeping tab";
  tab.view.webContents.setAudioMuted(true);
  tab.view.webContents.loadURL("about:blank").catch(() => {});
  sendTabs(ctx);
  return { success: true, tabId: tab.id };
}

function wakeTab(ctx, tabId) {
  const tab = ctx?.tabs.get(Number(tabId));
  if (!tabReady(tab) || !tab.sleeping) return { success: false };
  const url = tab.sleepURL || (ctx.isIncognito ? INCOGNITO_HOME_URL : HOME_URL);
  tab.sleeping = false;
  tab.sleepURL = "";
  tab.view.webContents.setAudioMuted(false);
  if (isHomePageURL(url) || isIncognitoHomePageURL(url)) loadHome(tab, ctx);
  else tab.view.webContents.loadURL(url).catch(() => {});
  sendTabs(ctx);
  return { success: true, tabId: tab.id };
}

function sleepInactiveTabs(ctx, olderThanMinutes = null) {
  if (!windowReady(ctx)) return { success: false, slept: 0 };
  const minutes = Math.max(1, Number(olderThanMinutes || browserSettings.sleepingTabsMinutes || 20));
  const cutoff = Date.now() - minutes * 60000;
  let slept = 0;
  for (const tab of ctx.tabs.values()) {
    if (tab.id !== ctx.activeTabId && !tab.sleeping && (tab.lastActiveAt || 0) < cutoff && sleepTab(ctx, tab.id).success) slept++;
  }
  return { success: true, slept };
}

async function shredCurrentSite(ctx) {
  const wc = activeWC(ctx);
  if (!wc) return { success: false, error: "No active page." };
  let origin;
  try { origin = new URL(wc.getURL()).origin; } catch { return { success: false, error: "This page has no website data." }; }
  if (!/^https?:/.test(origin)) return { success: false, error: "Only websites can be shredded." };
  await ctx.session.clearStorageData({ origin, storages: ["cookies","localstorage","indexdb","serviceworkers","cachestorage","websql"] });
  for (let i = history.length - 1; i >= 0; i--) { try { if (new URL(history[i].url).origin === origin) history.splice(i, 1); } catch {} }
  if (browserStore && !ctx.isIncognito) { browserStore.data.history = history.slice(); await browserStore.save(); }
  wc.reload();
  return { success: true, origin };
}

function advancedSnapshot(ctx) {
  const allTabs = tabsSnapshot(ctx);
  return {
    settings: {
      sleepingTabsMinutes: Number(browserSettings.sleepingTabsMinutes || 20),
      streamingMode: Boolean(browserSettings.streamingMode),
      gamingSessionMode: Boolean(browserSettings.gamingSessionMode),
      memorySaver: Boolean(browserSettings.memorySaver)
    },
    tabs: allTabs,
    sleepingCount: allTabs.filter((tab) => tab.isSleeping).length,
    audibleTabs: allTabs.filter((tab) => tab.isAudible),
    knowledgeVault: browserStore?.data.knowledgeVault || [],
    security: { ...securityStats, total: securityStats.blockedAds + securityStats.blockedTrackers + securityStats.blockedMiners + securityStats.blockedOther },
    system: { platform: process.platform, cpuCount: os.cpus().length, totalMemory: os.totalmem(), freeMemory: os.freemem(), uptime: os.uptime() }
  };
}

function createWindow({
  isIncognito = false
} = {}) {
  const partition =
    isIncognito
      ? `evasion-incognito-${Date.now()}-${Math.random()}`
      : "persist:evasion-browser";

  const browserSession =
    session.fromPartition(
      partition
    );

  configureDownloads(browserSession);
  applyPrivacyConfiguration(browserSession);

  const window =
    new BrowserWindow({
      icon: APP_ICON,
      width: 1280,
      height: 820,

      minWidth: 800,
      minHeight: 550,

      title:
        isIncognito
          ? "Evasion Browser — Incognito"
          : "Evasion Browser",

      backgroundColor:
        isIncognito
          ? "#28233a"
          : "#f1f3f4",

      webPreferences: {
        preload: path.join(
          __dirname,
          "preload.js"
        ),

        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });

  window.setMenuBarVisibility(
    false
  );

  /*
   * Save this ID before the window is destroyed.
   * This prevents the "Object has been destroyed"
   * error during cleanup.
   */
  const windowWebContentsId =
    window.webContents.id;

  const ctx = {
    window,
    session: browserSession,
    isIncognito,

    tabs: new Map(),
    tabOrder: [],

    activeTabId: null,
    closedTabs: [],
    groups: new Map((browserStore?.data.groups || []).map((group) => [group.id, { ...group }])),
    restoredInitialTabs: false,

    overlayVisible: false,
    streamingMode: Boolean(browserSettings.streamingMode),
    gamingSessionMode: Boolean(browserSettings.gamingSessionMode)
  };

  contexts.set(
    windowWebContentsId,
    ctx
  );

  window.loadFile(
    "index.html"
  );

  [
    "resize",
    "maximize",
    "unmaximize"
  ].forEach((eventName) => {
    window.on(
      eventName,
      () => resizeTabs(ctx)
    );
  });

  window.on(
    "enter-full-screen",
    () => {
      send(
        ctx,
        "browser-fullscreen-changed",
        true
      );
    }
  );

  window.on(
    "leave-full-screen",
    () => {
      send(
        ctx,
        "browser-fullscreen-changed",
        false
      );
    }
  );

  window.webContents.on(
    "did-finish-load",
    () => {
      if (!ctx.tabOrder.length && !ctx.restoredInitialTabs) {
        ctx.restoredInitialTabs = true;
        const saved = (!isIncognito && browserSettings.restoreSession && browserSettings.startup === "restore")
          ? (browserStore?.data.sessionTabs || []).filter((item) => item?.url) : [];
        if (saved.length) {
          saved.forEach((item, index) => {
            const tab = createTab(ctx, { url: item.url, activate: index === saved.length - 1 });
            if (tab && item.groupId && ctx.groups.has(item.groupId)) tab.groupId = item.groupId;
          });
        } else createTab(ctx, { url: isIncognito ? INCOGNITO_HOME_URL : HOME_URL });
      }

      send(ctx, "browser-settings-updated", browserSettings);
      sendTabs(ctx);
      sendActiveState(ctx);
      sendZoom(ctx);
    }
  );

  window.on(
    "closed",
    () => {
      contexts.delete(windowWebContentsId);
      if (!ctx.isIncognito && browserStore && browserSettings.restoreSession) {
        browserStore.data.sessionTabs = ctx.tabOrder.map((id) => {
          const tab = ctx.tabs.get(id);
          if (!tabReady(tab)) return null;
          const url = tab.view.webContents.getURL();
          return url && !url.startsWith("data:") ? { url, groupId: tab.groupId || null } : { url: HOME_URL, groupId: tab.groupId || null };
        }).filter(Boolean);
        browserStore.data.groups = [...ctx.groups.values()];
        browserStore.save();
      }

      for (
        const tab of
        ctx.tabs.values()
      ) {
        if (tabReady(tab)) {
          try {
            tab.view.webContents.close();
          } catch {
            // Already closed.
          }
        }
      }

      ctx.tabs.clear();
      ctx.tabOrder = [];
      ctx.closedTabs = [];
      ctx.activeTabId = null;
    }
  );

  return ctx;
}

function setZoom(
  ctx,
  factor
) {
  const webContents =
    activeWC(ctx);

  if (!webContents) {
    return 100;
  }

  const safeFactor =
    Math.min(
      ZOOM.max,
      Math.max(
        ZOOM.min,
        factor
      )
    );

  webContents.setZoomFactor(
    safeFactor
  );

  sendZoom(ctx);
  sendActiveState(ctx);

  return Math.round(
    safeFactor * 100
  );
}

const handle = (
  channel,
  action
) => {
  ipcMain.handle(
    channel,
    action
  );
};

/* Navigation */

handle(
  "browser-navigate",
  (event, input) =>
    navigateActive(
      ctxFrom(event),
      input
    )
);

handle(
  "browser-back",
  (event) => {
    const webContents =
      activeWC(
        ctxFrom(event)
      );

    if (
      webContents?.navigationHistory
        .canGoBack()
    ) {
      webContents
        .navigationHistory
        .goBack();
    }
  }
);

handle(
  "browser-forward",
  (event) => {
    const webContents =
      activeWC(
        ctxFrom(event)
      );

    if (
      webContents?.navigationHistory
        .canGoForward()
    ) {
      webContents
        .navigationHistory
        .goForward();
    }
  }
);

handle(
  "browser-reload",
  (event) =>
    activeWC(
      ctxFrom(event)
    )?.reload()
);

handle(
  "browser-stop",
  (event) =>
    activeWC(
      ctxFrom(event)
    )?.stop()
);

handle(
  "browser-home",
  (event) => {
    const tab =
      activeTab(
        ctxFrom(event)
      );

    return tab
      ? loadHome(tab, ctxFrom(event))
      : undefined;
  }
);

/* Tabs */

handle(
  "browser-new-tab",
  (
    event,
    options = {}
  ) => {
    const ctx =
      ctxFrom(event);

    return serializeTab(
      ctx,
      createTab(ctx, {
        url:
          options.url ||
          (ctx?.isIncognito ? INCOGNITO_HOME_URL : HOME_URL),

        activate:
          options.activate !== false
      })
    );
  }
);

handle(
  "browser-switch-tab",
  (event, tabId) =>
    switchTab(
      ctxFrom(event),
      tabId
    )
);

handle(
  "browser-close-tab",
  (event, tabId) =>
    closeTab(
      ctxFrom(event),
      tabId
    )
);

handle(
  "browser-close-other-tabs",
  (event, tabId) =>
    closeOtherTabs(
      ctxFrom(event),
      tabId
    )
);

handle(
  "browser-close-tabs-to-right",
  (event, tabId) =>
    closeTabsToRight(
      ctxFrom(event),
      tabId
    )
);

handle(
  "browser-duplicate-tab",
  (event, tabId) => {
    const ctx =
      ctxFrom(event);

    return serializeTab(
      ctx,
      duplicateTab(
        ctx,
        tabId
      )
    );
  }
);

handle(
  "browser-restore-closed-tab",
  (event) => {
    const ctx =
      ctxFrom(event);

    return serializeTab(
      ctx,
      restoreClosedTab(ctx)
    );
  }
);

handle(
  "browser-get-tabs",
  (event) => {
    const ctx =
      ctxFrom(event);

    return {
      tabs:
        tabsSnapshot(ctx),

      activeTabId:
        ctx?.activeTabId ||
        null,

      canRestoreClosedTab:
        Boolean(
          ctx?.closedTabs.length
        )
    };
  }
);

handle(
  "browser-get-active-tab",
  (event) => {
    const ctx =
      ctxFrom(event);

    return serializeTab(
      ctx,
      activeTab(ctx)
    );
  }
);

handle(
  "browser-move-tab",
  (event, payload) =>
    moveTab(
      ctxFrom(event),
      payload?.tabId,
      payload?.newIndex
    )
);
/* Windows */

handle(
  "browser-new-window",
  () => ({
    success:
      Boolean(createWindow())
  })
);

handle(
  "browser-new-incognito-window",
  () => ({
    success:
      Boolean(
        createWindow({
          isIncognito: true
        })
      )
  })
);

/* Browser pages */

handle(
  "browser-open-history",
  (event) =>
    openHistory(
      ctxFrom(event)
    )
);

handle(
  "browser-open-downloads",
  (event) =>
    openDownloads(
      ctxFrom(event)
    )
);

handle(
  "browser-open-bookmarks",
  (event) =>
    openBookmarks(
      ctxFrom(event)
    )
);

handle("browser-open-settings", (event) => openManagerWindow("settings", ctxFrom(event)));

handle(
  "browser-open-help",
  (event) => infoPage(ctxFrom(event), "Help", "Use Ctrl+L to focus the address bar, Ctrl+T for a new tab, Ctrl+Shift+T to restore a closed tab, F11 for full screen and F12 for developer tools.")
);

handle("browser-open-passwords", (event) => {
  const ctx = ctxFrom(event);
  return openPasswordManager(windowReady(ctx) ? ctx.window : null);
});

handle("browser-open-extensions", (event) => openManagerWindow("extensions", ctxFrom(event)));
handle("browser-open-tab-groups", (event) => openManagerWindow("tab-groups", ctxFrom(event)));
handle("browser-open-gaming", (event) => openManagerWindow("gaming", ctxFrom(event)));
handle("browser-open-security", (event) => openManagerWindow("security", ctxFrom(event)));
handle("browser-open-tools", (event) => openManagerWindow("tools", ctxFrom(event)));
handle("browser-open-evolution", (event) => openManagerWindow("evolution", ctxFrom(event)));
handle("browser-open-advanced", (event) => openManagerWindow("advanced", ctxFrom(event)));

/* Zoom */

handle(
  "browser-zoom-in",
  (event) => {
    const ctx =
      ctxFrom(event);

    const webContents =
      activeWC(ctx);

    return setZoom(
      ctx,
      (
        webContents?.getZoomFactor() ||
        1
      ) + ZOOM.step
    );
  }
);

handle(
  "browser-zoom-out",
  (event) => {
    const ctx =
      ctxFrom(event);

    const webContents =
      activeWC(ctx);

    return setZoom(
      ctx,
      (
        webContents?.getZoomFactor() ||
        1
      ) - ZOOM.step
    );
  }
);

handle(
  "browser-zoom-reset",
  (event) =>
    setZoom(
      ctxFrom(event),
      1
    )
);

handle(
  "browser-get-zoom",
  (event) => {
    const webContents =
      activeWC(
        ctxFrom(event)
      );

    return webContents
      ? Math.round(
          webContents.getZoomFactor() *
          100
        )
      : 100;
  }
);

/* Full screen */

handle(
  "browser-toggle-fullscreen",
  (event) => {
    const ctx =
      ctxFrom(event);

    if (!windowReady(ctx)) {
      return false;
    }

    const next =
      !ctx.window.isFullScreen();

    ctx.window.setFullScreen(next);

    return next;
  }
);

/* Print */

handle(
  "browser-print",
  (event) => {
    const webContents =
      activeWC(
        ctxFrom(event)
      );

    if (!webContents) {
      return {
        success: false
      };
    }

    return new Promise(
      (resolve) => {
        webContents.print(
          {
            silent: false,
            printBackground: true
          },
          (success, error) => {
            resolve({
              success,

              error:
                success
                  ? null
                  : error
            });
          }
        );
      }
    );
  }
);

/* Save PDF */

handle(
  "browser-save-pdf",
  async (event) => {
    const ctx =
      ctxFrom(event);

    const webContents =
      activeWC(ctx);

    if (
      !windowReady(ctx) ||
      !webContents
    ) {
      return {
        success: false
      };
    }

    const result =
      await dialog.showSaveDialog(
        ctx.window,
        {
          title:
            "Save page as PDF",

          defaultPath:
            "Evasion-Browser-Page.pdf",

          filters: [
            {
              name:
                "PDF document",

              extensions:
                ["pdf"]
            }
          ]
        }
      );

    if (
      result.canceled ||
      !result.filePath
    ) {
      return {
        success: false,
        canceled: true
      };
    }

    try {
      const pdf =
        await webContents.printToPDF({
          printBackground: true
        });

      await fs.writeFile(
        result.filePath,
        pdf
      );

      return {
        success: true,
        filePath:
          result.filePath
      };
    } catch (error) {
      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

/* Find on page */

handle(
  "browser-find-in-page",
  (event, payload) => {
    const webContents =
      activeWC(
        ctxFrom(event)
      );

    if (!webContents) {
      return null;
    }

    const text =
      String(
        payload?.text || ""
      );

    if (!text) {
      webContents.stopFindInPage(
        "clearSelection"
      );

      return null;
    }

    return webContents.findInPage(
      text,
      payload.options || {}
    );
  }
);

handle(
  "browser-stop-find",
  (event, action) => {
    const allowedActions =
      new Set([
        "clearSelection",
        "keepSelection",
        "activateSelection"
      ]);

    activeWC(
      ctxFrom(event)
    )?.stopFindInPage(
      allowedActions.has(action)
        ? action
        : "clearSelection"
    );
  }
);

/* Developer tools */

handle(
  "browser-open-devtools",
  (event) =>
    activeWC(
      ctxFrom(event)
    )?.openDevTools({
      mode: "detach"
    })
);

/* Share */

handle(
  "browser-share-page",
  async (event) => {
    const ctx =
      ctxFrom(event);

    const webContents =
      activeWC(ctx);

    if (
      !windowReady(ctx) ||
      !webContents ||
      !webContents.getURL()
    ) {
      return {
        success: false
      };
    }

    const url =
      webContents.getURL();

    clipboard.writeText(url);

    await dialog.showMessageBox(
      ctx.window,
      {
        type: "info",
        title: "Share page",

        message:
          "The page address was copied.",

        detail: url,

        buttons:
          ["OK"]
      }
    );

    return {
      success: true,
      url
    };
  }
);

/* Clear browsing data */

handle(
  "browser-clear-data",
  async (event) => {
    const ctx =
      ctxFrom(event);

    if (!windowReady(ctx)) {
      return {
        success: false
      };
    }

    const confirmation =
      await dialog.showMessageBox(
        ctx.window,
        {
          type: "warning",

          title:
            "Delete browsing data",

          message:
            "Delete history, cookies and cache?",

          detail:
            "You may be signed out of websites.",

          buttons: [
            "Delete data",
            "Cancel"
          ],

          defaultId: 1,
          cancelId: 1
        }
      );

    if (
      confirmation.response !== 0
    ) {
      return {
        success: false,
        canceled: true
      };
    }

    try {
      await ctx.session.clearCache();

      await ctx.session
        .clearStorageData({
          storages: [
            "cookies",
            "localstorage",
            "indexdb",
            "serviceworkers",
            "cachestorage"
          ]
        });

      if (!ctx.isIncognito) {
        history.length = 0;
        if (browserStore) { browserStore.data.history = []; browserStore.save(); }
      }

      return {
        success: true
      };
    } catch (error) {
      return {
        success: false,
        error:
          error.message
      };
    }
  }
);

/* Bookmarks */

handle(
  "browser-toggle-bookmark",
  (event) => {
    const ctx =
      ctxFrom(event);

    const webContents =
      activeWC(ctx);

    if (!webContents) {
      return {
        isBookmarked: false
      };
    }

    const url =
      webContents.getURL();

    if (!/^https?:\/\//.test(url)) {
      return {
        isBookmarked: false,

        error:
          "Only normal websites can be bookmarked."
      };
    }

    const isBookmarked =
      !bookmarks.has(url);

    if (isBookmarked) {
      bookmarks.set(
        url,
        {
          url,

          title:
            webContents.getTitle() ||
            url,

          createdAt:
            Date.now()
        }
      );
    } else {
      bookmarks.delete(url);
    }
    if (browserStore) { browserStore.data.bookmarks = [...bookmarks.values()]; browserStore.save(); }

    send(
      ctx,
      "browser-bookmark-updated",
      {
        url,
        isBookmarked
      }
    );

    sendActiveState(ctx);
    sendTabs(ctx);

    return {
      url,
      isBookmarked
    };
  }
);

/* Overlay */

handle(
  "browser-set-overlay-visible",
  (event, visible) => {
    const ctx =
      ctxFrom(event);

    if (!windowReady(ctx)) {
      return;
    }

    ctx.overlayVisible =
      Boolean(visible);

    resizeTabs(ctx);
  }
);

/* Exit */

handle(
  "browser-exit",
  () => app.quit()
);


/* Advanced management windows: settings, extensions and tab groups */
const MANAGER_PAGES = {
  settings: "settings.html",
  extensions: "extensions.html",
  "tab-groups": "tab-groups.html",
  gaming: "gaming.html",
  security: "security.html",
  tools: "tools.html",
  evolution: "evolution.html",
  advanced: "advanced.html",
  updates: "updates.html"
};

function managerRecord(event) {
  const record = managerWindows.get(event.sender.id);
  if (!record || record.window.isDestroyed()) throw new Error("Management request was blocked.");
  return record;
}

function openManagerWindow(type, ctx) {
  const existing = [...managerWindows.values()].find((item) => item.type === type && item.ctx === ctx && !item.window.isDestroyed());
  if (existing) { existing.window.show(); existing.window.focus(); return { success: true }; }
  const win = new BrowserWindow({
    icon: APP_ICON,
    width: ["settings","gaming","security","tools","evolution","advanced","updates"].includes(type) ? 1120 : 1050, height: 760, minWidth: 720, minHeight: 520,
    title: `${type === "tab-groups" ? "Tab Groups" : type === "gaming" ? "Evasion Control" : type === "security" ? "Z+ Security Center" : type === "tools" ? "Evasion Ultimate Center" : type === "evolution" ? "Evasion 3.0 Center" : type === "advanced" ? "Evasion Nexus" : type === "updates" ? "Updates & What’s New" : type[0].toUpperCase()+type.slice(1)} — Evasion Browser`,
    parent: windowReady(ctx) ? ctx.window : undefined, show: false, backgroundColor: "#eef3ff",
    webPreferences: { preload: path.join(__dirname, "manager-preload.js"), nodeIntegration: false, contextIsolation: true, sandbox: true }
  });
  win.setMenuBarVisibility(false);
  const id = win.webContents.id;
  managerWindows.set(id, { window: win, type, ctx });
  win.loadFile(path.join(__dirname, "pages", "manager", MANAGER_PAGES[type]));
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("closed", () => managerWindows.delete(id));
  return { success: true };
}

function applyPrivacyConfiguration(browserSession) {
  if (browserSession.__evasionPrivacyConfigured) return;
  browserSession.__evasionPrivacyConfigured = true;

  const trackerHosts = [
    "doubleclick.net","googlesyndication.com","google-analytics.com","googletagmanager.com",
    "facebook.net","connect.facebook.net","scorecardresearch.com","hotjar.com","segment.io",
    "mixpanel.com","amplitude.com","clarity.ms","newrelic.com","adnxs.com","taboola.com",
    "outbrain.com","criteo.com","quantserve.com","matomo.cloud"
  ];
  const adHosts = [
    "adservice.google.com","ads.google.com","pagead2.googlesyndication.com","securepubads.g.doubleclick.net",
    "amazon-adsystem.com","adsrvr.org","rubiconproject.com","pubmatic.com","openx.net","yieldmo.com"
  ];
  const minerHosts = ["coinhive.com","coin-hive.com","cryptoloot.pro","webminepool.com","minero.cc"];
  const trackingParams = new Set(["utm_source","utm_medium","utm_campaign","utm_term","utm_content","gclid","fbclid","msclkid","mc_cid","mc_eid"]);
  const matchesHost = (host, list) => list.some((domain) => host === domain || host.endsWith(`.${domain}`));

  browserSession.webRequest.onBeforeRequest((details, callback) => {
    let cancel = false;
    try {
      const parsed = new URL(details.url);
      const host = parsed.hostname.toLowerCase();
      if (browserSettings.blockAds && matchesHost(host, adHosts)) { cancel = true; securityStats.blockedAds++; }
      else if (browserSettings.blockTrackers && matchesHost(host, trackerHosts)) { cancel = true; securityStats.blockedTrackers++; }
      else if (browserSettings.blockCryptominers && matchesHost(host, minerHosts)) { cancel = true; securityStats.blockedMiners++; }
      else if (browserSettings.securityLevel === "strict" && ["ping","cspReport"].includes(details.resourceType)) { cancel = true; securityStats.blockedOther++; }
    } catch {}
    callback({ cancel });
  });

  browserSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = { ...details.requestHeaders };
    if (browserSettings.doNotTrack) { headers.DNT = "1"; headers["Sec-GPC"] = "1"; }
    else { delete headers.DNT; delete headers["Sec-GPC"]; }
    if (browserSettings.blockFingerprinting) {
      delete headers["X-Client-Data"];
      delete headers["Device-Memory"];
    }
    callback({ requestHeaders: headers });
  });

  browserSession.webRequest.onBeforeRedirect((details) => {
    if (!browserSettings.stripTrackingParams) return;
    try {
      const url = new URL(details.redirectURL || details.url);
      let changed = false;
      for (const key of [...url.searchParams.keys()]) if (trackingParams.has(key.toLowerCase())) { url.searchParams.delete(key); changed = true; }
      if (changed) securityStats.blockedOther++;
    } catch {}
  });

  browserSession.setPermissionRequestHandler((_wc, permission, callback) => {
    const safe = new Set(["clipboard-sanitized-write","fullscreen","pointerLock"]);
    if (!browserSettings.permissionProtection) return callback(true);
    callback(safe.has(permission));
  });
  browserSession.setPermissionCheckHandler((_wc, permission) => {
    if (!browserSettings.permissionProtection) return true;
    return ["clipboard-sanitized-write","fullscreen","pointerLock"].includes(permission);
  });
}

handle("manager-context", (event) => ({
  type: managerRecord(event).type,
  version: app.getVersion(),
  theme: browserSettings.theme || "system"
}));
handle("manager-close", (event) => managerRecord(event).window.close());
handle("settings-get", (event) => { managerRecord(event); return { ...browserSettings }; });
handle("settings-update", async (event, patch = {}) => {
  managerRecord(event);
  const allowed = new Set(["theme","searchEngine","customSearchUrl","startup","defaultZoom","downloadPath","askDownloadLocation","doNotTrack","blockTrackers","blockPopups","restoreSession","showBookmarksBar","accentColor","performanceMode","memorySaver","cpuLimit","ramLimit","gamingSounds","animatedBackground","sidebarEnabled","focusMode","securityLevel","blockAds","blockFingerprinting","blockCryptominers","stripTrackingParams","blockThirdPartyCookies","httpsFirst","permissionProtection","sleepingTabsMinutes","streamingMode","gamingSessionMode","autoShredOnClose","lowMemoryMode","maxActiveTabs","autoUpdateEnabled","updateChannel","showWhatsNew"]);
  for (const [key, value] of Object.entries(patch)) if (allowed.has(key)) browserSettings[key] = value;
  browserSettings.defaultZoom = Math.max(50, Math.min(300, Number(browserSettings.defaultZoom) || 100));

  browserSettings.cpuLimit = Math.max(25, Math.min(100, Number(browserSettings.cpuLimit) || 80));
  browserSettings.ramLimit = Math.max(1024, Math.min(16384, Number(browserSettings.ramLimit) || 4096));
  browserSettings.sleepingTabsMinutes = Math.max(1, Math.min(240, Number(browserSettings.sleepingTabsMinutes) || 20));
  browserSettings.maxActiveTabs = Math.max(6, Math.min(100, Number(browserSettings.maxActiveTabs) || 24));
  browserStore.data.settings = { ...browserSettings };

  await browserStore.save();
  applyPerformancePolicy();
  for (const ctx of contexts.values()) send(ctx, "browser-settings-updated", browserSettings);
  for (const item of managerWindows.values()) if (!item.window.isDestroyed()) item.window.webContents.send("settings-changed", browserSettings);
  return { ...browserSettings };
});
handle("settings-choose-download-folder", async (event) => {
  const { window } = managerRecord(event);
  const result = await dialog.showOpenDialog(window, { title: "Choose download folder", properties: ["openDirectory", "createDirectory"] });
  return result.canceled ? "" : result.filePaths[0] || "";
});
handle("settings-clear-data", async (event) => {
  managerRecord(event);
  history.length = 0; browserStore.data.history = [];
  for (const ctx of contexts.values()) { await ctx.session.clearCache(); await ctx.session.clearStorageData(); }
  await browserStore.save(); return { success: true };
});

handle("security-get", (event) => { managerRecord(event); return { settings: { ...browserSettings }, stats: { ...securityStats, total: securityStats.blockedAds + securityStats.blockedTrackers + securityStats.blockedMiners + securityStats.blockedOther } }; });
handle("security-reset-stats", (event) => { managerRecord(event); securityStats.blockedAds = securityStats.blockedTrackers = securityStats.blockedMiners = securityStats.blockedOther = 0; securityStats.startedAt = Date.now(); return { success: true }; });

async function extensionSnapshot(browserSession) {
  const result = [];
  for (const [id, meta] of loadedExtensions) {
    const ext = browserSession.getExtension?.(id);
    result.push({ id, name: ext?.name || meta.name || id, version: ext?.version || meta.version || "", description: ext?.manifest?.description || meta.description || "", path: meta.path });
  }
  return result;
}
handle("extensions-list", async (event) => {
  const { ctx } = managerRecord(event); return extensionSnapshot(ctx?.session || session.defaultSession);
});
handle("extensions-load", async (event) => {
  const record = managerRecord(event); const targetSession = record.ctx?.session || session.defaultSession;
  const result = await dialog.showOpenDialog(record.window, { title: "Select unpacked extension folder", properties: ["openDirectory"] });
  if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
  const folder = result.filePaths[0];
  const ext = await targetSession.loadExtension(folder, { allowFileAccess: true });
  const meta = { id: ext.id, name: ext.name, version: ext.version, description: ext.manifest?.description || "", path: folder };
  loadedExtensions.set(ext.id, meta);
  browserStore.data.extensions = [...loadedExtensions.values()]; await browserStore.save();
  return { success: true, extension: meta };
});
handle("extensions-remove", async (event, id) => {
  const { ctx } = managerRecord(event); const targetSession = ctx?.session || session.defaultSession;
  targetSession.removeExtension(String(id)); loadedExtensions.delete(String(id));
  browserStore.data.extensions = [...loadedExtensions.values()]; await browserStore.save(); return { success: true };
});
handle("extensions-reload", async (event, id) => {
  const record = managerRecord(event); const targetSession = record.ctx?.session || session.defaultSession; const meta = loadedExtensions.get(String(id));
  if (!meta) throw new Error("Extension not found.");
  try { targetSession.removeExtension(String(id)); } catch {}
  const ext = await targetSession.loadExtension(meta.path, { allowFileAccess: true });
  loadedExtensions.delete(String(id)); loadedExtensions.set(ext.id, { ...meta, id: ext.id, name: ext.name, version: ext.version });
  browserStore.data.extensions = [...loadedExtensions.values()]; await browserStore.save(); return { success: true };
});

function groupModel(ctx) { return { groups: [...ctx.groups.values()], tabs: tabsSnapshot(ctx) }; }
handle("groups-get", (event) => { const { ctx } = managerRecord(event); if (!windowReady(ctx)) throw new Error("Browser window is unavailable."); return groupModel(ctx); });
handle("groups-create", async (event, input = {}) => {
  const { ctx } = managerRecord(event); const group = { id: require("crypto").randomUUID(), name: String(input.name || "Group").trim().slice(0,40) || "Group", color: String(input.color || "#536dfe"), collapsed: false };
  ctx.groups.set(group.id, group); browserStore.data.groups = [...ctx.groups.values()]; await browserStore.save(); sendTabs(ctx); return group;
});
handle("groups-update", async (event, payload = {}) => {
  const { ctx } = managerRecord(event); const group = ctx.groups.get(String(payload.id)); if (!group) throw new Error("Group not found.");
  if (payload.patch?.name) group.name = String(payload.patch.name).trim().slice(0,40); if (payload.patch?.color) group.color = String(payload.patch.color); if (typeof payload.patch?.collapsed === "boolean") group.collapsed = payload.patch.collapsed;
  browserStore.data.groups = [...ctx.groups.values()]; await browserStore.save(); sendTabs(ctx); return group;
});
handle("groups-delete", async (event, id) => {
  const { ctx } = managerRecord(event); const key = String(id); ctx.groups.delete(key); for (const tab of ctx.tabs.values()) if (tab.groupId === key) tab.groupId = null;
  browserStore.data.groups = [...ctx.groups.values()]; await browserStore.save(); sendTabs(ctx); return { success: true };
});
handle("groups-assign-tab", async (event, payload = {}) => {
  const { ctx } = managerRecord(event); const tab = ctx.tabs.get(Number(payload.tabId)); if (!tab) throw new Error("Tab not found.");
  const groupId = payload.groupId ? String(payload.groupId) : null; if (groupId && !ctx.groups.has(groupId)) throw new Error("Group not found."); tab.groupId = groupId; sendTabs(ctx); return { success: true };
});


/* Gaming hub, workspaces, notes and advanced page tools */
handle("gaming-metrics", (event) => {
  const { ctx } = managerRecord(event);
  const metrics = app.getAppMetrics();
  const cpuPercent = Math.round(metrics.reduce((sum, item) => sum + Number(item.cpu?.percentCPUUsage || 0), 0));
  const browserMemoryMB = Math.round(metrics.reduce((sum, item) => sum + Number(item.memory?.workingSetSize || 0), 0) / 1024);
  const total = os.totalmem(), free = os.freemem();
  const snapshot = tabsSnapshot(ctx);
  return {
    cpuPercent,
    browserMemoryMB,
    systemMemoryPercent: Math.round(((total - free) / total) * 100),
    totalMemoryGB: (total / 1073741824).toFixed(1),
    freeMemoryGB: (free / 1073741824).toFixed(1),
    processCount: metrics.length,
    tabCount: snapshot.length,
    audibleTabs: snapshot.filter((tab) => tab.isAudible).length,
    sleepingTabs: snapshot.filter((tab) => tab.isSleeping).length,
    policy: performancePolicy()
  };
});
handle("gaming-data", (event) => { managerRecord(event); return { notes: browserStore.data.notes || [], workspaces: browserStore.data.workspaces || [] }; });
handle("quick-launch-get", (event) => {
  managerRecord(event);
  return structuredClone(browserStore.data.quickLaunch || []);
});
handle("quick-launch-save", async (event, items = []) => {
  managerRecord(event);
  const normalized = [];
  for (const item of Array.isArray(items) ? items.slice(0,18) : []) {
    const name = String(item?.name || "").trim().slice(0,30);
    const url = String(item?.url || "").trim();
    if (!name || !/^https?:\/\//i.test(url)) continue;
    normalized.push({ id: String(item.id || crypto.randomUUID()), name, url });
  }
  browserStore.data.quickLaunch = normalized;
  await browserStore.save();
  return structuredClone(normalized);
});
handle("quick-launch-reset", async (event) => {
  managerRecord(event);
  browserStore.data.quickLaunch = [
    { id:"discord", name:"Discord", url:"https://discord.com/app" },
    { id:"youtube", name:"YouTube", url:"https://www.youtube.com" },
    { id:"gmail", name:"Gmail", url:"https://mail.google.com" },
    { id:"github", name:"GitHub", url:"https://github.com" },
    { id:"chatgpt", name:"ChatGPT", url:"https://chatgpt.com" },
    { id:"spotify", name:"Spotify", url:"https://open.spotify.com" }
  ];
  await browserStore.save();
  return structuredClone(browserStore.data.quickLaunch);
});
handle("gaming-add-note", async (event, text) => {
  managerRecord(event);
  const note = { id: crypto.randomUUID(), text: String(text || "").trim().slice(0, 5000), createdAt: Date.now() };
  if (!note.text) throw new Error("Note cannot be empty.");
  browserStore.data.notes.unshift(note); browserStore.data.notes = browserStore.data.notes.slice(0, 100); await browserStore.save(); return note;
});
handle("gaming-delete-note", async (event, id) => { managerRecord(event); browserStore.data.notes = (browserStore.data.notes || []).filter((note) => note.id !== String(id)); await browserStore.save(); return { success: true }; });
handle("gaming-save-workspace", async (event, name) => {
  const { ctx } = managerRecord(event); if (!windowReady(ctx)) throw new Error("Browser window is unavailable.");
  const urls = tabsSnapshot(ctx).map((tab) => tab.url).filter((url) => /^https?:\/\//.test(url));
  const workspace = { id: crypto.randomUUID(), name: String(name || "Workspace").trim().slice(0, 60) || "Workspace", urls, createdAt: Date.now() };
  browserStore.data.workspaces.unshift(workspace); browserStore.data.workspaces = browserStore.data.workspaces.slice(0, 30); await browserStore.save(); return workspace;
});
handle("gaming-open-workspace", async (event, id) => {
  const { ctx } = managerRecord(event); const workspace = (browserStore.data.workspaces || []).find((item) => item.id === String(id));
  if (!workspace || !windowReady(ctx)) throw new Error("Workspace not found.");
  for (const url of workspace.urls || []) createTab(ctx, { url, activate: false });
  if (ctx.tabOrder.length) switchTab(ctx, ctx.tabOrder.at(-1));
  return { success: true, opened: workspace.urls?.length || 0 };
});
handle("gaming-delete-workspace", async (event, id) => { managerRecord(event); browserStore.data.workspaces = (browserStore.data.workspaces || []).filter((item) => item.id !== String(id)); await browserStore.save(); return { success: true }; });
handle("gaming-open-url", (event, url) => { const { ctx } = managerRecord(event); if (!isAllowedURL(String(url))) throw new Error("URL was blocked."); createTab(ctx, { url: String(url), activate: true }); return { success: true }; });
handle("gaming-toggle-mute", (event) => { const { ctx } = managerRecord(event); const wc = activeWC(ctx); if (!wc) return { success: false }; wc.setAudioMuted(!wc.isAudioMuted()); sendTabs(ctx); return { success: true, muted: wc.isAudioMuted() }; });
handle("gaming-screenshot", async (event) => {
  const { ctx, window } = managerRecord(event); const wc = activeWC(ctx); if (!wc) return { success: false };
  const result = await dialog.showSaveDialog(window, { title: "Save screenshot", defaultPath: `Evasion-Screenshot-${Date.now()}.png`, filters: [{ name: "PNG image", extensions: ["png"] }] });
  if (result.canceled || !result.filePath) return { success: false, canceled: true };
  const image = await wc.capturePage(); await fs.writeFile(result.filePath, image.toPNG()); return { success: true, filePath: result.filePath };
});
handle("gaming-reader-mode", async (event) => {
  const { ctx } = managerRecord(event); const tab = activeTab(ctx); if (!tabReady(tab)) return { success: false };
  try {
    const article = await tab.view.webContents.executeJavaScript(`(() => { const root=document.querySelector('article,main,[role="main"]')||document.body; return {title:document.title||'Reader', text:(root.innerText||'').trim().slice(0,200000)}; })()`);
    const readerText = esc(article.text || "No readable text was found.").replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
    const html = createInternalHTML(article.title || "Reader mode", article.title || "Reader mode", `<article class="card" style="font-size:18px;line-height:1.75"><p>${readerText}</p></article>`);
    await tab.view.webContents.loadURL("data:text/html;charset=UTF-8," + encodeURIComponent(html)); return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
});


/* Ultimate tools, productivity, analytics, media and AI-ready services */
handle("tools-data", (event) => {
  const { ctx } = managerRecord(event);
  const hist = history.slice();
  const hostCounts = new Map();
  for (const item of hist) {
    try { const host = new URL(item.url).hostname.replace(/^www\./, ""); hostCounts.set(host, (hostCounts.get(host) || 0) + 1); } catch {}
  }
  const topSites = [...hostCounts.entries()].sort((a,b) => b[1]-a[1]).slice(0,10).map(([host, visits]) => ({ host, visits }));
  return {
    tasks: browserStore.data.tasks || [],
    notes: browserStore.data.notes || [],
    pomodoro: browserStore.data.pomodoro || { focusMinutes: 25, breakMinutes: 5 },
    ai: browserStore.data.ai || { provider: "local", endpoint: "", model: "" },
    analytics: {
      visits: hist.length,
      uniqueSites: hostCounts.size,
      today: hist.filter((item) => new Date(item.visitedAt).toDateString() === new Date().toDateString()).length,
      bookmarks: bookmarks.size,
      downloads: downloads.length,
      openTabs: windowReady(ctx) ? tabsSnapshot(ctx).length : 0,
      topSites
    },
    profile: profileService?.status?.().profile || null,
    settings: { ...browserSettings }
  };
});
handle("tools-add-task", async (event, text) => {
  managerRecord(event);
  const value = String(text || "").trim().slice(0,500);
  if (!value) throw new Error("Task cannot be empty.");
  const task = { id: crypto.randomUUID(), text: value, done: false, createdAt: Date.now() };
  browserStore.data.tasks.unshift(task); browserStore.data.tasks = browserStore.data.tasks.slice(0,200); await browserStore.save(); return task;
});
handle("tools-toggle-task", async (event, id) => {
  managerRecord(event); const task = (browserStore.data.tasks || []).find((item) => item.id === String(id));
  if (!task) throw new Error("Task not found."); task.done = !task.done; await browserStore.save(); return task;
});
handle("tools-delete-task", async (event, id) => {
  managerRecord(event); browserStore.data.tasks = (browserStore.data.tasks || []).filter((item) => item.id !== String(id)); await browserStore.save(); return { success: true };
});
handle("tools-save-pomodoro", async (event, value = {}) => {
  managerRecord(event); browserStore.data.pomodoro = { focusMinutes: Math.max(1, Math.min(120, Number(value.focusMinutes)||25)), breakMinutes: Math.max(1, Math.min(60, Number(value.breakMinutes)||5)) }; await browserStore.save(); return browserStore.data.pomodoro;
});
handle("tools-open-url", (event, url) => {
  const { ctx } = managerRecord(event); const value = String(url || ""); if (!isAllowedURL(value)) throw new Error("URL was blocked."); createTab(ctx, { url: value, activate: true }); return { success: true };
});
handle("tools-apply-theme", async (event, patch = {}) => {
  managerRecord(event);
  if (patch.theme && ["dark","light","system"].includes(patch.theme)) browserSettings.theme = patch.theme;
  if (/^#[0-9a-f]{6}$/i.test(String(patch.accentColor||""))) browserSettings.accentColor = patch.accentColor;
  browserStore.data.settings = { ...browserSettings }; await browserStore.save();
  for (const ctx of contexts.values()) send(ctx, "browser-settings-updated", browserSettings);
  for (const item of managerWindows.values()) if (!item.window.isDestroyed()) item.window.webContents.send("settings-changed", browserSettings);
  return { ...browserSettings };
});
handle("tools-local-ai", async (event, input = {}) => {
  const { ctx } = managerRecord(event);
  const action = String(input.action || "summarize");
  let text = String(input.text || "").trim();
  if (!text && windowReady(ctx)) {
    const wc = activeWC(ctx);
    if (wc) try { text = await wc.executeJavaScript(`(() => (document.querySelector('article,main,[role="main"]') || document.body).innerText.slice(0,120000))()`); } catch {}
  }
  if (!text) return { result: "No text was provided or found on the active page." };
  const sentences = text.replace(/\s+/g," ").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
  if (action === "keywords") {
    const stop = new Set("the a an and or but of to in on for with is are was were be been this that it as at by from you your we our they their".split(" "));
    const counts = new Map(); for (const word of text.toLowerCase().match(/[a-z]{4,}/g) || []) if (!stop.has(word)) counts.set(word,(counts.get(word)||0)+1);
    return { result: [...counts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,15).map(([w,c])=>`${w} (${c})`).join(", ") || "No keywords found." };
  }
  if (action === "rewrite") return { result: sentences.slice(0,8).map(s=>s.trim()).join(" ") };
  return { result: sentences.slice(0, Math.min(6, sentences.length)).map(s=>`• ${s.trim()}`).join("\n") };
});


/* Evasion 3.0: sync, AI provider, extension catalog, companion and advanced analytics */
function analyticsSnapshot(ctx) {
  const visits = history.slice();
  const byHost = new Map();
  const byDay = new Map();
  const byHour = Array(24).fill(0);
  for (const item of visits) {
    try {
      const host = new URL(item.url).hostname.replace(/^www\./, "");
      byHost.set(host, (byHost.get(host) || 0) + 1);
    } catch {}
    const d = new Date(item.visitedAt || Date.now());
    const key = d.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) || 0) + 1);
    byHour[d.getHours()]++;
  }
  return {
    visits: visits.length,
    bookmarks: bookmarks.size,
    downloads: downloads.length,
    openTabs: ctx?.tabOrder?.length || 0,
    topSites: [...byHost.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([host,count])=>({host,count})),
    daily: [...byDay.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-14).map(([date,count])=>({date,count})),
    hourly: byHour,
    blocked: { ...securityStats, total: securityStats.blockedAds + securityStats.blockedTrackers + securityStats.blockedMiners + securityStats.blockedOther }
  };
}

function deriveBackupKey(passphrase, salt) {
  return crypto.scryptSync(String(passphrase), salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}
function encryptPayload(payload, passphrase) {
  if (String(passphrase || "").length < 8) throw new Error("Use a backup password with at least 8 characters.");
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = deriveBackupKey(passphrase, salt);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return { version: 1, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ciphertext: ciphertext.toString("base64") };
}
function decryptPayload(record, passphrase) {
  const salt = Buffer.from(record.salt, "base64"), iv = Buffer.from(record.iv, "base64"), tag = Buffer.from(record.tag, "base64");
  const key = deriveBackupKey(passphrase, salt);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64")), decipher.final()]).toString("utf8"));
}
function secretRead(value) {
  try { return value && safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(Buffer.from(value, "base64")) : ""; } catch { return ""; }
}
function secretWrite(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  return safeStorage.encryptString(String(value)).toString("base64");
}
function ensureSyncKey() {
  browserStore.data.sync ||= {};
  if (!browserStore.data.sync.deviceKey) browserStore.data.sync.deviceKey = secretWrite(crypto.randomBytes(32).toString("base64"));
  return secretRead(browserStore.data.sync.deviceKey);
}

handle("evolution-data", (event) => {
  const { ctx } = managerRecord(event);
  const profile = profileService?.status()?.profile || null;
  return {
    profile,
    settings: { ...browserSettings },
    sync: { endpoint: browserStore.data.sync?.endpoint || "", username: browserStore.data.sync?.username || "", configured: Boolean(browserStore.data.sync?.endpoint), lastSync: browserStore.data.sync?.lastSync || 0 },
    ai: { provider: browserStore.data.ai?.provider || "local", endpoint: browserStore.data.ai?.endpoint || "", model: browserStore.data.ai?.model || "", hasKey: Boolean(browserStore.data.ai?.apiKey) },
    companion: browserStore.data.companion || {},
    analytics: analyticsSnapshot(ctx),
    extensionCatalog: browserStore.data.extensionCatalog || []
  };
});

handle("sync-export", async (event, payload={}) => {
  const { window } = managerRecord(event);
  const result = await dialog.showSaveDialog(window, { title: "Export encrypted Evasion backup", defaultPath: "evasion-sync-backup.enc.json", filters: [{ name: "Encrypted Evasion backup", extensions: ["json"] }] });
  if (result.canceled || !result.filePath) return { success:false, canceled:true };
  await fs.writeFile(result.filePath, JSON.stringify(encryptPayload(browserStore.data, payload.passphrase), null, 2), { mode: 0o600 });
  return { success:true, filePath:result.filePath };
});
handle("sync-import", async (event, payload={}) => {
  const { window } = managerRecord(event);
  const result = await dialog.showOpenDialog(window, { title: "Import encrypted Evasion backup", properties:["openFile"], filters:[{name:"Encrypted Evasion backup",extensions:["json"]}] });
  if (result.canceled || !result.filePaths[0]) return { success:false, canceled:true };
  const incoming = decryptPayload(JSON.parse(await fs.readFile(result.filePaths[0], "utf8")), payload.passphrase);
  browserStore.data = { ...browserStore.data, ...incoming, settings: { ...browserStore.data.settings, ...(incoming.settings || {}) } };
  browserSettings = browserStore.data.settings;
  history.length = 0; history.push(...(browserStore.data.history || []).slice(-1000));
  bookmarks.clear(); for (const item of browserStore.data.bookmarks || []) if (item?.url) bookmarks.set(item.url, item);
  await browserStore.save();
  return { success:true };
});
handle("sync-configure", async (event, payload={}) => {
  managerRecord(event);
  browserStore.data.sync ||= {};
  browserStore.data.sync.endpoint = String(payload.endpoint || "").trim();
  browserStore.data.sync.username = String(payload.username || "").trim();
  if (payload.password !== undefined) browserStore.data.sync.password = secretWrite(payload.password);
  ensureSyncKey(); await browserStore.save();
  return { success:true };
});
async function remoteSyncRequest(method, body) {
  const cfg = browserStore.data.sync || {};
  if (!/^https?:\/\//i.test(cfg.endpoint || "")) throw new Error("Enter a valid HTTPS WebDAV/file endpoint.");
  const headers = { "content-type": "application/json" };
  const password = secretRead(cfg.password);
  if (cfg.username || password) headers.authorization = `Basic ${Buffer.from(`${cfg.username || ""}:${password}`).toString("base64")}`;
  const response = await net.fetch(cfg.endpoint, { method, headers, body });
  if (!response.ok) throw new Error(`Sync server returned ${response.status}.`);
  return response;
}
handle("sync-push", async (event) => {
  managerRecord(event);
  const key = ensureSyncKey();
  await remoteSyncRequest("PUT", JSON.stringify(encryptPayload(browserStore.data, key)));
  browserStore.data.sync.lastSync = Date.now(); await browserStore.save(); return { success:true, lastSync:browserStore.data.sync.lastSync };
});
handle("sync-pull", async (event) => {
  managerRecord(event);
  const response = await remoteSyncRequest("GET");
  const incoming = decryptPayload(await response.json(), ensureSyncKey());
  browserStore.data = { ...browserStore.data, ...incoming, settings:{...browserStore.data.settings,...(incoming.settings||{})} };
  browserSettings = browserStore.data.settings; await browserStore.save();
  return { success:true };
});

handle("ai-configure", async (event, payload={}) => {
  managerRecord(event); browserStore.data.ai ||= {};
  browserStore.data.ai.provider = String(payload.provider || "local");
  browserStore.data.ai.endpoint = String(payload.endpoint || "").trim();
  browserStore.data.ai.model = String(payload.model || "").trim();
  if (payload.apiKey !== undefined) browserStore.data.ai.apiKey = secretWrite(payload.apiKey);
  await browserStore.save(); return { success:true };
});
handle("ai-ask", async (event, payload={}) => {
  const { ctx } = managerRecord(event);
  const prompt = String(payload.prompt || "").trim();
  if (!prompt) throw new Error("Enter a prompt.");
  const cfg = browserStore.data.ai || {};
  if ((cfg.provider || "local") === "local" || !cfg.endpoint) {
    const sentences = prompt.replace(/\s+/g," ").match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [prompt];
    return { result: sentences.slice(0,6).map(s=>`• ${s.trim()}`).join("\n"), local:true };
  }
  const headers = { "content-type":"application/json" };
  const key = secretRead(cfg.apiKey); if (key) headers.authorization = `Bearer ${key}`;
  const response = await net.fetch(cfg.endpoint, { method:"POST", headers, body:JSON.stringify({ model:cfg.model || "default", messages:[{role:"user",content:prompt}], temperature:0.3 }) });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}.`);
  const data = await response.json();
  return { result: data.choices?.[0]?.message?.content || data.output_text || JSON.stringify(data,null,2), local:false };
});
handle("ai-use-active-page", async (event) => {
  const { ctx } = managerRecord(event); const wc = activeWC(ctx); if (!wc) return "";
  try { return await wc.executeJavaScript(`(() => (document.querySelector('article,main,[role="main"]') || document.body).innerText.slice(0,80000))()`); } catch { return ""; }
});

handle("companion-pair", async (event) => {
  managerRecord(event); browserStore.data.companion ||= {};
  const code = String(crypto.randomInt(100000, 999999));
  browserStore.data.companion = { code, deviceId: crypto.randomUUID(), createdAt:Date.now(), expiresAt:Date.now()+10*60000, name:os.hostname() };
  await browserStore.save(); return browserStore.data.companion;
});
handle("companion-export", async (event) => {
  const { window } = managerRecord(event); const pairing = browserStore.data.companion || {};
  const result = await dialog.showSaveDialog(window,{title:"Export companion pairing",defaultPath:"evasion-companion-pairing.json",filters:[{name:"Pairing file",extensions:["json"]}]});
  if(result.canceled||!result.filePath)return{success:false,canceled:true};
  await fs.writeFile(result.filePath,JSON.stringify(pairing,null,2)); return{success:true,filePath:result.filePath};
});
handle("analytics-clear", async (event) => { managerRecord(event); history.length=0; browserStore.data.history=[]; await browserStore.save(); return{success:true}; });
handle("profile-mode-set", async (event, mode) => { managerRecord(event); browserStore.data.settings.profileMode = ["personal","work","gaming","guest"].includes(mode)?mode:"personal"; browserSettings.profileMode=browserStore.data.settings.profileMode; await browserStore.save(); return{success:true,mode:browserSettings.profileMode}; });

/* Secure password manager */


handle("advanced-data", (event) => { const { ctx } = managerRecord(event); return advancedSnapshot(ctx); });
handle("advanced-sleep-tab", (event, tabId) => { const { ctx } = managerRecord(event); return sleepTab(ctx, tabId); });
handle("advanced-wake-tab", (event, tabId) => { const { ctx } = managerRecord(event); return wakeTab(ctx, tabId); });
handle("advanced-sleep-inactive", (event, minutes) => { const { ctx } = managerRecord(event); return sleepInactiveTabs(ctx, minutes); });
handle("advanced-shred-site", async (event) => { const { ctx } = managerRecord(event); return shredCurrentSite(ctx); });
handle("advanced-toggle-mode", async (event, payload = {}) => {
  const { ctx } = managerRecord(event);
  const key = payload.mode === "streaming" ? "streamingMode" : "gamingSessionMode";
  const value = Boolean(payload.enabled);
  browserSettings[key] = value; ctx[key] = value;
  if (key === "streamingMode") { for (const tab of ctx.tabs.values()) if (tabReady(tab) && tab.id !== ctx.activeTabId) tab.view.webContents.setAudioMuted(value); }
  if (key === "gamingSessionMode" && value) sleepInactiveTabs(ctx, 1);
  browserStore.data.settings = { ...browserSettings }; await browserStore.save();
  return { success: true, mode: payload.mode, enabled: value };
});
handle("advanced-media-action", (event, payload = {}) => {
  const { ctx } = managerRecord(event); const tab = ctx.tabs.get(Number(payload.tabId));
  if (!tabReady(tab)) return { success: false };
  if (payload.action === "mute") tab.view.webContents.setAudioMuted(true);
  else if (payload.action === "unmute") tab.view.webContents.setAudioMuted(false);
  else if (payload.action === "activate") switchTab(ctx, tab.id);
  return { success: true };
});
handle("advanced-save-knowledge", async (event, payload = {}) => {
  const { ctx } = managerRecord(event); const wc = activeWC(ctx); if (!wc) return { success: false };
  const item = { id: crypto.randomUUID(), title: String(payload.title || wc.getTitle() || "Saved page").slice(0, 160), url: wc.getURL(), note: String(payload.note || "").slice(0, 4000), createdAt: Date.now() };
  browserStore.data.knowledgeVault = [item, ...(browserStore.data.knowledgeVault || [])].slice(0, 500); await browserStore.save(); return { success: true, item };
});
handle("advanced-delete-knowledge", async (event, id) => { managerRecord(event); browserStore.data.knowledgeVault = (browserStore.data.knowledgeVault || []).filter((item) => item.id !== String(id)); await browserStore.save(); return { success: true }; });
handle("advanced-command", async (event, command) => {
  const { ctx } = managerRecord(event); const value = String(command || "").trim().toLowerCase();
  if (value === "new tab") return { success: Boolean(createTab(ctx)) };
  if (value === "sleep tabs") return sleepInactiveTabs(ctx, 1);
  if (value === "shred site") return shredCurrentSite(ctx);
  if (value === "open settings") return openManagerWindow("settings", ctx);
  if (value === "open security") return openManagerWindow("security", ctx);
  if (value === "open performance") return openManagerWindow("gaming", ctx);
  if (value === "logout profile") { for (const c of contexts.values()) if (windowReady(c)) c.window.close(); profileService?.logout(); setImmediate(() => openProfileWindow()); return { success: true }; }
  return { success: false, error: "Unknown command." };
});

function openPasswordManager(parentWindow = null) {
  if (passwordWindow && !passwordWindow.isDestroyed()) {
    passwordWindow.show();
    passwordWindow.focus();
    return { success: true };
  }

  passwordWindow = new BrowserWindow({
    icon: APP_ICON,
    width: 1100,
    height: 760,
    minWidth: 760,
    minHeight: 560,
    title: "Evasion Password Manager",
    backgroundColor: "#f4f7ff",
    parent: parentWindow || undefined,
    modal: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "password-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  passwordWindow.setMenuBarVisibility(false);
  passwordWindow.loadFile(path.join(__dirname, "pages", "passwords.html"));
  passwordWindow.once("ready-to-show", () => passwordWindow?.show());
  passwordWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  passwordWindow.on("closed", () => { passwordWindow = null; vault?.lock(); });
  return { success: true };
}

function assertVaultSender(event) {
  if (!passwordWindow || passwordWindow.isDestroyed() || event.sender.id !== passwordWindow.webContents.id) {
    throw new Error("Password manager request was blocked.");
  }
  if (!vault) throw new Error("Password vault is unavailable.");
}

function vaultHandle(channel, action) {
  ipcMain.handle(channel, async (event, ...args) => {
    assertVaultSender(event);
    return action(...args);
  });
}

function registerVaultHandlers() {
  vaultHandle("vault-status", () => vault.status());
  vaultHandle("vault-create", (password) => vault.create(password));
  vaultHandle("vault-unlock", (password) => vault.unlock(password));
  vaultHandle("vault-lock", () => vault.lock());
  vaultHandle("vault-list", () => vault.list());
  vaultHandle("vault-reveal", (id) => vault.getSecret(String(id)));
  vaultHandle("vault-add", (entry) => vault.add(entry));
  vaultHandle("vault-update", (payload) => vault.update(String(payload?.id || ""), payload?.entry || {}));
  vaultHandle("vault-remove", (id) => vault.remove(String(id)));
  vaultHandle("vault-copy-username", (id) => {
    const entry = vault.list().find((item) => item.id === String(id));
    if (!entry) throw new Error("Login not found.");
    clipboard.writeText(entry.username);
    return { success: true };
  });
  vaultHandle("vault-copy-password", (id) => {
    const secret = vault.getSecret(String(id)).password;
    clipboard.writeText(secret);
    setTimeout(() => {
      if (clipboard.readText() === secret) clipboard.clear();
    }, 30000);
    return { success: true };
  });
  vaultHandle("vault-generate", (options) => generatePassword(options));
  vaultHandle("vault-strength", (password) => strength(password));
  vaultHandle("vault-change-master", (payload) => vault.changeMasterPassword(payload?.currentPassword, payload?.newPassword));
  vaultHandle("vault-reset", async (payload) => {
    const confirmation = String(payload?.confirmation || "").trim();
    if (confirmation !== "RESET") {
      throw new Error("Type RESET exactly to confirm vault deletion.");
    }
    await vault.reset();
    return { success: true };
  });
  vaultHandle("vault-export", async () => {
    const result = await dialog.showSaveDialog(passwordWindow, {
      title: "Export encrypted vault",
      defaultPath: "evasion-password-vault.enc.json",
      filters: [{ name: "Encrypted vault", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePath) return { success: false, canceled: true };
    await fs.copyFile(vault.filePath, result.filePath);
    return { success: true, filePath: result.filePath };
  });
  vaultHandle("vault-import", async () => {
    const result = await dialog.showOpenDialog(passwordWindow, {
      title: "Import encrypted vault",
      properties: ["openFile"],
      filters: [{ name: "Encrypted vault", extensions: ["json"] }]
    });
    if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true };
    const source = result.filePaths[0];
    const record = JSON.parse(await fs.readFile(source, "utf8"));
    for (const key of ["salt", "iv", "tag", "ciphertext"]) {
      if (typeof record[key] !== "string") throw new Error("Invalid vault backup.");
    }
    vault.lock();
    await fs.copyFile(source, vault.filePath);
    return { success: true };
  });
}


function profileSenderAllowed(event) {
  return profileWindow && !profileWindow.isDestroyed() && event.sender.id === profileWindow.webContents.id;
}

function openProfileWindow({ manage = false } = {}) {
  if (profileWindow && !profileWindow.isDestroyed()) {
    profileWindow.focus();
    return profileWindow;
  }

  profileWindow = new BrowserWindow({
    icon: APP_ICON,
    width: 720,
    height: 820,
    minWidth: 560,
    minHeight: 680,
    show: false,
    resizable: true,
    title: manage ? "Evasion Profile Settings" : "Sign in to Evasion",
    backgroundColor: "#080914",
    webPreferences: {
      preload: path.join(__dirname, "profile-preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });

  profileWindow.setMenuBarVisibility(false);
  profileWindow.loadFile(path.join(__dirname, "pages", "profile.html"));
  profileWindow.once("ready-to-show", () => profileWindow?.show());
  profileWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  profileWindow.on("closed", () => { profileWindow = null; });
  return profileWindow;
}

function registerProfileHandlers() {
  const profileHandle = (channel, action) => ipcMain.handle(channel, async (event, payload) => {
    if (!profileSenderAllowed(event)) throw new Error("Profile request was blocked.");
    return action(payload || {});
  });

  profileHandle("profile-status", () => profileService.status());
  profileHandle("profile-create", async (data) => {
    const result = await profileService.create(data);
    setImmediate(() => {
      if (profileWindow && !profileWindow.isDestroyed()) profileWindow.close();
      if (!BrowserWindow.getAllWindows().some((win) => win !== profileWindow)) createWindow();
    });
    return result;
  });
  profileHandle("profile-login", async (data) => {
    const result = await profileService.login(data);
    setImmediate(() => {
      if (profileWindow && !profileWindow.isDestroyed()) profileWindow.close();
      if (!BrowserWindow.getAllWindows().some((win) => win !== profileWindow)) createWindow();
    });
    return result;
  });
  profileHandle("profile-update", (data) => profileService.update(data));
  profileHandle("profile-change-password", (data) => profileService.changePassword(data.currentPassword, data.newPassword));
  profileHandle("profile-set-pin", (data) => profileService.setPin(data.password, data.pin));
  profileHandle("profile-refresh-session", () => profileService.refreshSession());
  profileHandle("profile-logout", async () => {
    const result = await profileService.logout();
    for (const ctx of contexts.values()) if (windowReady(ctx)) ctx.window.close();
    setImmediate(() => openProfileWindow());
    return result;
  });
  profileHandle("profile-reset-browser-data", async (data) => {
    const password = String(data?.password || "");
    await profileService.resetAll(password);

    vault?.lock();
    await vault?.reset?.();
    await browserStore?.reset?.();

    history.length = 0;
    downloads.length = 0;
    bookmarks.clear();
    securityStats.blockedAds = 0;
    securityStats.blockedTrackers = 0;
    securityStats.blockedMiners = 0;
    securityStats.blockedOther = 0;
    securityStats.startedAt = Date.now();

    const sessions = new Set([
      session.defaultSession,
      session.fromPartition("persist:evasion-browser")
    ]);
    for (const ctx of contexts.values()) {
      for (const tab of ctx.tabs.values()) {
        if (tabReady(tab)) sessions.add(tab.view.webContents.session);
      }
    }
    await Promise.allSettled([...sessions].map(async (ses) => {
      await ses.clearStorageData();
      await ses.clearCache();
      await ses.clearAuthCache();
      await ses.clearHostResolverCache();
    }));

    for (const ctx of contexts.values()) if (windowReady(ctx)) ctx.window.destroy();
    if (profileWindow && !profileWindow.isDestroyed()) profileWindow.destroy();

    setTimeout(() => {
      app.relaunch();
      app.exit(0);
    }, 250);
    return { success: true };
  });

  profileHandle("profile-random-color", () => ({ color: `#${crypto.randomBytes(3).toString("hex")}` }));

  handle("browser-open-profile", () => {
    openProfileWindow({ manage: true });
    return { success: true };
  });
  handle("browser-get-profile", () => profileService?.status() || { exists: false, unlocked: false, profile: null });
  handle("browser-logout-profile", async () => {
    await profileService?.logout();
    for (const ctx of contexts.values()) if (windowReady(ctx)) ctx.window.close();
    setImmediate(() => openProfileWindow());
    return { success: true };
  });
}


/* Updates and release notifications */
handle("browser-check-update", async () => {
  if (app.isPackaged && autoUpdater) return checkAutomaticUpdate();
  return fetchUpdateInfo();
});
handle("browser-open-updates", (event) => openManagerWindow("updates", ctxFrom(event)));
handle("browser-open-update-download", async (_event, url) => {
  const target = String(url || UPDATE_RELEASES_URL);
  if (!target.startsWith("https://github.com/")) throw new Error("Update URL was blocked.");
  await shell.openExternal(target);
  return { success: true };
});
handle("updates-get", async (event) => {
  managerRecord(event);
  const release = await fetchUpdateInfo();
  return { ...release, updater: { ...updaterState }, automatic: browserSettings.autoUpdateEnabled !== false };
});
handle("updates-check-now", async (event) => {
  managerRecord(event);
  if (app.isPackaged && autoUpdater) return checkAutomaticUpdate();
  return fetchUpdateInfo();
});
handle("updates-open-url", async (event, url) => {
  managerRecord(event);
  const target = String(url || UPDATE_RELEASES_URL);
  if (!target.startsWith("https://github.com/")) throw new Error("Update URL was blocked.");
  await shell.openExternal(target);
  return { success: true };
});

/* App startup */

app.setName("Evasion Browser");

if (process.platform === "win32") {
  app.setAppUserModelId("com.evasion.browser");
}

app.whenReady().then(async () => {
  applyPerformancePolicy();
  setInterval(() => {
    const pressure = os.freemem() / os.totalmem();
    if (browserSettings.memorySaver || pressure < 0.18) applyPerformancePolicy();
  }, 30000).unref?.();
  browserStore = new BrowserStore(app.getPath("userData"));
  await browserStore.load();
  const totalMemoryGB = os.totalmem() / 1073741824;
  if (totalMemoryGB <= 4.5 && browserStore.data.settings.lowMemoryMode !== false) {
    browserStore.data.settings.lowMemoryMode = true;
    browserStore.data.settings.memorySaver = true;
    browserStore.data.settings.performanceMode = "eco";
    browserStore.data.settings.sleepingTabsMinutes = Math.min(Number(browserStore.data.settings.sleepingTabsMinutes || 5), 5);
    browserStore.data.settings.ramLimit = Math.min(Number(browserStore.data.settings.ramLimit || 3072), 3072);
    await browserStore.save();
  }
  browserSettings = browserStore.data.settings;
  history.push(...browserStore.data.history.slice(-1000));
  for (const item of browserStore.data.bookmarks) if (item?.url) bookmarks.set(item.url, item);
  vault = new VaultService(app.getPath("userData"));

  registerVaultHandlers();
  profileService = new ProfileService(app.getPath("userData"));
  await profileService.init();
  registerProfileHandlers();
  const persistentSession = session.fromPartition("persist:evasion-browser");
  for (const meta of browserStore.data.extensions) {
    try { const ext = await persistentSession.loadExtension(meta.path, { allowFileAccess: true }); loadedExtensions.set(ext.id, { ...meta, id: ext.id, name: ext.name, version: ext.version }); } catch (error) { console.warn("Extension restore failed:", meta.path, error.message); }
  }
  if (profileService.unlocked) createWindow();
  else openProfileWindow();
  configureAutomaticUpdater();
  await rememberInstalledVersion();
  if (browserSettings.autoUpdateEnabled !== false) {
    setTimeout(() => checkAutomaticUpdate(), 12000).unref?.();
    const updateTimer = setInterval(() => checkAutomaticUpdate(), 6 * 60 * 60 * 1000);
    updateTimer.unref?.();
  }


  app.on(
    "activate",
    () => {
      if (!BrowserWindow.getAllWindows().length) {
        if (profileService?.unlocked) createWindow();
        else openProfileWindow();
      }
    }
  );
});

app.on(
  "window-all-closed",
  () => {
    if (
      process.platform !==
      "darwin"
    ) {
      app.quit();
    }
  }
);