const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

class VaultService {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, 'evasion-password-vault.json');
    this.legacyFilePath = path.join(userDataPath, 'devika-password-vault.json');
    this.key = null;
    this.data = null;
    this.timer = null;
    this.autoLockMs = 10 * 60 * 1000;
  }

  setAutoLockMinutes(minutes) {
    const value = Math.max(1, Math.min(120, Number(minutes) || 10));
    this.autoLockMs = value * 60 * 1000;
    this.touch();
  }

  async exists() {
    try { await fs.access(this.filePath); return true; } catch {}
    try { await fs.access(this.legacyFilePath); await fs.copyFile(this.legacyFilePath, this.filePath); return true; } catch { return false; }
  }

  status = async () => ({ exists: await this.exists(), unlocked: Boolean(this.key) });

  touch() {
    clearTimeout(this.timer);
    if (this.key) { this.timer = setTimeout(() => this.lock(), this.autoLockMs); this.timer.unref?.(); }
  }

  lock() {
    clearTimeout(this.timer);
    if (this.key) this.key.fill(0);
    this.key = null;
    this.data = null;
    return { success: true };
  }

  deriveKey(password, salt) {
    return crypto.scryptSync(String(password), salt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
  }

  encrypt(data, key, salt) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
    return {
      version: 1,
      kdf: 'scrypt',
      salt: salt.toString('base64'),
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64')
    };
  }

  decrypt(record, key) {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final()
    ]);
    return JSON.parse(plain.toString('utf8'));
  }

  async write() {
    if (!this.key || !this.data) throw new Error('Vault is locked.');
    const current = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    const salt = Buffer.from(current.salt, 'base64');
    const encrypted = this.encrypt(this.data, this.key, salt);
    await fs.writeFile(this.filePath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
    this.touch();
  }

  async create(masterPassword) {
    if (await this.exists()) throw new Error('A vault already exists.');
    if (String(masterPassword).length < 10) throw new Error('Master password must be at least 10 characters.');
    const salt = crypto.randomBytes(SALT_LENGTH);
    this.key = this.deriveKey(masterPassword, salt);
    this.data = { entries: [], createdAt: Date.now(), updatedAt: Date.now() };
    const encrypted = this.encrypt(this.data, this.key, salt);
    await fs.writeFile(this.filePath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
    this.touch();
    return { success: true };
  }

  async unlock(masterPassword) {
    const record = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
    const key = this.deriveKey(masterPassword, Buffer.from(record.salt, 'base64'));
    try {
      const data = this.decrypt(record, key);
      if (!data || !Array.isArray(data.entries)) throw new Error('Invalid vault.');
      this.lock();
      this.key = key;
      this.data = data;
      this.touch();
      return { success: true };
    } catch {
      key.fill(0);
      throw new Error('Incorrect master password or damaged vault.');
    }
  }

  requireUnlocked() {
    if (!this.key || !this.data) throw new Error('Vault is locked.');
    this.touch();
  }

  list() {
    this.requireUnlocked();
    return this.data.entries.map(({ password, ...entry }) => entry);
  }

  getSecret(id) {
    this.requireUnlocked();
    const entry = this.data.entries.find((item) => item.id === id);
    if (!entry) throw new Error('Login not found.');
    return { password: entry.password };
  }

  async add(input) {
    this.requireUnlocked();
    const entry = normalizeEntry(input);
    entry.id = crypto.randomUUID();
    entry.createdAt = entry.updatedAt = Date.now();
    this.data.entries.push(entry);
    this.data.updatedAt = Date.now();
    await this.write();
    return { ...entry, password: undefined };
  }

  async update(id, input) {
    this.requireUnlocked();
    const index = this.data.entries.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('Login not found.');
    const previous = this.data.entries[index];
    const next = normalizeEntry({ ...previous, ...input });
    this.data.entries[index] = { ...next, id, createdAt: previous.createdAt, updatedAt: Date.now() };
    this.data.updatedAt = Date.now();
    await this.write();
    const { password, ...safe } = this.data.entries[index];
    return safe;
  }

  async remove(id) {
    this.requireUnlocked();
    const before = this.data.entries.length;
    this.data.entries = this.data.entries.filter((item) => item.id !== id);
    if (before === this.data.entries.length) throw new Error('Login not found.');
    this.data.updatedAt = Date.now();
    await this.write();
    return { success: true };
  }

  async reset() {
    this.lock();
    await Promise.allSettled([
      fs.rm(this.filePath, { force: true }),
      fs.rm(this.legacyFilePath, { force: true })
    ]);
    return { success: true };
  }

  async changeMasterPassword(currentPassword, newPassword) {
    await this.unlock(currentPassword);
    if (String(newPassword).length < 10) throw new Error('New master password must be at least 10 characters.');
    const salt = crypto.randomBytes(SALT_LENGTH);
    const newKey = this.deriveKey(newPassword, salt);
    const encrypted = this.encrypt(this.data, newKey, salt);
    await fs.writeFile(this.filePath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
    this.key.fill(0);
    this.key = newKey;
    this.touch();
    return { success: true };
  }
}

function normalizeEntry(input = {}) {
  const website = String(input.website || '').trim();
  const username = String(input.username || '').trim();
  const password = String(input.password || '');
  const notes = String(input.notes || '').trim();
  if (!website || !username || !password) throw new Error('Website, username and password are required.');
  return { website, username, password, notes };
}

function generatePassword(options = {}) {
  const length = Math.max(8, Math.min(64, Number(options.length) || 20));
  const sets = [];
  if (options.lower !== false) sets.push('abcdefghijklmnopqrstuvwxyz');
  if (options.upper !== false) sets.push('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
  if (options.numbers !== false) sets.push('0123456789');
  if (options.symbols !== false) sets.push('!@#$%^&*()-_=+[]{};:,.?');
  if (!sets.length) throw new Error('Select at least one character type.');
  const all = sets.join('');
  const chars = sets.map((set) => set[crypto.randomInt(set.length)]);
  while (chars.length < length) chars.push(all[crypto.randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function strength(password) {
  const value = String(password || '');
  let score = 0;
  if (value.length >= 10) score++;
  if (value.length >= 16) score++;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^A-Za-z0-9]/.test(value)) score++;
  const labels = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong', 'Very strong'];
  return { score, label: labels[score] };
}

module.exports = { VaultService, generatePassword, strength };
