const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const clean = (value, max = 100) => String(value || '').trim().slice(0, max);
class ProfileService {
  constructor(userDataPath) { this.filePath = path.join(userDataPath, 'evasion-profile.json'); this.record = null; this.unlocked = true; }
  async init() { try { this.record = JSON.parse(await fs.readFile(this.filePath, 'utf8')); if (this.record) { delete this.record.auth; delete this.record.pinAuth; delete this.record.remember; this.record.version = 3; await this.save(); } } catch (error) { if (error.code !== 'ENOENT') console.warn('Profile load failed:', error.message); this.record = null; } this.unlocked = true; }
  exists() { return Boolean(this.record?.id && this.record?.name); }
  status() { return { exists: this.exists(), unlocked: true, profile: this.exists() ? this.publicProfile() : null }; }
  publicProfile() { if (!this.record) return null; return { id: this.record.id, name: this.record.name, email: this.record.email || '', avatarColor: this.record.avatarColor || '#7c5cff', createdAt: this.record.createdAt, updatedAt: this.record.updatedAt }; }
  async create(input = {}) { if (this.exists()) throw new Error('A browser profile already exists.'); const name = clean(input.name, 40); if (!name) throw new Error('Enter your name.'); const now = Date.now(); this.record = { version: 3, id: crypto.randomUUID(), name, email: clean(input.email, 100).toLowerCase(), avatarColor: clean(input.avatarColor, 20) || '#7c5cff', createdAt: now, updatedAt: now }; await this.save(); return this.status(); }
  async login() { return this.status(); }
  async refreshSession() { return this.status(); }
  async update(input = {}) { const name = clean(input.name, 40); if (!name) throw new Error('Enter your name.'); this.record.name = name; this.record.email = clean(input.email, 100).toLowerCase(); this.record.avatarColor = clean(input.avatarColor, 20) || this.record.avatarColor; this.record.updatedAt = Date.now(); await this.save(); return this.status(); }
  async logout() { return this.status(); }
  async resetAll() { this.record = null; try { await fs.rm(this.filePath, { force: true }); } catch {} return { success: true }; }
  assertUnlocked() {}
  async save() { if (!this.record) return; await fs.mkdir(path.dirname(this.filePath), { recursive: true }); await fs.writeFile(this.filePath, JSON.stringify(this.record, null, 2), { mode: 0o600 }); }
}
module.exports = { ProfileService, SESSION_MS: 0 };
