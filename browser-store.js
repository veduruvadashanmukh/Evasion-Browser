const fs = require('fs/promises');
const path = require('path');

const DEFAULTS = {
  settings: {
    theme: 'dark',
    searchEngine: 'google',
    customSearchUrl: '',
    startup: 'restore',
    homepage: 'local',
    customHomepage: '',
    defaultZoom: 100,
    downloadPath: '',
    askDownloadLocation: false,
    doNotTrack: true,
    blockTrackers: true,
    blockPopups: true,
    restoreSession: true,

    showBookmarksBar: false,
    accentColor: '#7c5cff',
    performanceMode: 'balanced',
    memorySaver: true,
    cpuLimit: 80,
    ramLimit: 4096,
    gamingSounds: false,
    animatedBackground: true,
    sidebarEnabled: true,
    focusMode: false,
    securityLevel: 'balanced',
    blockAds: true,
    blockFingerprinting: true,
    blockCryptominers: true,
    stripTrackingParams: true,
    blockThirdPartyCookies: true,
    httpsFirst: false,
    permissionProtection: true,
    profileMode: 'personal',
    sleepingTabsMinutes: 20,
    streamingMode: false,
    gamingSessionMode: false,
    autoShredOnClose: false,
    lowMemoryMode: false,
    maxActiveTabs: 24,
    autoUpdateEnabled: true,
    updateChannel: 'stable',
    showWhatsNew: true
  },
  quickLaunch: [
    { id: 'discord', name: 'Discord', url: 'https://discord.com/app' },
    { id: 'youtube', name: 'YouTube', url: 'https://www.youtube.com' },
    { id: 'gmail', name: 'Gmail', url: 'https://mail.google.com' },
    { id: 'github', name: 'GitHub', url: 'https://github.com' },
    { id: 'chatgpt', name: 'ChatGPT', url: 'https://chatgpt.com' },
    { id: 'spotify', name: 'Spotify', url: 'https://open.spotify.com' }
  ],
  bookmarks: [],
  history: [],
  sessionTabs: [],
  extensions: [],
  groups: [],
  notes: [],
  workspaces: [],
  tasks: [],
  pomodoro: { focusMinutes: 25, breakMinutes: 5 },
  ai: { provider: 'local', endpoint: '', model: '' },
  toolSettings: { analyticsEnabled: true },
  sync: { endpoint: '', username: '', password: '', deviceKey: '', lastSync: 0 },
  companion: {},
  knowledgeVault: [],
  advanced: { crashRecovery: true, safeMode: false, lastHealthyStart: 0, lastLaunchedVersion: '', pendingUpdateVersion: '', lastUpdateError: '' },
  extensionCatalog: [
    { id: 'ublock-origin-lite', name: 'uBlock Origin Lite', category: 'Privacy', url: 'https://github.com/gorhill/uBOL-home' },
    { id: 'dark-reader', name: 'Dark Reader', category: 'Appearance', url: 'https://github.com/darkreader/darkreader' },
    { id: 'bitwarden', name: 'Bitwarden', category: 'Passwords', url: 'https://github.com/bitwarden/clients' },
    { id: 'react-devtools', name: 'React Developer Tools', category: 'Developer', url: 'https://github.com/facebook/react' }
  ]
};

class BrowserStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'evasion-browser-data.json');
    this.legacyFilePath = path.join(userDataPath, 'devika-browser-data.json');
    this.data = structuredClone(DEFAULTS);
    this.queue = Promise.resolve();
  }

  async load() {
    try {
      let source = this.filePath;
      try { await fs.access(source); } catch { try { await fs.access(this.legacyFilePath); source = this.legacyFilePath; } catch {} }
      const parsed = JSON.parse(await fs.readFile(source, 'utf8'));
      this.data = {
        ...structuredClone(DEFAULTS),
        ...parsed,
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
        quickLaunch: Array.isArray(parsed.quickLaunch) ? parsed.quickLaunch : structuredClone(DEFAULTS.quickLaunch),
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
        history: Array.isArray(parsed.history) ? parsed.history : [],
        sessionTabs: Array.isArray(parsed.sessionTabs) ? parsed.sessionTabs : [],
        extensions: Array.isArray(parsed.extensions) ? parsed.extensions : [],
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        workspaces: Array.isArray(parsed.workspaces) ? parsed.workspaces : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        pomodoro: { ...DEFAULTS.pomodoro, ...(parsed.pomodoro || {}) },
        ai: { ...DEFAULTS.ai, ...(parsed.ai || {}) },
        toolSettings: { ...DEFAULTS.toolSettings, ...(parsed.toolSettings || {}) },
        sync: { ...DEFAULTS.sync, ...(parsed.sync || {}) },
        companion: { ...DEFAULTS.companion, ...(parsed.companion || {}) },
        knowledgeVault: Array.isArray(parsed.knowledgeVault) ? parsed.knowledgeVault : [],
        advanced: { ...DEFAULTS.advanced, ...(parsed.advanced || {}) },
        extensionCatalog: Array.isArray(parsed.extensionCatalog) ? parsed.extensionCatalog : DEFAULTS.extensionCatalog
      };
    } catch {
      await this.save();
    }
    return this.data;
  }

  async reset() {
    await this.queue;
    this.data = structuredClone(DEFAULTS);
    await Promise.allSettled([
      fs.rm(this.filePath, { force: true }),
      fs.rm(this.legacyFilePath, { force: true })
    ]);
    return this.data;
  }

  save() {
    this.queue = this.queue.then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const temp = `${this.filePath}.tmp`;
      await fs.writeFile(temp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      await fs.rename(temp, this.filePath);
    }).catch((error) => console.error('Store save error:', error));
    return this.queue;
  }
}

module.exports = { BrowserStore, DEFAULTS };
