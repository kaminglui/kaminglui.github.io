// === Game loop & global state ===
let tileSize = 48;
const VIEW_W = 16;
const VIEW_H = 12;
const MAP_W = 60;
const MAP_H = 45;
const STATE_KEY = 'endless-depths-state-v1';
const LAYOUT_PREF_KEY = 'endless-depths-layout';
let resizeObserver = null;

const COLORS = {
  floor: '#151515',
  floorVis: '#222225',
  wall: '#444',
  wallVis: '#666',
  accent: '#4a9eff',
  danger: '#ff4a4a',
  story: '#ffd700'
};

const RARITY = {
  common: { color: '#a0a0a0', name: 'Common' },
  uncommon: { color: '#4aff4a', name: 'Uncommon' },
  rare: { color: '#4a9eff', name: 'Rare' },
  epic: { color: '#b15dff', name: 'Epic' },
  legendary: { color: '#ffd700', name: 'Legendary' }
};

const SKILLS_DB = {
  Bash: { name: 'Bash', cost: 5, desc: 'Heavy melee hit adjacent foes', icon: '💥' },
  Heal: { name: 'Heal', cost: 10, desc: 'Recover 30% HP', icon: '♥' },
  Storm: { name: 'Storm', cost: 20, desc: 'Damage visible enemies', icon: '⚡' },
  Stealth: { name: 'Stealth', cost: 15, desc: 'Drop Aggro', icon: '👻' },
  Fireball: { name: 'Fireball', cost: 12, desc: 'Ranged Magic Damage', icon: '🔥' }
};

const BIOMES = {
  SEWER: { name: 'Sewers', wall: '#3e3b32', floor: '#1a1914', mobs: ['rat', 'bat', 'slime'] },
  DUNGEON: { name: 'Dungeon', wall: '#444', floor: '#181818', mobs: ['goblin', 'skeleton', 'orc'] },
  CRYPT: { name: 'Crypt', wall: '#2a2a3a', floor: '#0f0f15', mobs: ['ghost', 'necromancer', 'skeleton_warrior'] },
  HELL: { name: 'Inferno', wall: '#3a1a1a', floor: '#1a0505', mobs: ['demon', 'imp', 'dragon'] },
  PURGATORY: { name: 'Purgatory', wall: '#111', floor: '#050505', mobs: ['spirit'] },
  ABYSS: { name: 'The Abyss', wall: '#220022', floor: '#110011', mobs: ['void_stalker', 'abyssal_horror'] },
  CELESTIAL: { name: 'Celestial Plane', wall: '#eeeeff', floor: '#ccccff', mobs: ['angel', 'archon'] }
};

const MAX_INV_SLOTS = 20;
const ITEM_TYPES = { WEAPON: 'weapon', ARMOR: 'armor', POTION: 'potion', MATERIAL: 'material', AMMO: 'ammo', KEY: 'key', BOOK: 'book' };

// === Audio engine ===
const AudioEngine = {
  ctx: null,
  isEnabled: false,
  nextNoteTime: 0,
  patternIndex: 0,
  currentTrack: 'normal',
  tracks: {
    normal: [{ f: 110, d: 0.4 }, { f: 130.8, d: 0.4 }, { f: 164.8, d: 0.4 }, { f: 130.8, d: 0.4 }, { f: 196, d: 0.4 }, { f: 164.8, d: 0.4 }, { f: 146.8, d: 0.8 }],
    boss: [{ f: 110, d: 0.15 }, { f: 110, d: 0.15 }, { f: 220, d: 0.15 }, { f: 0, d: 0.15 }, { f: 110, d: 0.15 }, { f: 110, d: 0.15 }, { f: 207, d: 0.15 }]
  },
  init() {
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.isEnabled = true;
    this.ctx.resume();
    this.scheduleMusic();
  },
  toggle() {
    if (!this.ctx) this.init();
    this.isEnabled = !this.isEnabled;
    if (this.isEnabled) {
      this.ctx.resume();
      this.scheduleMusic();
    } else {
      this.ctx.suspend();
    }
    const toggle = document.getElementById('audio-toggle');
    if (toggle) {
      toggle.innerText = this.isEnabled ? '♫ ON' : '♫ OFF';
      toggle.classList.toggle('on', this.isEnabled);
    }
  },
  setTrack(t) {
    if (this.currentTrack !== t) {
      this.currentTrack = t;
      this.patternIndex = 0;
    }
  },
  playTone(f, t, d, v = 0.1) {
    if (!this.isEnabled || !this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = t;
    o.frequency.setValueAtTime(f, this.ctx.currentTime);
    g.gain.setValueAtTime(v, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + d);
    o.connect(g);
    g.connect(this.ctx.destination);
    o.start();
    o.stop(this.ctx.currentTime + d);
  },
  sfx(t) {
    if (!this.isEnabled) return;
    if (t === 'hit') this.playTone(100, 'sawtooth', 0.1, 0.2);
    if (t === 'attack') this.playTone(Math.random() * 200 + 200, 'square', 0.05, 0.1);
    if (t === 'magic') this.playTone(800, 'sine', 0.3, 0.1);
    if (t === 'lvl') {
      setTimeout(() => this.playTone(440, 'square', 0.1), 0);
      setTimeout(() => this.playTone(554, 'square', 0.1), 100);
    }
    if (t === 'scrap') this.playTone(320, 'triangle', 0.08, 0.08);
  },
  scheduleMusic() {
    if (!this.isEnabled || !this.ctx) return;
    const lookAhead = 0.1;
    const pattern = this.tracks[this.currentTrack];
    while (this.nextNoteTime < this.ctx.currentTime + lookAhead) {
      const note = pattern[this.patternIndex];
      if (note.f > 0) {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = this.currentTrack === 'boss' ? 'sawtooth' : 'triangle';
        o.frequency.value = note.f;
        g.gain.value = 0.04;
        g.gain.linearRampToValueAtTime(0, this.nextNoteTime + note.d - 0.05);
        o.connect(g);
        g.connect(this.ctx.destination);
        o.start(this.nextNoteTime);
        o.stop(this.nextNoteTime + note.d);
      }
      this.nextNoteTime += note.d;
      this.patternIndex = (this.patternIndex + 1) % pattern.length;
    }
    setTimeout(() => this.scheduleMusic(), 50);
  }
};

function toggleAudio() {
  AudioEngine.toggle();
}

let canvas;
let ctx;
let gameState = 'START';
let map = [];
let entities = [];
let player = null;
let depth = 1;
let currentBiome = BIOMES.SEWER;
let lastTime = 0;
let savedPlayerState = null;
let storyProgress = { started: false, foundArtifactClue: false, defeatedFirstBoss: false, reachedFork: false, chosenPath: null, ending: null };
let journalEntries = [];
let saveTimeout = null;

function getTile(x, y) {
  if (y < 0 || x < 0 || y >= map.length || x >= (map[y]?.length || 0)) return null;
  return map[y][x];
}

const PALETTE = ['#00000000', '#fcc', '#c88', '#844', '#ddd', '#aaa', '#888', '#555', '#ffd700', '#b8860b', '#4a9eff', '#ff4a4a', '#b15dff'];
const SPRITES = {
  hero_base: [0, 0, 9, 9, 9, 9, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 2, 2, 2, 2, 0, 0, 0, 2, 2, 2, 2, 2, 2, 0, 0, 0, 3, 3, 3, 3, 0, 0, 0, 0, 3, 0, 0, 3, 0, 0],
  armor_leather: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 9, 9, 9, 9, 0, 0, 0, 9, 9, 9, 9, 9, 9, 0, 0, 9, 9, 9, 9, 9, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  armor_iron: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 0, 0, 0, 0, 5, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5, 5, 5, 5, 0, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 5, 5, 5, 5, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  weapon_dagger: [0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 7, 4, 0, 0, 0, 0, 0, 7, 7, 0, 0, 0, 0, 0, 7, 7, 0, 0, 0, 0, 0, 0, 7, 0, 0, 0, 0, 0, 0, 0],
  weapon_sword: [0, 0, 0, 0, 0, 0, 0, 4, 0, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 4, 4, 0, 0, 0, 0, 0, 7, 7, 4, 0, 0, 0, 0, 7, 7, 7, 0, 0, 0, 0, 0, 7, 7, 0, 0, 0, 0, 0, 0]
};

class Item {
  constructor(name, type, rarity, stats, weight, stack = 1, spriteName = null) {
    this.id = Math.random().toString(36).substr(2, 9);
    this.name = name;
    this.type = type;
    this.rarity = rarity;
    this.stats = stats;
    this.weight = weight;
    this.stack = stack;
    this.spriteName = spriteName;
    if (type === ITEM_TYPES.WEAPON || type === ITEM_TYPES.ARMOR) {
      this.maxDurability = rarity === 'common' ? 50 : rarity === 'uncommon' ? 100 : rarity === 'rare' ? 200 : rarity === 'epic' ? 500 : 9999;
      this.durability = this.maxDurability;
    }
  }
  get hash() {
    return `${this.name}|${this.rarity}|${JSON.stringify(this.stats)}|${this.durability}`;
  }
}

// === Items & crafting ===
const RECIPES = [
  { name: 'Void Blade', type: ITEM_TYPES.WEAPON, rarity: 'epic', stats: { atk: 14, crit: 0.3, speed: 250 }, weight: 4, req: { 'Scrap Metal': 5, 'Shadow Essence': 2 }, spriteName: 'weapon_sword' },
  { name: 'Elixir', type: ITEM_TYPES.POTION, rarity: 'rare', stats: { hp: 100 }, weight: 0.5, req: { 'Magic Dust': 3 } },
  { name: 'Iron Arrow', type: ITEM_TYPES.AMMO, rarity: 'common', stats: {}, weight: 0.1, req: { 'Scrap Metal': 1, 'Wood Plank': 1 } }
];

// === Entities & combat ===
class Entity {
  constructor(x, y, sprite, color, name, blocks) {
    this.x = x;
    this.y = y;
    this.sprite = sprite;
    this.color = color;
    this.name = name;
    this.blocks = blocks;
    this.dead = false;
  }
  draw(ctx, cx, cy, visible) {
    if (!visible && gameState !== 'PURGATORY') return;
    const sx = (this.x - cx) * tileSize;
    const sy = (this.y - cy) * tileSize;
    drawSprite(ctx, this.sprite, sx, sy, this.color, this);
  }
}

class Fighter extends Entity {
  constructor(x, y, sprite, color, name, stats) {
    super(x, y, sprite, color, name, true);
    this.maxHp = stats.hp;
    this.hp = stats.hp;
    this.maxMp = stats.mp || 0;
    this.mp = this.maxMp;
    this.baseStr = stats.str || 0;
    this.baseDef = stats.def || 0;
    this.xp = 0;
    this.level = 1;
    this.nextXp = 50;
    this.gold = 0;
    this.attackSpeed = stats.speed || 1000;
    this.actionTimer = 0;
    this.lastActionTime = 0;
    this.inventory = [];
    this.equipment = { weapon: null, armor: null };
    this.maxWeight = stats.maxWeight || 40;
    this.learnedSkills = ['Bash'];
    this.activeSkills = [0, null, null];
    this.occupation = 'Adventurer';
    this.isElite = stats.isElite || false;
    this.isBoss = stats.isBoss || false;
  }

  get str() {
    let s = this.baseStr;
    if (this.equipment.weapon && (this.equipment.weapon.durability > 0 || this.equipment.weapon.rarity === 'legendary')) s += this.equipment.weapon.stats.atk || 0;
    return s;
  }
  get def() {
    let d = this.baseDef;
    if (this.equipment.armor && (this.equipment.armor.durability > 0 || this.equipment.armor.rarity === 'legendary')) d += this.equipment.armor.stats.def || 0;
    return d;
  }
  get currentWeight() {
    let w = 0;
    if (this.equipment.weapon) w += this.equipment.weapon.weight;
    if (this.equipment.armor) w += this.equipment.armor.weight;
    this.inventory.forEach((i) => (w += i.weight * i.stack));
    return w;
  }
  get moveDelay() {
    return this.currentWeight > this.maxWeight ? 300 : 150;
  }
  get weaponSpeed() {
    return this.equipment.weapon ? this.equipment.weapon.stats.speed || 600 : 600;
  }
  get range() {
    return this.equipment.weapon ? this.equipment.weapon.stats.range || 1 : 1;
  }

  takeDamage(amt) {
    const dmg = Math.max(1, Math.floor(amt - this.def * 0.5));
    this.hp -= dmg;
    if (this.equipment.armor && this.equipment.armor.rarity !== 'legendary') {
      this.equipment.armor.durability = Math.max(0, this.equipment.armor.durability - 1);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      if (this === player) handleDeath();
      if (this.isBoss) spawnStairs(Math.floor(this.x), Math.floor(this.y));
    }
    if (this === player) {
      AudioEngine.sfx('hit');
      const flash = document.getElementById('damage-flash');
      if (flash) {
        flash.style.opacity = 0.5;
        setTimeout(() => (flash.style.opacity = 0), 100);
      }
      updateUI();
    }
    return dmg;
  }

  heal(amt) {
    this.hp = Math.min(this.maxHp, this.hp + amt);
    if (this === player) updateUI();
  }

  attack(target) {
    if (!target || typeof target.takeDamage !== 'function') return;
    AudioEngine.sfx('attack');
    if (this.equipment.weapon && this.equipment.weapon.rarity !== 'legendary') {
      this.equipment.weapon.durability = Math.max(0, this.equipment.weapon.durability - 1);
    }
    let dmg = this.str;
    if (this.range > 1) {
      if (this === player) {
        const idx = this.inventory.findIndex((i) => i.type === ITEM_TYPES.AMMO);
        if (idx === -1) {
          log('No Arrows!', 'log-danger');
          return;
        }
        if (this.occupation !== 'Archer' || Math.random() > 0.2) {
          this.inventory[idx].stack--;
          if (this.inventory[idx].stack <= 0) this.inventory.splice(idx, 1);
        }
        updateUI();
      }
      createProjectile(this.x, this.y, target.x, target.y, 'magic');
      AudioEngine.sfx('magic');
    }
    const dealt = target.takeDamage(dmg);
    if (this === player) log(`Hit ${target.name} for ${dealt}`, 'log-success');
    if (target.dead && this === player) {
      this.gainXp(target.xpVal);
      if (Math.random() < 0.4 || target.isElite || target.isBoss) dropLoot(target);
    }
  }

  gainXp(amt) {
    this.xp += amt;
    if (this.xp >= this.nextXp) {
      this.level++;
      this.xp -= this.nextXp;
      this.nextXp = Math.floor(this.nextXp * 1.5);
      this.maxHp += 10;
      this.hp = this.maxHp;
      this.maxMp += 5;
      this.mp = this.maxMp;
      if (this.level >= 3 && this.equipment.weapon?.name.includes('Bow') && this.occupation === 'Adventurer') this.occupation = 'Archer';
      log('Level Up!', 'log-loot');
      AudioEngine.sfx('lvl');
      updateUI();
    }
  }
}

class Chest extends Entity {
  constructor(x, y, locked) {
    super(x, y, locked ? 'chest_locked' : 'chest', locked ? '#ffd700' : '#854', locked ? 'Gold Chest' : 'Chest', true);
    this.locked = locked;
  }
  interact() {
    if (this.locked) {
      const keyIdx = player.inventory.findIndex((i) => i.type === ITEM_TYPES.KEY);
      if (keyIdx !== -1) {
        player.inventory[keyIdx].stack--;
        if (player.inventory[keyIdx].stack <= 0) player.inventory.splice(keyIdx, 1);
        log('Unlocked!', 'log-success');
        this.open();
      } else log('Locked.', 'log-danger');
    } else this.open();
  }
  open() {
    this.dead = true;
    const item = generateLoot(this.locked ? 10 : 1, this.locked ? 'epic' : 'uncommon');
    entities.push(new LootItem(this.x, this.y, item));
    updateUI();
  }
}

class LootItem extends Entity {
  constructor(x, y, item) {
    super(x, y, item.type === 'potion' || item.type === 'ammo' ? 'potion' : 'loot', RARITY[item.rarity].color, item.name, false);
    this.item = item;
  }
}

function setLayoutMode(isWide) {
  const wrapper = document.getElementById('game-wrapper');
  const toggle = document.getElementById('layout-toggle');
  if (wrapper) wrapper.classList.toggle('depths-layout--wide', isWide);
  if (toggle) {
    toggle.setAttribute('aria-pressed', String(isWide));
    toggle.classList.toggle('is-active', isWide);
    toggle.innerText = isWide ? 'Wide view: On' : 'Wide view';
  }

  try {
    localStorage.setItem(LAYOUT_PREF_KEY, isWide ? 'wide' : 'default');
  } catch (error) {
    console.warn('Unable to save layout preference', error);
  }
}

function loadLayoutPreference() {
  try {
    return localStorage.getItem(LAYOUT_PREF_KEY);
  } catch (error) {
    console.warn('Unable to read layout preference', error);
    return null;
  }
}

// === Input handling & bootstrap ===
function init() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  const container = document.getElementById('canvas-container');
  setupResizeHandling(container);
  setupFullscreenToggle(container);

  const clearBtn = document.getElementById('clear-cache-btn');
  clearBtn?.addEventListener('click', () => {
    clearSavedState();
    document.getElementById('overlay-msg').innerText = 'Cache cleared. Start a fresh run when ready!';
    document.getElementById('new-run-btn').classList.add('hidden');
    document.getElementById('start-btn').innerText = 'Enter Dungeon';
  });

  const layoutToggle = document.getElementById('layout-toggle');
  const pref = loadLayoutPreference();
  setLayoutMode(pref === 'wide');
  layoutToggle?.addEventListener('click', () => {
    const wrapper = document.getElementById('game-wrapper');
    const nextWide = !wrapper?.classList.contains('depths-layout--wide');
    setLayoutMode(nextWide);
  });

  document.getElementById('start-btn').onclick = () => startGame(!!loadSavedState());
  document.getElementById('purgatory-btn').onclick = enterPurgatory;
  document.getElementById('new-run-btn').onclick = () => {
    clearSavedState();
    startGame(false);
  };

  const cached = loadSavedState();
  if (cached) {
    document.getElementById('overlay-msg').innerText = 'Cached progress found. Continue your run or start fresh.';
    document.getElementById('start-btn').innerText = 'Continue Run';
    document.getElementById('new-run-btn').classList.remove('hidden');
  }

  window.keys = {};
  window.onkeydown = (e) => {
    window.keys[e.key] = true;
    if (e.key >= '1' && e.key <= '3') useSkill(player?.activeSkills[parseInt(e.key) - 1]);
    if (e.key.toLowerCase() === 'f') fireRanged();
  };
  window.onkeyup = (e) => (window.keys[e.key] = false);
  canvas.onmousemove = handleMouseMove;
  requestAnimationFrame(gameLoop);
}

function setupResizeHandling(container) {
  const resizeCanvas = () => updateCanvasSize(container);
  resizeCanvas();
  if (window.ResizeObserver && container) {
    resizeObserver?.disconnect();
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(container);
  } else {
    window.addEventListener('resize', resizeCanvas);
  }
}

function updateCanvasSize(container = document.getElementById('canvas-container')) {
  if (!canvas || !container) return;
  const availableWidth = container.clientWidth;
  const availableHeight = container.clientHeight;
  if (!availableWidth || !availableHeight) return;

  const nextTileSize = Math.max(1, Math.floor(Math.min(availableWidth / VIEW_W, availableHeight / VIEW_H)));
  tileSize = nextTileSize;
  const canvasWidth = tileSize * VIEW_W;
  const canvasHeight = tileSize * VIEW_H;

  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;
  container.style.setProperty('--canvas-width', `${canvasWidth}px`);
  container.style.setProperty('--canvas-height', `${canvasHeight}px`);

  ['overlay', 'fx-layer', 'damage-flash'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.style.width = `${canvasWidth}px`;
      el.style.height = `${canvasHeight}px`;
    }
  });
}

function setupFullscreenToggle(container) {
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  const wrapper = document.getElementById('game-wrapper');
  if (!fullscreenBtn || !container || !wrapper) return;

  const updateButtonState = () => {
    const active = document.fullscreenElement === wrapper;
    wrapper.classList.toggle('is-fullscreen', active);
    fullscreenBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
    fullscreenBtn.setAttribute('aria-label', active ? 'Exit fullscreen' : 'Enter fullscreen');
    fullscreenBtn.textContent = active ? '⤡' : '⤢';
  };

  fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else wrapper.requestFullscreen?.().catch(() => {});
  });

  document.addEventListener('fullscreenchange', () => {
    updateButtonState();
    updateCanvasSize(container);
  });

  updateButtonState();
}

function startGame(fromSaved) {
  if (!AudioEngine.ctx) AudioEngine.init();
  gameState = 'PLAYING';
  depth = 1;
  savedPlayerState = null;
  storyProgress = { started: true, foundArtifactClue: false, defeatedFirstBoss: false, reachedFork: false, chosenPath: null, ending: null };
  journalEntries = [];

  const cached = loadSavedState();
  if (fromSaved && cached) {
    hydrateFromSaved(cached);
    document.getElementById('overlay').classList.add('hidden');
    generateFloor();
    updateUI();
    log('Run restored from cache.', 'log-success');
    return;
  }

  player = new Fighter(2, 2, 'hero', COLORS.accent, 'Hero', { hp: 60, mp: 20, str: 4, def: 0 });
  player.inventory.push(new Item('Rusty Dagger', ITEM_TYPES.WEAPON, 'common', { atk: 2, speed: 400 }, 2, 1, 'weapon_dagger'));
  equipItem(0);
  document.getElementById('overlay').classList.add('hidden');
  generateFloor();
  addJournalEntry('The Descent Begins', "I have entered the Endless Depths, seeking the legendary 'Heart of the Mountain'.");
  updateUI();
  log('Welcome. WASD to move.', 'log-loot');
}

function hydrateFromSaved(saved) {
  depth = saved.depth;
  storyProgress = saved.storyProgress || storyProgress;
  journalEntries = saved.journalEntries || [];
  savedPlayerState = saved.savedPlayerState || null;

  const baseStats = { hp: saved.player.maxHp, mp: saved.player.maxMp, str: saved.player.baseStr, def: saved.player.baseDef, maxWeight: saved.player.maxWeight, speed: saved.player.attackSpeed };
  player = new Fighter(2, 2, 'hero', COLORS.accent, 'Hero', baseStats);
  player.hp = saved.player.hp;
  player.mp = saved.player.mp;
  player.xp = saved.player.xp;
  player.level = saved.player.level;
  player.nextXp = saved.player.nextXp;
  player.gold = saved.player.gold;
  player.occupation = saved.player.occupation;
  player.learnedSkills = saved.player.learnedSkills || ['Bash'];
  player.activeSkills = saved.player.activeSkills || [0, null, null];
  player.inventory = (saved.player.inventory || []).map(deserializeItem);
  player.equipment = { weapon: saved.player.equipment?.weapon ? deserializeItem(saved.player.equipment.weapon) : null, armor: saved.player.equipment?.armor ? deserializeItem(saved.player.equipment.armor) : null };
}

function gameLoop(timestamp) {
  const dt = timestamp - lastTime;
  lastTime = timestamp;
  if (gameState === 'PLAYING' || gameState === 'PURGATORY') {
    update(dt);
    render2D();
  }
  requestAnimationFrame(gameLoop);
}

function update(dt) {
  if (!player) return;
  if (player.mp < player.maxMp) player.mp += 0.001 * dt;
  const now = Date.now();
  if (now - player.lastActionTime > player.moveDelay) {
    let dx = 0,
      dy = 0;
    if (window.keys['w'] || window.keys['ArrowUp']) dy = -1;
    else if (window.keys['s'] || window.keys['ArrowDown']) dy = 1;
    else if (window.keys['a'] || window.keys['ArrowLeft']) dx = -1;
    else if (window.keys['d'] || window.keys['ArrowRight']) dx = 1;
    else if (window.keys[' ']) {
      attemptAttack();
      player.lastActionTime = now;
    }
    if (dx !== 0 || dy !== 0) {
      const tx = player.x + dx;
      const ty = player.y + dy;
      const tile = getTile(tx, ty);
      if (tile && tile.type !== 'wall') {
        player.lastActionTime = now;
        const target = entities.find((e) => e.x === tx && e.y === ty && e.blocks && !e.dead);
        if (target) {
          if (target instanceof Fighter) player.attack(target);
          else if (target instanceof Chest) target.interact();
        } else {
          player.x = tx;
          player.y = ty;
          const ent = entities.find((e) => e.x === tx && e.y === ty && !e.dead);
          if (ent) {
            if (ent instanceof LootItem) tryPickup(ent);
            else if (ent instanceof Chest) ent.interact();
            else if (ent.sprite === 'stairs') {
              if (gameState !== 'PURGATORY') {
                depth++;
                if (depth === 10 && !storyProgress.reachedFork) {
                  storyProgress.reachedFork = true;
                  addJournalEntry('A Fateful Choice', 'The dungeon splits.');
                  gameState = 'CHOICE';
                  document.getElementById('overlay').classList.remove('hidden');
                  document.getElementById('overlay-title').innerText = 'THE PATH DIVIDES';
                  document.getElementById('overlay-msg').innerText = 'Choose your destiny.';
                  document.getElementById('start-btn').innerText = 'Descend into the Abyss';
                  document.getElementById('start-btn').onclick = () => choosePath('abyss');
                  const btn2 = document.getElementById('purgatory-btn');
                  btn2.innerText = 'Ascend to the Celestial Plane';
                  btn2.classList.remove('hidden');
                  btn2.onclick = () => choosePath('celestial');
                  btn2.style.borderColor = '#4a9eff';
                  btn2.style.color = '#4a9eff';
                  return;
                }
                generateFloor();
                log('Descended.', 'log-loot');
              }
            }
          }
        }
        updateFOV();
      }
    }
  }

  entities.forEach((e) => {
    if (e instanceof Fighter && e !== player && !e.dead) {
      e.actionTimer += dt;
      if (e.actionTimer >= e.attackSpeed) {
        e.actionTimer = 0;
        const dist = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        if (dist < 8) {
          if (dist <= 1) e.attack(player);
          else {
            const mx = Math.sign(player.x - e.x);
            const my = Math.sign(player.y - e.y);
            if (!isBlocked(e.x + mx, e.y)) e.x += mx;
            else if (!isBlocked(e.x, e.y + my)) e.y += my;
          }
        }
      }
    }
  });
  entities = entities.filter((e) => !e.dead);
  if (player.hp <= 0 && !player.dead) {
    player.dead = true;
    handleDeath();
  }
  if (gameState === 'PURGATORY' && !entities.some((e) => e instanceof Fighter && e !== player)) winPurgatory();
}

function isBlocked(x, y) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return true;
  const tile = getTile(x, y);
  return !tile || tile.type === 'wall' || entities.some((e) => e.x === x && e.y === y && e.blocks && !e.dead);
}

function attemptAttack() {
  entities.forEach((e) => {
    if (e instanceof Fighter && e !== player && !e.dead && Math.abs(e.x - player.x) <= 1 && Math.abs(e.y - player.y) <= 1) player.attack(e);
  });
}

function getCamX() {
  return Math.max(0, Math.min(player.x - Math.floor(VIEW_W / 2), MAP_W - VIEW_W));
}

function getCamY() {
  return Math.max(0, Math.min(player.y - Math.floor(VIEW_H / 2), MAP_H - VIEW_H));
}

function render2D() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!player) return;
  const cx = getCamX();
  const cy = getCamY();
  for (let y = cy; y < cy + VIEW_H; y++) {
    for (let x = cx; x < cx + VIEW_W; x++) {
      const tile = getTile(x, y);
      if (!tile) continue;
      const sx = (x - cx) * tileSize;
      const sy = (y - cy) * tileSize;
      if (tile.visible || gameState === 'PURGATORY') {
        ctx.fillStyle = tile.type === 'wall' ? currentBiome.wall : currentBiome.floor;
        ctx.fillRect(sx, sy, tileSize, tileSize);
        ctx.strokeStyle = 'rgba(0,0,0,0.2)';
        ctx.strokeRect(sx, sy, tileSize, tileSize);
        if (tile.type === 'wall') {
          ctx.fillStyle = 'rgba(255,255,255,0.1)';
          ctx.fillRect(sx, sy, tileSize, 4);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fillRect(sx, sy + tileSize - 4, tileSize, 4);
        }
      } else if (tile.explored) {
        ctx.fillStyle = tile.type === 'wall' ? '#222' : '#080808';
        ctx.fillRect(sx, sy, tileSize, tileSize);
      }
    }
  }
  entities.sort((a, b) => a.y - b.y);
  entities.forEach((e) => {
    const tile = getTile(e.x, e.y);
    e.draw(ctx, cx, cy, tile ? tile.visible : false);
  });
  player.draw(ctx, cx, cy, true);
}

function drawSprite(ctx, type, x, y, color, ent) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(tileSize / 2, tileSize - 4, tileSize / 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  if (type === 'hero') {
    drawPixelSprite(ctx, SPRITES.hero_base);
    if (ent.equipment.armor) drawPixelSprite(ctx, SPRITES[ent.equipment.armor.spriteName || 'armor_leather']);
    if (ent.equipment.weapon) {
      ctx.save();
      ctx.translate(24, 16);
      ctx.rotate(Math.PI / 4);
      ctx.translate(-16, -16);
      drawPixelSprite(ctx, SPRITES[ent.equipment.weapon.spriteName || 'weapon_dagger']);
      ctx.restore();
    }
  } else if (type === 'rat') {
    ctx.fillRect(4, 20, 24, 8);
    ctx.fillRect(26, 22, 4, 2);
    ctx.fillStyle = '#000';
    ctx.fillRect(6, 22, 2, 2);
  } else if (type === 'bat') {
    ctx.beginPath();
    ctx.arc(16, 16, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, 16);
    ctx.lineTo(2, 8);
    ctx.lineTo(10, 20);
    ctx.moveTo(22, 16);
    ctx.lineTo(30, 8);
    ctx.lineTo(22, 20);
    ctx.fill();
  } else if (type === 'goblin') {
    ctx.fillRect(8, 12, 16, 16);
    ctx.fillRect(6, 14, 4, 8);
    ctx.fillRect(22, 14, 4, 8);
  } else if (type === 'skeleton') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.strokeRect(12, 6, 8, 8);
    ctx.beginPath();
    ctx.moveTo(16, 14);
    ctx.lineTo(16, 26);
    ctx.moveTo(10, 18);
    ctx.lineTo(22, 18);
    ctx.stroke();
  } else if (type === 'loot' || type === 'potion') {
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    if (type === 'potion') {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(16, 18, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#eee';
      ctx.fillRect(14, 10, 4, 4);
    } else {
      ctx.strokeRect(10, 10, 12, 12);
      ctx.fillStyle = '#fff';
      ctx.fillText('?', 13, 20);
    }
  } else if (type.includes('chest')) {
    ctx.fillStyle = type === 'chest_locked' ? '#ffd700' : '#854';
    ctx.fillRect(4, 10, 24, 18);
    ctx.fillStyle = '#000';
    ctx.fillRect(4, 16, 24, 2);
    ctx.fillStyle = '#fff';
    ctx.fillRect(14, 18, 4, 6);
  } else if (type === 'stairs') {
    ctx.fillStyle = '#888';
    ctx.fillRect(4, 4, 24, 24);
    ctx.fillStyle = '#000';
    ctx.fillRect(8, 8, 16, 16);
    ctx.fillStyle = '#333';
    ctx.fillText('>', 12, 24);
  } else {
    ctx.fillRect(8, 8, 16, 16);
  }
  if (ent instanceof Fighter && ent !== player) {
    const hpPct = ent.hp / ent.maxHp;
    ctx.fillStyle = '#333';
    ctx.fillRect(4, -4, 24, 4);
    ctx.fillStyle = '#f00';
    ctx.fillRect(4, -4, 24 * hpPct, 4);
  }
  if (ent.isElite) {
    ctx.strokeStyle = '#4a9eff';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 32, 32);
  }
  if (ent.isBoss) {
    ctx.scale(1.2, 1.2);
    ctx.translate(-4, -4);
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, 32, 32);
  }
  ctx.restore();
}

function drawPixelSprite(ctx, spriteData) {
  const pixelSize = tileSize / 8;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const colorIndex = spriteData[y * 8 + x];
      if (colorIndex > 0) {
        ctx.fillStyle = PALETTE[colorIndex];
        ctx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
      }
    }
  }
}

function generateLoot(lvlMult = 1, forceRarity = null) {
  const r = Math.random();
  const rarity = forceRarity || (r < 0.01 ? 'epic' : r < 0.1 ? 'rare' : r < 0.3 ? 'uncommon' : 'common');
  const tr = Math.random();
  if (tr < 0.3) return new Item('Scrap Metal', ITEM_TYPES.MATERIAL, 'common', {}, 0.1);
  else if (tr < 0.4) {
    const skills = ['Heal', 'Storm', 'Stealth', 'Fireball'];
    return new Item(`${skills[Math.floor(Math.random() * skills.length)]} Book`, ITEM_TYPES.BOOK, 'rare', { skill: skills[Math.floor(Math.random() * skills.length)] }, 1);
  } else if (tr < 0.5) return new Item('Iron Arrow', ITEM_TYPES.AMMO, 'common', {}, 0.1, 5);
  else if (tr < 0.7) {
    const armorTypes = ['Leather Armor', 'Iron Chainmail'];
    const armorSprites = ['armor_leather', 'armor_iron'];
    const idx = Math.floor(Math.random() * armorTypes.length);
    return new Item(armorTypes[idx], ITEM_TYPES.ARMOR, rarity, { def: 2 + lvlMult }, 3, 1, armorSprites[idx]);
  }
  return new Item('Health Potion', ITEM_TYPES.POTION, 'common', { hp: 30 }, 0.5);
}

function dropLoot(target) {
  let item = generateLoot();
  if (target.isBoss) item = generateLoot(2, 'epic');
  entities.push(new LootItem(target.x, target.y, item));
}

// === Map generation & FOV ===
function generateFloor() {
  map = [];
  entities = [];
  const isBossFloor = depth % 5 === 0 && gameState !== 'PURGATORY';
  AudioEngine.setTrack(isBossFloor ? 'boss' : 'normal');
  if (depth <= 5) currentBiome = BIOMES.SEWER;
  else if (depth <= 10) currentBiome = BIOMES.DUNGEON;
  else if (storyProgress.chosenPath === 'abyss') currentBiome = BIOMES.ABYSS;
  else if (storyProgress.chosenPath === 'celestial') currentBiome = BIOMES.CELESTIAL;
  else currentBiome = BIOMES.CRYPT;

  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    for (let x = 0; x < MAP_W; x++) row.push({ type: 'wall' });
    map.push(row);
  }

  if (gameState === 'PURGATORY') {
    createRoom(5, 5, 20, 15);
    player.x = 15;
    player.y = 12;
    for (let i = 0; i < 6; i++) spawnMob('spirit', 6, 6, 24, 19);
  } else if (isBossFloor) {
    createRoom(15, 10, 30, 20);
    player.x = 18;
    player.y = 20;
    spawnMob(currentBiome.mobs[currentBiome.mobs.length - 1], 30, 15, 31, 16, true);
  } else {
    const rooms = [];
    for (let i = 0; i < 25; i++) {
      const w = Math.floor(Math.random() * 6) + 6;
      const h = Math.floor(Math.random() * 6) + 6;
      const x = Math.floor(Math.random() * (MAP_W - w - 2)) + 1;
      const y = Math.floor(Math.random() * (MAP_H - h - 2)) + 1;
      if (!rooms.some((r) => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y)) {
        createRoom(x, y, w, h);
        if (rooms.length > 0) {
          const prev = rooms[rooms.length - 1];
          const pX = Math.floor(prev.x + prev.w / 2);
          const pY = Math.floor(prev.y + prev.h / 2);
          const nX = Math.floor(x + w / 2);
          const nY = Math.floor(y + h / 2);
          if (Math.random() > 0.5) {
            hTunnel(pX, nX, pY);
            vTunnel(pY, nY, nX);
          } else {
            vTunnel(pY, nY, pX);
            hTunnel(pX, nX, nY);
          }
        } else {
          player.x = Math.floor(x + w / 2);
          player.y = Math.floor(y + h / 2);
        }
        rooms.push({ x, y, w, h });
      }
    }
    const last = rooms[rooms.length - 1];
    entities.push(new Entity(Math.floor(last.x + last.w / 2), Math.floor(last.y + last.h / 2), 'stairs', '#fff', 'Stairs', false));
    rooms.forEach((r, i) => {
      if (i === 0) return;
      if (Math.random() < 0.6) spawnMob(currentBiome.mobs[Math.floor(Math.random() * currentBiome.mobs.length)], r.x + 1, r.y + 1, r.x + r.w - 1, r.y + r.h - 1);
      if (Math.random() < 0.1) entities.push(new Chest(Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2), Math.random() < 0.3));
    });
  }
  updateFOV();
}

function createRoom(x, y, w, h) {
  for (let iy = y; iy < y + h; iy++) for (let ix = x; ix < x + w; ix++) map[iy][ix].type = 'floor';
}
function hTunnel(x1, x2, y) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) map[y][x].type = 'floor';
}
function vTunnel(y1, y2, x) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) map[y][x].type = 'floor';
}

function spawnMob(type, x1, y1, x2, y2, forceBoss = false) {
  const x = Math.floor(Math.random() * (x2 - x1)) + x1;
  const y = Math.floor(Math.random() * (y2 - y1)) + y1;
  const stats = { hp: 20 + depth * 5, str: 3 + depth, xpVal: 10 + depth, speed: 1000 };
  let sprite = 'blob';
  let color = '#fff';
  if (type.includes('rat')) {
    sprite = 'rat';
    color = '#964';
  } else if (type.includes('bat')) {
    sprite = 'bat';
    color = '#a6a';
  } else {
    sprite = 'goblin';
    color = '#4a4';
  }
  if (forceBoss) {
    stats.hp *= 5;
    stats.isBoss = true;
  } else if (Math.random() < 0.1) {
    stats.hp *= 2;
    stats.isElite = true;
  }
  entities.push(new Fighter(x, y, sprite, color, type.toUpperCase(), stats));
}

function tryPickup(loot) {
  if (gameState === 'DEAD') return;
  const existing = player.inventory.find((i) => i.hash === loot.item.hash);
  if (!existing && player.inventory.length >= MAX_INV_SLOTS) {
    log('Inventory Full!', 'log-danger');
    return;
  }
  if (player.currentWeight + loot.item.weight > player.maxWeight + 20) {
    log('Too heavy!', 'log-danger');
    return;
  }
  if (existing) existing.stack += loot.item.stack;
  else player.inventory.push(loot.item);
  log(`Got ${loot.item.name} x${loot.item.stack}`, 'log-success');
  loot.dead = true;
  updateUI();
  if (loot.item.rarity === 'epic' && !storyProgress.foundArtifactClue) {
    storyProgress.foundArtifactClue = true;
    addJournalEntry('A Clue Found', "Among the loot, I found an ancient tablet. It speaks of the 'Heart' being split between two realms: one of shadow, one of light.");
  }
}

function fireRanged() {
  if (gameState === 'DEAD' || !player) return;
  const arrowIdx = player.inventory.findIndex((i) => i.type === ITEM_TYPES.AMMO);
  if (arrowIdx === -1) {
    log('No Arrows!', 'log-danger');
    return;
  }
  player.inventory[arrowIdx].stack--;
  if (player.inventory[arrowIdx].stack <= 0) player.inventory.splice(arrowIdx, 1);
  let target = null;
  let minD = 999;
  entities.forEach((e) => {
    const tile = getTile(e.x, e.y);
    if (e instanceof Fighter && e !== player && !e.dead && tile?.visible) {
      const d = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
      if (d < 8 && d < minD) {
        minD = d;
        target = e;
      }
    }
  });
  if (target) {
    createProjectile(player.x, player.y, target.x, target.y, 'magic');
    player.attack(target);
  } else {
    log('Missed!', 'log-danger');
  }
  updateUI();
}

function useSkill(skillName) {
  if (gameState === 'DEAD' || !skillName) return;
  const skill = SKILLS_DB[skillName];
  if (!skill) return;
  if (player.mp < skill.cost) {
    log('Need MP', 'log-danger');
    return;
  }
  player.mp -= skill.cost;
  if (skillName === 'Heal') player.heal(30);
  else if (skillName === 'Fireball') {
    let target = null;
    let minD = 999;
    entities.forEach((e) => {
      const tile = getTile(e.x, e.y);
      if (e instanceof Fighter && e !== player && !e.dead && tile?.visible) {
        const d = Math.abs(e.x - player.x) + Math.abs(e.y - player.y);
        if (d < 8 && d < minD) {
          minD = d;
          target = e;
        }
      }
    });
    if (target) {
      createProjectile(player.x, player.y, target.x, target.y, 'magic');
      target.takeDamage(20 + player.level * 2);
      AudioEngine.sfx('magic');
    }
  }
  updateUI();
}

function dragStart(ev, data) {
  ev.dataTransfer.setData('text/plain', data);
}

function allowDrop(ev) {
  ev.preventDefault();
  const el = ev.target.closest('.drop-zone') || ev.target.closest('.skill-slot');
  if (el) el.classList.add('drag-over');
}

function dragLeave(ev) {
  const el = ev.target.closest('.drop-zone') || ev.target.closest('.skill-slot');
  if (el) el.classList.remove('drag-over');
}

function drop(ev, slotIndex) {
  ev.preventDefault();
  const el = ev.target.closest('.skill-slot');
  if (el) el.classList.remove('drag-over');
  const data = ev.dataTransfer.getData('text/plain');
  if (data.startsWith('SKILL:')) {
    player.activeSkills[slotIndex] = data.split(':')[1];
    updateUI();
  }
}

function renderCraftingList() {
  const container = document.getElementById('crafting-list');
  if (!container) return;
  container.innerHTML = '';
  RECIPES.forEach((recipe, idx) => {
    const entry = document.createElement('div');
    entry.className = 'craft-entry';
    const reqs = Object.entries(recipe.req)
      .map(([n, q]) => `${n} ×${q}`)
      .join(', ');
    entry.innerHTML = `
      <div class="craft-entry__meta">
        <strong style="color:${RARITY[recipe.rarity].color}">${recipe.name}</strong>
        <span class="craft-entry__reqs">Needs: ${reqs}</span>
      </div>
    `;
    const btn = document.createElement('button');
    btn.className = 'button button--ghost';
    btn.textContent = 'Craft';
    btn.onclick = () => craftItem(idx);
    entry.appendChild(btn);
    container.appendChild(entry);
  });
}

function updateUI() {
  if (!player) return;
  document.getElementById('hp-val').innerText = Math.max(0, Math.ceil(player.hp));
  document.getElementById('hp-bar').style.width = (player.hp / player.maxHp) * 100 + '%';
  document.getElementById('mp-val').innerText = Math.ceil(player.mp);
  document.getElementById('mp-bar').style.width = (player.mp / player.maxMp) * 100 + '%';
  document.getElementById('weight-val').innerText = `${player.currentWeight.toFixed(1)}/${player.maxWeight}`;
  document.getElementById('slots-val').innerText = `${player.inventory.filter((i) => i.type !== ITEM_TYPES.MATERIAL).length}/${MAX_INV_SLOTS}`;
  document.getElementById('class-val').innerText = player.occupation;
  document.getElementById('str-val').innerText = player.str;
  document.getElementById('def-val').innerText = player.def;
  document.getElementById('gold-val').innerText = player.gold;

  const slist = document.getElementById('active-skills-container');
  slist.innerHTML = '';
  player.activeSkills.forEach((s, i) => {
    const d = document.createElement('div');
    d.className = 'skill-slot item-slot';
    d.id = `skill-slot-${i}`;
    d.ondragover = allowDrop;
    d.ondragleave = dragLeave;
    d.ondrop = (ev) => drop(ev, i);
    if (s) {
      const sk = SKILLS_DB[s];
      d.innerHTML = `<span>[${i + 1}] ${sk.icon} ${sk.name}</span> <span style="color:#b15dff">${sk.cost}</span>`;
      d.onclick = () => {
        player.activeSkills[i] = null;
        updateUI();
      };
    } else d.innerHTML = `<span style="color:#666">[${i + 1}] Drop Skill Here</span>`;
    slist.appendChild(d);
  });

  const glist = document.getElementById('grimoire-container');
  glist.innerHTML = '';
  player.learnedSkills.forEach((s) => {
    const d = document.createElement('div');
    d.className = 'item-slot';
    d.draggable = true;
    d.innerHTML = s;
    d.ondragstart = (ev) => dragStart(ev, `SKILL:${s}`);
    glist.appendChild(d);
  });

  const list = document.getElementById('inventory-list');
  list.innerHTML = '';
  player.inventory.forEach((item, i) => {
    const d = document.createElement('div');
    d.className = 'item-slot';
    let durabilityText = '';
    if (item.type === ITEM_TYPES.WEAPON || item.type === ITEM_TYPES.ARMOR) {
      durabilityText = item.durability <= 0 ? ' <span class="broken">(Broken)</span>' : '';
    }
    d.innerHTML = `<span style="color:${RARITY[item.rarity].color}" class="${item.durability <= 0 ? 'broken' : ''}">${item.name}${durabilityText} x${item.stack}</span>`;
    let btns = `<div class="item-actions">`;
    if (item.type !== ITEM_TYPES.MATERIAL && item.type !== ITEM_TYPES.AMMO && item.type !== ITEM_TYPES.KEY) {
      if (item.type === ITEM_TYPES.POTION || item.type === ITEM_TYPES.BOOK) btns += `<button class="action-btn" onclick="equipItem(${i})">Use</button>`;
      if (item.type === ITEM_TYPES.WEAPON || item.type === ITEM_TYPES.ARMOR) {
        if (item.durability <= 0) btns += `<button class="action-btn btn-repair" onclick="repairItem(${i})">Repair</button>`;
        else btns += `<button class="action-btn" onclick="equipItem(${i})">Equip</button>`;
        btns += `<button class="action-btn btn-scrap" onclick="disassembleItem(${i})">Scrap</button>`;
      }
    }
    btns += `<button class="action-btn btn-drop" onclick="dropItem(${i})">Drop</button></div>`;
    d.innerHTML += btns;
    list.appendChild(d);
  });

  const updSlot = (id, item) => {
    let h = `<div class="equip-label">${id.includes('weapon') ? 'Main Hand' : 'Body'}</div><div class="content" style="color:#666">Empty</div>`;
    if (item) {
      const durPct = (item.durability / item.maxDurability) * 100;
      h = `<div class="equip-label">${id.includes('weapon') ? 'Main Hand' : 'Body'}</div><button class="unequip-btn" onclick="unequipItem('${id.includes('weapon') ? 'weapon' : 'armor'}')">UNEQUIP</button><div style="color:${RARITY[item.rarity].color}">${item.name}</div><div style="font-size:9px;color:#888">+${item.stats.atk || item.stats.def} | Dur: ${item.durability}</div><div id="dur-bar" style="width:${durPct}%; background:${item.durability < 20 ? '#f44' : '#fff'}"></div>`;
    }
    document.getElementById(id).innerHTML = h;
    document.getElementById(id).classList.toggle('filled', !!item);
  };
  updSlot('equip-weapon', player.equipment.weapon);
  updSlot('equip-armor', player.equipment.armor);

  const jlist = document.getElementById('journal-list');
  jlist.innerHTML = '';
  journalEntries.forEach((entry) => {
    const d = document.createElement('div');
    d.className = 'journal-entry';
    d.innerHTML = `<div class="journal-title">${entry.title}</div><div>${entry.text}</div>`;
    jlist.appendChild(d);
  });

  const logEl = document.getElementById('log');
  logEl.scrollTop = logEl.scrollHeight;

  renderCraftingList();
  scheduleSave();
}

function repairItem(i) {
  if (gameState === 'DEAD') return;
  const item = player.inventory[i];
  const scrap = player.inventory.find((x) => x.name === 'Scrap Metal');
  if (scrap && scrap.stack >= 2) {
    scrap.stack -= 2;
    if (scrap.stack <= 0) player.inventory = player.inventory.filter((x) => x !== scrap);
    item.durability = item.maxDurability;
    log('Item Repaired!', 'log-success');
    AudioEngine.sfx('scrap');
    updateUI();
  } else {
    log('Need 2 Scrap Metal to repair.', 'log-danger');
  }
}

function equipItem(i, slotTarget = null) {
  if (gameState === 'DEAD') return;
  const item = player.inventory[i];
  if (!item) return;
  if (item.type === ITEM_TYPES.POTION) {
    if (item.name.includes('Health')) player.heal(30);
    item.stack--;
    if (item.stack <= 0) player.inventory.splice(i, 1);
  } else if (item.type === ITEM_TYPES.BOOK) {
    const skill = item.stats.skill;
    if (!player.learnedSkills.includes(skill)) {
      player.learnedSkills.push(skill);
      log(`Learned ${skill}`, 'log-magic');
      item.stack--;
      if (item.stack <= 0) player.inventory.splice(i, 1);
    }
  } else if (item.type === ITEM_TYPES.WEAPON || item.type === ITEM_TYPES.ARMOR) {
    const slot = item.type;
    if (slotTarget && slot !== slotTarget) {
      log('Wrong slot!', 'log-danger');
      return;
    }
    const toEquip = new Item(item.name, item.type, item.rarity, item.stats, item.weight, 1, item.spriteName);
    toEquip.durability = item.durability;
    if (player.equipment[slot]) {
      const ex = player.inventory.find((x) => x.hash === player.equipment[slot].hash);
      if (ex) ex.stack++;
      else player.inventory.push(player.equipment[slot]);
    }
    player.equipment[slot] = toEquip;
    item.stack--;
    if (item.stack <= 0) player.inventory.splice(i, 1);
  }
  updateUI();
}

function unequipItem(slot) {
  if (gameState === 'DEAD') return;
  if (!player.equipment[slot]) return;
  if (player.inventory.length >= MAX_INV_SLOTS) {
    log('Inventory full!', 'log-danger');
    return;
  }
  const item = player.equipment[slot];
  const ex = player.inventory.find((x) => x.hash === item.hash);
  if (ex) ex.stack++;
  else player.inventory.push(item);
  player.equipment[slot] = null;
  log('Unequipped.', 'log-info');
  updateUI();
}

function dropItem(i) {
  if (gameState === 'DEAD') return;
  const item = player.inventory[i];
  item.stack--;
  if (item.stack <= 0) player.inventory.splice(i, 1);
  const drop = new Item(item.name, item.type, item.rarity, item.stats, item.weight, 1, item.spriteName);
  drop.durability = item.durability;
  entities.push(new LootItem(player.x, player.y, drop));
  updateUI();
}

function disassembleItem(i) {
  if (gameState === 'DEAD') return;
  const item = player.inventory[i];
  item.stack--;
  if (item.stack <= 0) player.inventory.splice(i, 1);
  const mat = new Item('Scrap Metal', ITEM_TYPES.MATERIAL, item.rarity, {}, 0.1);
  tryPickup({ item: mat, dead: false });
  log('Scrapped item.', 'log-loot');
  AudioEngine.sfx('scrap');
  updateUI();
}

function updateFOV() {
  if (!player || !map.length) return;
  for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) map[y][x].visible = false;
  const r = 8;
  for (let i = 0; i < 360; i += 2) {
    const rad = i * (Math.PI / 180);
    const dx = Math.cos(rad);
    const dy = Math.sin(rad);
    let ox = player.x + 0.5;
    let oy = player.y + 0.5;
    for (let j = 0; j < r; j++) {
      const mx = Math.floor(ox);
      const my = Math.floor(oy);
      const tile = getTile(mx, my);
      if (!tile) break;
      tile.visible = true;
      tile.explored = true;
      if (tile.type === 'wall') break;
      ox += dx;
      oy += dy;
    }
  }
}

function handleMouseMove(e) {
  const rect = canvas.getBoundingClientRect();
  const tx = Math.floor((e.clientX - rect.left) / tileSize);
  const ty = Math.floor((e.clientY - rect.top) / tileSize);
  if (!player) return;
  const cx = Math.max(0, Math.min(player.x - Math.floor(VIEW_W / 2), MAP_W - VIEW_W));
  const cy = Math.max(0, Math.min(player.y - Math.floor(VIEW_H / 2), MAP_H - VIEW_H));
  const mx = cx + tx;
  const my = cy + ty;
  const t = document.getElementById('tooltip');
  t.style.display = 'none';
  if (mx >= 0 && mx < MAP_W && my >= 0 && my < MAP_H) {
    const tile = getTile(mx, my);
    if (!tile) return;
    if (gameState !== 'PURGATORY' && !tile.visible) return;
    const ent = entities.find((e) => e.x === mx && e.y === my && !e.dead);
    if (ent) {
      t.style.display = 'block';
      t.style.left = e.clientX + 15 + 'px';
      t.style.top = e.clientY + 15 + 'px';
      if (ent instanceof Fighter) t.innerHTML = `<strong style="color:${ent.isBoss ? RARITY.legendary.color : ent.isElite ? RARITY.rare.color : '#fff'}">${ent.name}</strong><br>HP: ${ent.hp}/${ent.maxHp}`;
      else if (ent instanceof LootItem) t.innerHTML = `<span style="color:${RARITY[ent.item.rarity].color}">${ent.item.name}</span>`;
      else if (ent instanceof Chest) t.innerHTML = `<span style="color:${ent.locked ? '#ffd700' : '#aaa'}">${ent.name}</span>`;
    }
  }
}

function createProjectile(x1, y1, x2, y2, type) {
  const el = document.createElement('div');
  el.style.cssText = `position:absolute; width:8px; height:8px; background:${type === 'magic' ? '#b15dff' : '#fff'}; border-radius:50%; z-index:5; transition:all 0.15s linear; pointer-events:none; box-shadow:0 0 5px ${type === 'magic' ? '#b15dff' : '#fff'};`;
  const cx = Math.max(0, Math.min(player.x - Math.floor(VIEW_W / 2), MAP_W - VIEW_W));
  const cy = Math.max(0, Math.min(player.y - Math.floor(VIEW_H / 2), MAP_H - VIEW_H));
  el.style.left = (x1 - cx) * tileSize + tileSize / 2 + 'px';
  el.style.top = (y1 - cy) * tileSize + tileSize / 2 + 'px';
  document.getElementById('fx-layer').appendChild(el);
  requestAnimationFrame(() => {
    el.style.left = (x2 - cx) * tileSize + tileSize / 2 + 'px';
    el.style.top = (y2 - cy) * tileSize + tileSize / 2 + 'px';
  });
  setTimeout(() => el.remove(), 150);
}

function spawnStairs(x, y) {
  entities.push(new Entity(x + 0.5, y + 0.5, 'stairs', '#fff', 'Stairs', false));
  log('Way open!', 'log-loot');
}

function handleDeath() {
  if (player && !savedPlayerState) {
    savedPlayerState = {
      d: depth,
      inv: player.inventory.map(serializeItem),
      eq: { weapon: serializeItem(player.equipment.weapon), armor: serializeItem(player.equipment.armor) },
      xp: player.xp,
      lvl: player.level,
      stats: { hp: player.maxHp, mp: player.maxMp, str: player.baseStr, def: player.baseDef, maxWeight: player.maxWeight }
    };
  }
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('overlay-title').innerText = 'DEATH';
  document.getElementById('overlay-msg').innerText = 'YOU DIED';
  document.getElementById('start-btn').innerText = 'Start New Run';
  document.getElementById('start-btn').onclick = () => startGame(false);
  document.getElementById('new-run-btn').classList.add('hidden');
  const purgBtn = document.getElementById('purgatory-btn');
  if (purgBtn) purgBtn.classList.toggle('hidden', !savedPlayerState);
  gameState = 'DEAD';
  scheduleSave();
}

function enterPurgatory() {
  savedPlayerState = {
    d: depth,
    inv: player.inventory.map(serializeItem),
    eq: { weapon: serializeItem(player.equipment.weapon), armor: serializeItem(player.equipment.armor) },
    xp: player.xp,
    lvl: player.level,
    stats: { hp: player.maxHp, mp: player.maxMp, str: player.baseStr, def: player.baseDef, maxWeight: player.maxWeight }
  };
  gameState = 'PURGATORY';
  player.hp = player.maxHp;
  document.getElementById('overlay').classList.add('hidden');
  generateFloor();
  updateUI();
}

function winPurgatory() {
  gameState = 'PLAYING';
  depth = savedPlayerState.d;
  const stats = savedPlayerState.stats;
  player = new Fighter(2, 2, 'hero', COLORS.accent, 'Hero', {
    hp: stats.hp,
    mp: stats.mp,
    str: stats.str,
    def: stats.def,
    maxWeight: stats.maxWeight
  });
  player.level = savedPlayerState.lvl;
  player.xp = savedPlayerState.xp;
  player.inventory = (savedPlayerState.inv || []).map(deserializeItem);
  player.equipment = {
    weapon: deserializeItem(savedPlayerState.eq?.weapon),
    armor: deserializeItem(savedPlayerState.eq?.armor)
  };
  player.hp = player.maxHp;
  player.mp = player.maxMp;
  savedPlayerState = null;
  document.getElementById('overlay').classList.add('hidden');
  generateFloor();
  updateUI();
  log('Resurrected!', 'log-loot');
}

function log(msg, c) {
  const el = document.getElementById('log');
  el.innerHTML += `<p class="${c}">> ${msg}</p>`;
  el.scrollTop = el.scrollHeight;
}

function addJournalEntry(title, text) {
  journalEntries.push({ title, text });
  log(`Journal updated: ${title}`, 'log-story');
  updateUI();
}

function choosePath(path) {
  storyProgress.chosenPath = path;
  storyProgress.reachedFork = true;
  gameState = 'PLAYING';
  document.getElementById('overlay').classList.add('hidden');
  document.getElementById('purgatory-btn').classList.add('hidden');
  document.getElementById('start-btn').innerText = 'Enter Dungeon';
  document.getElementById('start-btn').onclick = () => startGame(false);
  addJournalEntry('The Chosen Path', `I have chosen to ${path === 'abyss' ? 'descend into the Abyss' : 'ascend to the Celestial Plane'}. The air feels different here.`);
  generateFloor();
}

function craftItem(idx) {
  if (gameState === 'DEAD') return;
  const r = RECIPES[idx];
  for (const [n, q] of Object.entries(r.req)) {
    const h = player.inventory.find((x) => x.name === n)?.stack || 0;
    if (h < q) {
      log('Missing materials for ' + r.name, 'log-danger');
      return;
    }
  }
  for (const [n, q] of Object.entries(r.req)) {
    const i = player.inventory.find((x) => x.name === n);
    i.stack -= q;
    if (i.stack <= 0) player.inventory = player.inventory.filter((x) => x !== i);
  }
  const crafted = new Item(r.name, r.type, r.rarity, r.stats, r.weight, 1, r.spriteName);
  tryPickup({ item: crafted, dead: false });
  log('Crafted ' + r.name, 'log-success');
  updateUI();
}

function switchTab(t) {
  document.getElementById('tab-inv').className = t === 'inv' ? 'tab-btn active' : 'tab-btn';
  document.getElementById('tab-craft').className = t === 'craft' ? 'tab-btn active' : 'tab-btn';
  document.getElementById('tab-skills').className = t === 'skills' ? 'tab-btn active' : 'tab-btn';
  document.getElementById('tab-journal').className = t === 'journal' ? 'tab-btn active' : 'tab-btn';
  document.getElementById('inventory-list').classList.toggle('hidden', t !== 'inv');
  document.getElementById('crafting-list').classList.toggle('hidden', t !== 'craft');
  document.getElementById('skills-list').classList.toggle('hidden', t !== 'skills');
  document.getElementById('journal-list').classList.toggle('hidden', t !== 'journal');
}

function scheduleSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => persistState(), 250);
}

function serializeItem(item) {
  if (!item) return null;
  return { name: item.name, type: item.type, rarity: item.rarity, stats: item.stats, weight: item.weight, stack: item.stack, spriteName: item.spriteName, maxDurability: item.maxDurability, durability: item.durability };
}

function deserializeItem(raw) {
  if (!raw) return null;
  const item = new Item(raw.name, raw.type, raw.rarity, raw.stats, raw.weight, raw.stack, raw.spriteName);
  if (raw.maxDurability !== undefined && raw.maxDurability !== null) item.maxDurability = raw.maxDurability;
  if (raw.durability !== undefined && raw.durability !== null) {
    item.durability = raw.durability;
  } else {
    console.warn('deserializeItem: missing durability for item', raw.name);
  }
  return item;
}

function persistState() {
  if (!player || gameState === 'START') return;
  const state = {
    depth,
    storyProgress,
    journalEntries,
    savedPlayerState,
    player: {
      maxHp: player.maxHp,
      hp: player.hp,
      maxMp: player.maxMp,
      mp: player.mp,
      baseStr: player.baseStr,
      baseDef: player.baseDef,
      maxWeight: player.maxWeight,
      attackSpeed: player.attackSpeed,
      xp: player.xp,
      nextXp: player.nextXp,
      level: player.level,
      gold: player.gold,
      occupation: player.occupation,
      learnedSkills: player.learnedSkills,
      activeSkills: player.activeSkills,
      inventory: player.inventory.map(serializeItem),
      equipment: { weapon: serializeItem(player.equipment.weapon), armor: serializeItem(player.equipment.armor) }
    }
  };
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Unable to save game state', error);
  }
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (error) {
    console.warn('Unable to read saved game', error);
    return null;
  }
}

function clearSavedState() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch (error) {
    console.warn('Unable to clear state', error);
  }
}

init();
