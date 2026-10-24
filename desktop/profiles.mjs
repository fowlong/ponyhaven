import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { username } from './license.mjs';

export async function atomicJSON(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = file + '.tmp';
  await fs.writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
  await fs.copyFile(file, file + '.previous').catch((e) => {
    if (e.code !== 'ENOENT') throw e;
  });
  await fs.rename(temporary, file);
}

export class Profiles {
  constructor(root, encryption, productId) {
    this.root = root;
    this.encryption = encryption;
    this.productId = productId;
    this.queue = Promise.resolve();
    this.index = { active: null, profiles: [] };
  }
  async init() {
    await fs.mkdir(this.root, { recursive: true });
    try {
      const index = JSON.parse(await fs.readFile(path.join(this.root, 'profiles.json'), 'utf8'));
      if (Array.isArray(index.profiles) && index.profiles.every((p) =>
        /^[a-f0-9-]{36}$/.test(p.id) && typeof p.name === 'string')) this.index = index;
    } catch (e) { if (e.code !== 'ENOENT') throw new Error('The profile index needs recovery. Its files have been preserved.'); }
    return this.status();
  }
  status() {
    return {
      activated: true,
      profile: this.index.profiles.find((p) => p.id === this.index.active) || null,
      profiles: this.index.profiles.map((p) => ({ ...p })),
    };
  }
  requireActive() {
    const p = this.status().profile;
    if (!p) throw new Error('Choose a local profile first.');
    return p;
  }
  async create(value) {
    return this.mutateIndex(async()=>{
    const name = username(value);
    if (this.index.profiles.some((p) => p.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      throw new Error('That name already has a profile on this computer.');
    const p = { id: randomUUID(), name, createdAt: Date.now() };
    this.index.profiles.push(p);
    this.index.active = p.id;
    await atomicJSON(path.join(this.root, 'profiles.json'), this.index);
    return this.status();
    });
  }
  async select(id) {
    return this.mutateIndex(async()=>{
    if (!this.index.profiles.some((p) => p.id === id)) throw new Error('Profile not found.');
    this.index.active = id;
    await atomicJSON(path.join(this.root, 'profiles.json'), this.index);
    return this.status();
    });
  }
  async rename(value) {
    return this.mutateIndex(async()=>{
    const p = this.requireActive(), name = username(value);
    if (this.index.profiles.some((q) => q.id !== p.id && q.name.toLocaleLowerCase() === name.toLocaleLowerCase()))
      throw new Error('That name already has a profile on this computer.');
    p.name = name;
    await atomicJSON(path.join(this.root, 'profiles.json'), this.index);
    return this.status();
    });
  }
  mutateIndex(action) {
    const task=this.queue.catch(()=>{}).then(action);
    this.queue=task;
    return task;
  }
  async read() {
    await this.queue.catch(()=>{});
    const p = this.requireActive();
    try { return JSON.parse(await fs.readFile(this.file(p.id), 'utf8')); }
    catch (e) {
      if (e.code === 'ENOENT') return null;
      throw new Error('This save needs recovery. The current and previous files have been preserved.');
    }
  }
  file(id) { return path.join(this.root, 'profiles', id, 'save.json'); }
  async linkCloud(uid) {
    return this.mutateIndex(async()=>{
      const p=this.requireActive();
      if(uid!==null && (typeof uid!=='string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(uid)))throw new Error('Invalid sync account.');
      if(uid && this.index.profiles.some(q=>q.id!==p.id && q.cloudUid===uid))throw new Error('That sync account is already linked to another local profile. Switch to that profile first.');
      p.cloudUid=uid;
      await atomicJSON(path.join(this.root,'profiles.json'),this.index);
      return this.status();
    });
  }
  write(save) {
    const p = this.requireActive();
    // Full game validation also happens in the renderer. Bound and constrain IPC here.
    if (!save || save.version !== 1 || !Number.isFinite(save.coins) || save.coins < 0 ||
        !save.collection || !save.ponyProgress || !Array.isArray(save.petUnlocks) ||
        JSON.stringify(save).length > 4_000_000) throw new Error('This save could not be stored.');
    const copy = structuredClone({ ...save, name: p.cloudUid ? String(save.name || p.name).slice(0,24) : p.name });
    const task = this.queue.catch(() => {}).then(() => atomicJSON(this.file(p.id), copy));
    this.queue = task;
    return task;
  }
  async backup(label = 'backup') {
    const p = this.requireActive();
    const save = await this.read();
    if (save) await atomicJSON(path.join(this.root, 'profiles', p.id, `${label}-${Date.now()}.json`), save);
  }
}
