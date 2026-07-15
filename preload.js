const { contextBridge, ipcRenderer } = require("electron");

const invoke = (channel, ...args) =>
    ipcRenderer.invoke(channel, ...args);

function listen(channel, callback) {
    if (typeof callback !== "function") {
        return () => {};
    }

    const listener = (_event, payload) => callback(payload);

    ipcRenderer.on(channel, listener);

    return () => {
        ipcRenderer.removeListener(channel, listener);
    };
}

contextBridge.exposeInMainWorld("browserAPI", {
    /* Navigation */

    navigate: (input) =>
        invoke("browser-navigate", input),

    goBack: () =>
        invoke("browser-back"),

    goForward: () =>
        invoke("browser-forward"),

    reload: () =>
        invoke("browser-reload"),

    stop: () =>
        invoke("browser-stop"),

    goHome: () =>
        invoke("browser-home"),

    /* Tabs */

    newTab: (options = {}) =>
        invoke("browser-new-tab", options),

    switchTab: (tabId) =>
        invoke("browser-switch-tab", tabId),

    closeTab: (tabId) =>
        invoke("browser-close-tab", tabId),

    closeOtherTabs: (tabId) =>
        invoke(
            "browser-close-other-tabs",
            tabId
        ),

    closeTabsToRight: (tabId) =>
        invoke(
            "browser-close-tabs-to-right",
            tabId
        ),

    duplicateTab: (tabId) =>
        invoke(
            "browser-duplicate-tab",
            tabId
        ),

    restoreClosedTab: () =>
        invoke(
            "browser-restore-closed-tab"
        ),

    getTabs: () =>
        invoke("browser-get-tabs"),

    getActiveTab: () =>
        invoke("browser-get-active-tab"),

    moveTab: (tabId, newIndex) =>
        invoke("browser-move-tab", {
            tabId,
            newIndex
        }),

    /* Windows */

    newWindow: () =>
        invoke("browser-new-window"),

    newIncognitoWindow: () =>
        invoke(
            "browser-new-incognito-window"
        ),

    /* Internal browser pages */

    openHistory: () =>
        invoke("browser-open-history"),

    openDownloads: () =>
        invoke("browser-open-downloads"),

    openBookmarks: () =>
        invoke("browser-open-bookmarks"),

    openSettings: () =>
        invoke("browser-open-settings"),

    openHelp: () =>
        invoke("browser-open-help"),

    openPasswords: () =>
        invoke("browser-open-passwords"),

    openExtensions: () =>
        invoke("browser-open-extensions"),

    checkForUpdates: () => invoke("browser-check-update"),
    openUpdates: () => invoke("browser-open-updates"),
    openUpdateDownload: (url) => invoke("browser-open-update-download", url),

    openTabGroups: () =>
        invoke("browser-open-tab-groups"),

    openGaming: () =>
        invoke("browser-open-gaming"),

    openSecurity: () =>
        invoke("browser-open-security"),

    openTools: () =>
        invoke("browser-open-tools"),

    openEvolution: () =>
        invoke("browser-open-evolution"),

    openAdvanced: () =>
        invoke("browser-open-advanced"),

    /* Zoom */

    zoomIn: () =>
        invoke("browser-zoom-in"),

    zoomOut: () =>
        invoke("browser-zoom-out"),

    resetZoom: () =>
        invoke("browser-zoom-reset"),

    getZoom: () =>
        invoke("browser-get-zoom"),

    /* Full screen */

    toggleFullScreen: () =>
        invoke(
            "browser-toggle-fullscreen"
        ),

    /* Page actions */

    printPage: () =>
        invoke("browser-print"),

    savePageAsPDF: () =>
        invoke("browser-save-pdf"),

    openDeveloperTools: () =>
        invoke("browser-open-devtools"),

    sharePage: () =>
        invoke("browser-share-page"),

    /* Find on page */

    findInPage: (text, options = {}) =>
        invoke("browser-find-in-page", {
            text,
            options
        }),

    stopFindInPage: (
        action = "clearSelection"
    ) =>
        invoke(
            "browser-stop-find",
            action
        ),

    /* Browser data */

    clearBrowsingData: () =>
        invoke("browser-clear-data"),

    toggleBookmark: () =>
        invoke("browser-toggle-bookmark"),

    /* Overlay */

    setOverlayVisible: (visible) =>
        invoke(
            "browser-set-overlay-visible",
            Boolean(visible)
        ),

    /* Application */

    openProfile: () => invoke("browser-open-profile"),
    getProfile: () => invoke("browser-get-profile"),
    lockProfile: () => invoke("browser-lock-profile"),

    exitBrowser: () =>
        invoke("browser-exit"),

    /* Events */

    onStateUpdated: (callback) =>
        listen(
            "browser-state-updated",
            callback
        ),

    onTabsUpdated: (callback) =>
        listen(
            "browser-tabs-updated",
            callback
        ),

    onTabCreated: (callback) =>
        listen(
            "browser-tab-created",
            callback
        ),

    onTabUpdated: (callback) =>
        listen(
            "browser-tab-updated",
            callback
        ),

    onTabClosed: (callback) =>
        listen(
            "browser-tab-closed",
            callback
        ),

    onActiveTabChanged: (callback) =>
        listen(
            "browser-active-tab-changed",
            callback
        ),

    onZoomUpdated: (callback) =>
        listen(
            "browser-zoom-updated",
            callback
        ),

    onFindResult: (callback) =>
        listen(
            "browser-find-result",
            callback
        ),

    onFullScreenChanged: (callback) =>
        listen(
            "browser-fullscreen-changed",
            callback
        ),


    onSettingsUpdated: (callback) =>
        listen(
            "browser-settings-updated",
            callback
        ),
    onUpdateAvailable: (callback) => listen("browser-update-available", callback),

    onBookmarkUpdated: (callback) =>
        listen(
            "browser-bookmark-updated",
            callback
        )
});