const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { safeStorage } = require('electron');

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const clean = (value, max = 100) => String(value || '').trim().slice(0, max);

class ProfileService {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'evasion-profile.json');
    this.record = null;
    this.unlocked = false;
    this.lastActivity = Date.now();
    this.lockMinutes = 30;
    this.timer = null;
  }

  async init() {
    try {
      this.record = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      this.lockMinutes = Number(this.record.lockMinutes) || 30;
      await this.tryRememberedLogin();
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Profile load failed:', error.message);
      this.record = null;
    }
    this.startTimer();
  }

  exists() { return Boolean(this.record?.auth?.salt && this.record?.auth?.hash); }
  status() {
    return {
      exists: this.exists(),
      unlocked: this.unlocked,
      profile: this.exists() ? this.publicProfile() : null,
      rememberEnabled: Boolean(this.record?.remember?.token),
      lockMinutes: this.lockMinutes
    };
  }

  publicProfile() {
    if (!this.record) return null;
    return {
      id: this.record.id,
      name: this.record.name,
      email: this.record.email || '',
      avatarColor: this.record.avatarColor || '#7c5cff',
      createdAt: this.record.createdAt,
      updatedAt: this.record.updatedAt
    };
  }

  derive(secret, salt) {
    return crypto.scryptSync(String(secret), Buffer.from(salt, 'base64'), 32, SCRYPT);
  }

  verify(secret, auth) {
    if (!secret || !auth?.salt || !auth?.hash) return false;
    const actual = this.derive(secret, auth.salt);
    const expected = Buffer.from(auth.hash, 'base64');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  }

  makeAuth(secret) {
    const salt = crypto.randomBytes(16);
    return {
      salt: salt.toString('base64'),
      hash: crypto.scryptSync(String(secret), salt, 32, SCRYPT).toString('base64')
    };
  }

  validatePassword(password) {
    const value = String(password || '');
    if (value.length < 8) throw new Error('Use at least 8 characters.');
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
      throw new Error('Include at least one letter and one number.');
    }
    if (/\s/.test(value)) throw new Error('Password cannot contain spaces.');
  }

  async create(input = {}) {
    if (this.exists()) throw new Error('A browser profile already exists.');
    const name = clean(input.name, 40);
    const email = clean(input.email, 100).toLowerCase();
    const password = String(input.password || '');
    const pin = String(input.pin || '').trim();
    if (!name) throw new Error('Enter your name.');
    this.validatePassword(password);
    if (pin && !/^\d{4,8}$/.test(pin)) throw new Error('PIN must contain 4 to 8 digits.');

    const now = Date.now();
    this.record = {
      version: 1,
      id: crypto.randomUUID(),
      name,
      email,
      avatarColor: clean(input.avatarColor, 20) || '#7c5cff',
      auth: this.makeAuth(password),
      pinAuth: pin ? this.makeAuth(pin) : null,
      lockMinutes: Math.max(1, Math.min(240, Number(input.lockMinutes) || 30)),
      remember: null,
      createdAt: now,
      updatedAt: now
    };
    this.lockMinutes = this.record.lockMinutes;
    this.unlocked = true;
    this.touch();
    await this.setRemember(Boolean(input.remember));
    await this.save();
    return this.status();
  }

  async login(input = {}) {
    if (!this.exists()) throw new Error('Create a profile first.');
    const credential = String(input.credential || '');
    const method = input.method === 'pin' ? 'pin' : 'password';
    const auth = method === 'pin' ? this.record.pinAuth : this.record.auth;
    if (!auth || !this.verify(credential, auth)) throw new Error(method === 'pin' ? 'Incorrect PIN.' : 'Incorrect password.');
    this.unlocked = true;
    this.touch();
    await this.setRemember(Boolean(input.remember));
    await this.save();
    return this.status();
  }

  async setRemember(enabled) {
    if (!enabled) { this.record.remember = null; return; }
    if (!safeStorage.isEncryptionAvailable()) { this.record.remember = null; return; }
    const payload = JSON.stringify({ id: this.record.id, expiresAt: Date.now() + 7 * 86400000 });
    this.record.remember = { token: safeStorage.encryptString(payload).toString('base64') };
  }

  async tryRememberedLogin() {
    try {
      const token = this.record?.remember?.token;
      if (!token || !safeStorage.isEncryptionAvailable()) return false;
      const payload = JSON.parse(safeStorage.decryptString(Buffer.from(token, 'base64')));
      if (payload.id === this.record.id && payload.expiresAt > Date.now()) {
        this.unlocked = true;
        this.touch();
        return true;
      }
    } catch { this.record.remember = null; }
    return false;
  }

  async update(input = {}) {
    this.assertUnlocked();
    const name = clean(input.name, 40);
    if (!name) throw new Error('Enter your name.');
    this.record.name = name;
    this.record.email = clean(input.email, 100).toLowerCase();
    this.record.avatarColor = clean(input.avatarColor, 20) || this.record.avatarColor;
    this.record.lockMinutes = Math.max(1, Math.min(240, Number(input.lockMinutes) || this.lockMinutes));
    this.lockMinutes = this.record.lockMinutes;
    this.record.updatedAt = Date.now();
    this.touch();
    await this.save();
    return this.status();
  }

  async changePassword(currentPassword, newPassword) {
    this.assertUnlocked();
    if (!this.verify(currentPassword, this.record.auth)) throw new Error('Current password is incorrect.');
    this.validatePassword(newPassword);
    this.record.auth = this.makeAuth(newPassword);
    this.record.remember = null;
    this.record.updatedAt = Date.now();
    await this.save();
    return { success: true };
  }

  async setPin(password, pin) {
    this.assertUnlocked();
    if (!this.verify(password, this.record.auth)) throw new Error('Password is incorrect.');
    const value = String(pin || '').trim();
    if (value && !/^\d{4,8}$/.test(value)) throw new Error('PIN must contain 4 to 8 digits.');
    this.record.pinAuth = value ? this.makeAuth(value) : null;
    this.record.updatedAt = Date.now();
    await this.save();
    return { success: true, hasPin: Boolean(this.record.pinAuth) };
  }

  async resetAll(password) {
    this.assertUnlocked();
    if (!this.verify(password, this.record.auth)) throw new Error('Password is incorrect.');
    clearInterval(this.timer);
    this.unlocked = false;
    this.record = null;
    this.lockMinutes = 30;
    try { await fs.rm(this.filePath, { force: true }); } catch {}
    this.startTimer();
    return { success: true };
  }

  lock({ forget = false } = {}) {
    this.unlocked = false;
    if (forget && this.record) { this.record.remember = null; this.save().catch(() => {}); }
    return this.status();
  }

  touch() { this.lastActivity = Date.now(); }
  assertUnlocked() { if (!this.unlocked) throw new Error('Profile is locked.'); }
  async save() { await fs.mkdir(path.dirname(this.filePath), { recursive: true }); await fs.writeFile(this.filePath, JSON.stringify(this.record, null, 2), { mode: 0o600 }); }
  startTimer() {
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.unlocked && Date.now() - this.lastActivity > this.lockMinutes * 60000) this.lock();
    }, 30000);
    this.timer.unref?.();
  }
}

module.exports = { ProfileService };
