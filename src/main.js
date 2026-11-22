import './styles.css';
import { SceneManager } from './engine/SceneManager.js';
import { PyramidBuilder, TOTAL_BLOCKS } from './engine/PyramidBuilder.js';
import { PhysicsSystem } from './physics/PhysicsSystem.js';
import { InteractionLoop } from './gameplay/InteractionLoop.js';
import { QuestCodex } from './ui/QuestCodex.js';
import { UpgradesDrawer, PICKAXE_TIERS, SLED_TIERS } from './ui/UpgradesDrawer.js';
import { SynthAudio } from './audio/SynthAudio.js';

const SAVE_KEY = 'pharaoh_monolith_3d_save_v1';

const ACTION_ICONS = {
  pickaxe: '⛏️',
  chisel: '🔨',
  grab: '🪨',
  load: '📦',
  sled: '🛷',
  place: '🧱',
  remove: '✖️',
  compass: '𓂀'
};

class GameState {
  constructor() {
    this.mode = 'MENU'; // Strict state machine: 'MENU' | 'PLAYING'
    this.modalOpen = false;
    this.deben = 0;
    this.sandbox = false;
    this.selectedBrush = '1x1';
    this.inventory = { rough: 0, carved: 0 };
    this.upgrades = { pickaxe: 1, sled: 1, brush: 1 };
    this.claimedQuests = [];
    this.stats = {
      stonesQuarried: 0,
      stonesCarved: 0,
      blocksPlacedTotal: 0,
      sledDeliveriesTotal: 0,
      sledDeliveriesNoSandbox: 0,
      immortalVizierUnlocked: false
    };
    this.settings = {
      muted: false,
      volume: 0.72,
      sensitivity: 1.0
    };
  }

  getPickaxeStats() {
    return PICKAXE_TIERS[Math.min(PICKAXE_TIERS.length - 1, Math.max(0, this.upgrades.pickaxe - 1))];
  }

  getSledStats() {
    return SLED_TIERS[Math.min(SLED_TIERS.length - 1, Math.max(0, this.upgrades.sled - 1))];
  }

  getCarryCapacity() {
    return this.getPickaxeStats().carryCap;
  }
}

class PharaohMonolithApp {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.audio = new SynthAudio();
    this.state = new GameState();

    // Core 3D Engine & Systems
    this.sceneManager = new SceneManager(this.canvas);
    this.pyramid = new PyramidBuilder(this.sceneManager.scene);
    this.physics = new PhysicsSystem(this.sceneManager, this.pyramid, this.audio);

    this.interaction = new InteractionLoop({
      sceneManager: this.sceneManager,
      pyramidBuilder: this.pyramid,
      physics: this.physics,
      audio: this.audio,
      gameState: this.state,
      callbacks: {
        onStatsChanged: () => this.refreshHud(),
        onToast: (msg) => this.showToast(msg),
        onActionContextChanged: (ctx, placeMode) => this.updateActionControls(ctx, placeMode)
      }
    });

    // Modals
    this.codex = new QuestCodex(
      document.getElementById('modal-codex'),
      this.state,
      this.pyramid,
      this.audio,
      (evt, quest) => {
        if (evt === 'CLOSE') {
          this.state.modalOpen = false;
        } else if (evt === 'CLAIM') {
          this.showToast(`Quest Claimed: ${quest.title} (+${quest.reward} 🪙)`);
          this.saveGame();
        }
        this.refreshHud();
      }
    );

    this.upgradesDrawer = new UpgradesDrawer(
      document.getElementById('modal-upgrades'),
      this.state,
      this.audio,
      (evt) => {
        if (evt === 'CLOSE') {
          this.state.modalOpen = false;
        } else {
          this.applyUpgradeStats();
          this.saveGame();
          if (evt === 'SANDBOX') {
            this.showToast(this.state.sandbox ? 'Sandbox Mode Enabled (Unlimited Blocks)' : 'Sandbox Mode Disabled');
          } else if (evt === 'UPGRADE') {
            this.showToast('Tool Upgraded!');
          }
        }
        this.refreshHud();
      }
    );

    this.optionsModalEl = document.getElementById('modal-options');
    this.toastEl = document.getElementById('toast-banner');
    this.toastTimer = null;
    this.lastSaveLabel = 'Not saved yet';

    // Load saved progress from localStorage before first render
    this.loadGame();
    this.applyUpgradeStats();

    // Bind Menu, HUD, Joystick & Action Seal controls
    this._bindUI();
    this.setMode('MENU');
    this.refreshHud();

    // Auto-save timer (every 15s) + iOS Safari lifecycle save
    setInterval(() => {
      if (this.state.mode === 'PLAYING') this.saveGame(true);
    }, 15000);
    window.addEventListener('pagehide', () => this.saveGame(true));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.saveGame(true);
    });

    // Expose inspection hook for QA & verification
    window.__PHARAOH_GAME__ = {
      app: this,
      getMode: () => this.state.mode,
      getPlacedCount: () => this.pyramid.placedCount,
      getMaxInstances: () => this.pyramid.instancedMesh.instanceMatrix.count,
      getFps: () => this.fps
    };

    // Start locked 60 FPS game loop
    this.lastTime = performance.now();
    this.fps = 60;
    this._fpsFrames = 0;
    this._fpsAccum = 0;
    requestAnimationFrame((now) => this._loop(now));
  }

  _bindUI() {
    // MAIN MENU buttons
    document.getElementById('btn-menu-play').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick();
      this.setMode('PLAYING');
    });

    document.getElementById('btn-menu-quests').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick();
      this.state.modalOpen = true;
      this.codex.open();
    });

    document.getElementById('btn-menu-upgrades').addEventListener('click', () => {
      this.audio.unlock();
      this.audio.playUiClick();
      this.state.modalOpen = true;
      this.upgradesDrawer.open();
    });

    const openOptions = () => {
      this.audio.unlock();
      this.audio.playUiClick();
      this.openOptionsModal();
    };
    document.getElementById('btn-menu-options').addEventListener('click', openOptions);
    document.getElementById('menu-quick-options').addEventListener('click', openOptions);

    // IN-GAME HUD top bar buttons
    document.getElementById('hud-home').addEventListener('click', () => {
      this.audio.playUiClick();
      if (this.physics.sled.isTowed) this.physics.sled.isTowed = false;
      this.saveGame(true);
      this.setMode('MENU');
    });

    document.getElementById('hud-sound').addEventListener('click', () => {
      this.audio.unlock();
      this.state.settings.muted = !this.state.settings.muted;
      this.audio.setMuted(this.state.settings.muted);
      if (!this.state.settings.muted) this.audio.playUiClick();
      this.refreshHud();
      this.saveGame(true);
    });

    document.getElementById('hud-quests').addEventListener('click', () => {
      this.audio.playUiClick();
      this.state.modalOpen = true;
      this.codex.open();
    });

    document.getElementById('hud-pinned-quest').addEventListener('click', () => {
      this.audio.playUiClick();
      const pinned = this.codex.getPinnedQuest();
      this.state.modalOpen = true;
      this.codex.open(pinned?.quest?.id || null);
    });

    document.getElementById('hud-upgrades').addEventListener('click', () => {
      this.audio.playUiClick();
      this.state.modalOpen = true;
      this.upgradesDrawer.open();
    });

    // Bottom-Left Floating Virtual Thumbstick
    this.interaction.bindJoystickElement(
      document.getElementById('joystick-zone'),
      document.getElementById('joystick-base'),
      document.getElementById('joystick-knob')
    );

    // Bottom-Right Terracotta Circular Action Seal (supports tap & continuous hold!)
    const sealBtn = document.getElementById('btn-action');
    const pressSeal = (e) => {
      e.preventDefault();
      e.stopPropagation();
      sealBtn.classList.add('pressed');
      this.interaction.setActionHeld(true);
    };
    const releaseSeal = (e) => {
      if (e) e.stopPropagation();
      sealBtn.classList.remove('pressed');
      this.interaction.setActionHeld(false);
    };
    sealBtn.addEventListener('touchstart', pressSeal, { passive: false });
    sealBtn.addEventListener('touchend', releaseSeal, { passive: true });
    sealBtn.addEventListener('touchcancel', releaseSeal, { passive: true });
    sealBtn.addEventListener('mousedown', pressSeal);
    window.addEventListener('mouseup', () => {
      if (sealBtn.classList.contains('pressed')) releaseSeal();
    });

    // Secondary contextual pills: PULL SLED & Mode: PLACE / REMOVE
    document.getElementById('btn-pull-sled').addEventListener('click', (e) => {
      e.stopPropagation();
      this.audio.unlock();
      this.interaction.togglePullSled();
    });

    document.getElementById('btn-place-mode').addEventListener('click', (e) => {
      e.stopPropagation();
      this.interaction.togglePlaceMode();
    });
  }

  setMode(newMode) {
    this.state.mode = newMode;
    document.body.classList.toggle('state-menu', newMode === 'MENU');
    document.body.classList.toggle('state-playing', newMode === 'PLAYING');

    if (newMode === 'PLAYING') {
      this.interaction.actionHeld = false;
      this.refreshHud();
      this.updateActionControls(this.interaction.currentAction, this.interaction.placeMode);
    } else {
      this.interaction.actionHeld = false;
      this.interaction.vmRoot.visible = false;
      for (const s of this.interaction.ghostSlots) s.group.visible = false;
      this.refreshHud();
    }
  }

  applyUpgradeStats() {
    const sledStats = this.state.getSledStats();
    this.physics.sled.maxCapacity = sledStats.capacity;
    this.physics.sled.speedBoost = sledStats.speedBoost;
    this.audio.setMuted(this.state.settings.muted);
    this.audio.setVolume(this.state.settings.volume);
  }

  refreshHud() {
    const placed = this.pyramid.placedCount;
    const layer = Math.max(1, this.pyramid.highestLayer);
    const sled = this.physics.sled;
    const inv = this.state.inventory;

    // 2-Row Top Bar
    document.getElementById('hud-blocks').textContent = `${placed.toLocaleString()} / ${TOTAL_BLOCKS.toLocaleString()}`;
    document.getElementById('hud-layer').textContent = `${layer} / 144`;
    document.getElementById('hud-deben').textContent = `🪙 ${this.state.deben.toLocaleString()}`;
    document.getElementById('hud-sound').textContent = this.state.settings.muted ? '🔇' : '🔊';
    document.getElementById('hud-carry').textContent = this.state.sandbox
      ? `∞ SANDBOX · 🛷${sled.blocksCount}/${sled.maxCapacity}`
      : `🪨${inv.rough} 🧱${inv.carved} 🛷${sled.blocksCount}/${sled.maxCapacity}`;

    // Immortal Vizier badge on Menu
    document.getElementById('menu-vizier-ribbon')
      .classList.toggle('hidden', !this.state.stats.immortalVizierUnlocked);

    // Quest notification dots
    const hasClaim = this.codex.hasClaimableQuests();
    document.getElementById('hud-quest-dot').classList.toggle('hidden', !hasClaim);
    document.getElementById('menu-quest-dot').classList.toggle('hidden', !hasClaim);

    // Pinned Active Quest Scroll Card
    const pinned = this.codex.getPinnedQuest();
    if (pinned) {
      const scrollEl = document.getElementById('hud-pinned-quest');
      scrollEl.classList.toggle('claimable', pinned.status === 'claimable');
      document.getElementById('pinned-q-title').textContent =
        pinned.status === 'claimable' ? `★ CLAIM: ${pinned.quest.title}` : pinned.quest.title;
      const pct = Math.min(100, Math.round((pinned.progress.cur / Math.max(1, pinned.progress.max)) * 100));
      document.getElementById('pinned-q-bar').style.width = `${pct}%`;
      document.getElementById('pinned-q-prog').textContent =
        pinned.status === 'claimable'
          ? `+${pinned.quest.reward}🪙`
          : `${pinned.progress.cur.toLocaleString()}/${pinned.progress.max.toLocaleString()}`;
    }

    // Keep Mode pill synced with brush selection
    this.updateActionControls(this.interaction.currentAction, this.interaction.placeMode);
  }

  updateActionControls(ctx, placeMode) {
    document.getElementById('action-seal-icon').textContent = ACTION_ICONS[ctx.icon] || '⛏️';
    document.getElementById('action-seal-label').textContent = ctx.label;

    const sledPill = document.getElementById('btn-pull-sled');
    sledPill.classList.toggle('hidden', !ctx.canSledToggle);
    sledPill.textContent = this.physics.sled.isTowed ? '🛷 RELEASE SLED' : '🛷 PULL SLED';

    const modePill = document.getElementById('btn-place-mode');
    modePill.classList.toggle('hidden', !ctx.showModeToggle);
    modePill.classList.toggle('remove-active', placeMode === 'REMOVE');
    modePill.textContent = `Mode: ${placeMode} · ${this.state.selectedBrush}`;
  }

  openOptionsModal() {
    this.state.modalOpen = true;
    let confirmReset = false;

    const renderOptions = () => {
      this.optionsModalEl.innerHTML = `
        <div class="papyrus-modal options-modal">
          <div class="modal-header">
            <div class="modal-title-wrap">
              <div class="modal-title">OPTIONS &amp; SAUVEGARDE</div>
              <div class="modal-sub">Last Saved: ${this.lastSaveLabel}</div>
            </div>
            <button class="icon-chip close-btn" id="opt-close">✕</button>
          </div>
          <div class="options-scroll">
            <div class="option-card">
              <div class="opt-row">
                <span class="opt-label">Audio &amp; Sound Effects</span>
                <label class="papyrus-switch">
                  <input type="checkbox" id="opt-audio" ${!this.state.settings.muted ? 'checked' : ''} />
                  <span class="switch-slider"></span>
                </label>
              </div>
              <div class="opt-row">
                <span class="opt-label">Master Volume</span>
                <input class="opt-slider" type="range" id="opt-vol" min="0" max="1" step="0.05" value="${this.state.settings.volume}" />
              </div>
              <div class="opt-row">
                <span class="opt-label">Touch Look Sensitivity</span>
                <input class="opt-slider" type="range" id="opt-sens" min="0.5" max="2.0" step="0.1" value="${this.state.settings.sensitivity}" />
              </div>
            </div>

            <div class="option-card">
              <div class="upg-name">Progress Summary</div>
              <div class="upg-stats">
                Blocks Laid: <b>${this.pyramid.placedCount.toLocaleString()} / 1,005,840</b><br/>
                Highest Layer: <b>${Math.max(1, this.pyramid.highestLayer)} / 144</b> · Deben: <b>🪙 ${this.state.deben.toLocaleString()}</b><br/>
                Full Sled Deliveries (No Sandbox): <b>${this.state.stats.sledDeliveriesNoSandbox} / 500</b>
              </div>
              <button class="upg-buy-btn" id="opt-save-now">💾 SAVE NOW (LOCAL STORAGE)</button>
              <button class="opt-danger-btn" id="opt-reset-btn">
                ${confirmReset ? '⚠️ TAP AGAIN TO WIPE ALL PROGRESS' : '🗑️ RESET MONOLITH SAVE'}
              </button>
            </div>
          </div>
        </div>
      `;

      this.optionsModalEl.querySelector('#opt-close').addEventListener('click', () => {
        this.audio.playUiClick();
        this.optionsModalEl.classList.add('hidden');
        this.state.modalOpen = false;
      });

      this.optionsModalEl.querySelector('#opt-audio').addEventListener('change', (e) => {
        this.state.settings.muted = !e.target.checked;
        this.audio.setMuted(this.state.settings.muted);
        this.refreshHud();
        this.saveGame(true);
      });

      this.optionsModalEl.querySelector('#opt-vol').addEventListener('input', (e) => {
        this.state.settings.volume = parseFloat(e.target.value);
        this.audio.setVolume(this.state.settings.volume);
      });

      this.optionsModalEl.querySelector('#opt-sens').addEventListener('input', (e) => {
        this.state.settings.sensitivity = parseFloat(e.target.value);
      });

      this.optionsModalEl.querySelector('#opt-save-now').addEventListener('click', () => {
        this.saveGame(false);
        this.audio.playQuestChime();
        renderOptions();
      });

      this.optionsModalEl.querySelector('#opt-reset-btn').addEventListener('click', () => {
        if (!confirmReset) {
          confirmReset = true;
          this.audio.playUiClick();
          renderOptions();
          return;
        }
        this.resetSave();
        this.optionsModalEl.classList.add('hidden');
        this.state.modalOpen = false;
      });
    };

    renderOptions();
    this.optionsModalEl.classList.remove('hidden');
  }

  showToast(message) {
    this.toastEl.textContent = message;
    this.toastEl.classList.remove('hidden');
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toastEl.classList.add('hidden');
    }, 2600);
  }

  saveGame(silent = false) {
    try {
      const p = this.physics.player;
      const s = this.physics.sled;
      const payload = {
        v: 1,
        deben: this.state.deben,
        sandbox: this.state.sandbox,
        selectedBrush: this.state.selectedBrush,
        inventory: this.state.inventory,
        upgrades: this.state.upgrades,
        claimedQuests: this.state.claimedQuests,
        stats: this.state.stats,
        settings: this.state.settings,
        player: { x: p.position.x, y: p.position.y, z: p.position.z, yaw: p.yaw, pitch: p.pitch },
        sled: { x: s.position.x, y: s.position.y, z: s.position.z, yaw: s.yaw, blocksCount: s.blocksCount },
        blocksRle: this.pyramid.serializePlacedBlocks()
      };
      localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
      this.lastSaveLabel = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (!silent) this.showToast('Progress Saved to Papyrus Scroll!');
    } catch (err) {
      console.warn('Save failed:', err);
    }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (!data || data.v !== 1) return;

      this.state.deben = data.deben ?? 0;
      this.state.sandbox = !!data.sandbox;
      this.state.selectedBrush = data.selectedBrush || '1x1';
      if (data.inventory) Object.assign(this.state.inventory, data.inventory);
      if (data.upgrades) Object.assign(this.state.upgrades, data.upgrades);
      if (Array.isArray(data.claimedQuests)) this.state.claimedQuests = data.claimedQuests;
      if (data.stats) Object.assign(this.state.stats, data.stats);
      if (data.settings) Object.assign(this.state.settings, data.settings);

      if (data.player) {
        this.physics.player.position.set(data.player.x, data.player.y, data.player.z);
        this.physics.player.visualY = data.player.y;
        this.physics.player.yaw = data.player.yaw ?? 0;
        this.physics.player.pitch = data.player.pitch ?? -0.05;
      }
      if (data.sled) {
        this.physics.sled.position.set(data.sled.x, data.sled.y, data.sled.z);
        this.physics.sled.yaw = data.sled.yaw ?? Math.PI;
        this.physics.sled.blocksCount = data.sled.blocksCount ?? 0;
        this.physics.syncSledCargoVisuals();
      }
      if (Array.isArray(data.blocksRle)) {
        this.pyramid.deserializePlacedBlocks(data.blocksRle);
      }
      this.lastSaveLabel = 'Loaded from device';
    } catch (err) {
      console.warn('Load failed, starting fresh:', err);
    }
  }

  resetSave() {
    localStorage.removeItem(SAVE_KEY);
    this.pyramid.clearAll();
    Object.assign(this.state, new GameState());
    this.physics.player.position.set(-4, 0, 129.5);
    this.physics.player.visualY = 0;
    this.physics.player.yaw = 0.16;
    this.physics.player.pitch = -0.06;
    this.physics.sled.position.copy(this.sceneManager.stations.sledStart);
    this.physics.sled.yaw = Math.PI;
    this.physics.sled.blocksCount = 0;
    this.physics.sled.isTowed = false;
    this.physics.syncSledCargoVisuals();
    this.applyUpgradeStats();
    this.refreshHud();
    this.showToast('Monolith reset to fresh desert sand.');
  }

  _loop(now) {
    requestAnimationFrame((t) => this._loop(t));

    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastTime) / 1000));
    this.lastTime = now;

    // Track rolling FPS
    this._fpsFrames++;
    this._fpsAccum += dt;
    if (this._fpsAccum >= 0.5) {
      this.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsFrames = 0;
      this._fpsAccum = 0;
    }

    if (this.state.mode === 'PLAYING' && !this.state.modalOpen) {
      this.interaction.update(dt);
    }

    this.sceneManager.update(dt, this.state.mode, this.pyramid, this.physics.player.position);
    this.sceneManager.render();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new PharaohMonolithApp();
});
