const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const { safeStorage } = require('electron');

const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const clean = (value, max = 100) => String(value || '').trim().slice(0, max);

class ProfileService {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'evasion-profile.json');
    this.record = null;
    this.unlocked = false;
  }

  async init() {
    try {
      this.record = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
      await this.tryRememberedLogin();
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn('Profile load failed:', error.message);
      this.record = null;
      this.unlocked = false;
    }
  }

  exists() { return Boolean(this.record?.auth?.salt && this.record?.auth?.hash); }

  status() {
    return {
      exists: this.exists(),
      unlocked: this.unlocked,
      profile: this.exists() ? this.publicProfile() : null,
      rememberEnabled: Boolean(this.record?.remember?.token),
      sessionExpiresAt: Number(this.record?.remember?.expiresAt || 0)
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
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) throw new Error('Include at least one letter and one number.');
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
      version: 2,
      id: crypto.randomUUID(),
      name,
      email,
      avatarColor: clean(input.avatarColor, 20) || '#7c5cff',
      auth: this.makeAuth(password),
      pinAuth: pin ? this.makeAuth(pin) : null,
      remember: null,
      createdAt: now,
      updatedAt: now
    };
    this.unlocked = true;
    await this.refreshRememberedLogin();
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
    await this.refreshRememberedLogin();
    await this.save();
    return this.status();
  }

  async refreshRememberedLogin() {
    if (!this.record || !safeStorage.isEncryptionAvailable()) {
      if (this.record) this.record.remember = null;
      return false;
    }
    const expiresAt = Date.now() + SESSION_MS;
    const payload = JSON.stringify({ id: this.record.id, expiresAt });
    this.record.remember = {
      token: safeStorage.encryptString(payload).toString('base64'),
      expiresAt
    };
    return true;
  }

  async tryRememberedLogin() {
    try {
      const token = this.record?.remember?.token;
      if (!token || !safeStorage.isEncryptionAvailable()) return false;
      const payload = JSON.parse(safeStorage.decryptString(Buffer.from(token, 'base64')));
      if (payload.id !== this.record.id || payload.expiresAt <= Date.now()) {
        this.record.remember = null;
        await this.save();
        return false;
      }
      this.unlocked = true;
      await this.refreshRememberedLogin();
      await this.save();
      return true;
    } catch {
      if (this.record) {
        this.record.remember = null;
        await this.save().catch(() => {});
      }
      return false;
    }
  }

  async refreshSession() {
    this.assertUnlocked();
    await this.refreshRememberedLogin();
    await this.save();
    return this.status();
  }

  async update(input = {}) {
    this.assertUnlocked();
    const name = clean(input.name, 40);
    if (!name) throw new Error('Enter your name.');
    this.record.name = name;
    this.record.email = clean(input.email, 100).toLowerCase();
    this.record.avatarColor = clean(input.avatarColor, 20) || this.record.avatarColor;
    this.record.updatedAt = Date.now();
    await this.refreshRememberedLogin();
    await this.save();
    return this.status();
  }

  async changePassword(currentPassword, newPassword) {
    this.assertUnlocked();
    if (!this.verify(currentPassword, this.record.auth)) throw new Error('Current password is incorrect.');
    this.validatePassword(newPassword);
    this.record.auth = this.makeAuth(newPassword);
    this.record.updatedAt = Date.now();
    await this.refreshRememberedLogin();
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
    await this.refreshRememberedLogin();
    await this.save();
    return { success: true, hasPin: Boolean(this.record.pinAuth) };
  }

  async logout() {
    this.unlocked = false;
    if (this.record) {
      this.record.remember = null;
      await this.save();
    }
    return this.status();
  }

  async resetAll(password) {
    this.assertUnlocked();
    if (!this.verify(password, this.record.auth)) throw new Error('Password is incorrect.');
    this.unlocked = false;
    this.record = null;
    try { await fs.rm(this.filePath, { force: true }); } catch {}
    return { success: true };
  }

  assertUnlocked() { if (!this.unlocked) throw new Error('Profile is signed out.'); }
  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.record, null, 2), { mode: 0o600 });
  }
}

module.exports = { ProfileService, SESSION_MS };
