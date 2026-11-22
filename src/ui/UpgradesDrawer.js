/**
 * UpgradesDrawer — 100% Player-Controlled Tools, Sled, Master Architect Brushes & Sandbox Mode.
 * Zero idle/AI workers: every upgrade empowers your hands-on physical labor.
 */

export const PICKAXE_TIERS = [
  { level: 1, name: 'Copper Pickaxe & Chisel', cost: 0, rocksPerStrike: 2, carryCap: 4, swingCooldown: 0.48, carveCooldown: 0.36, carveBatch: 1, transferBatch: 1 },
  { level: 2, name: 'Hardened Bronze Tools', cost: 80, rocksPerStrike: 4, carryCap: 8, swingCooldown: 0.42, carveCooldown: 0.30, carveBatch: 2, transferBatch: 2 },
  { level: 3, name: 'Dolerite Quarry Maul', cost: 240, rocksPerStrike: 6, carryCap: 16, swingCooldown: 0.36, carveCooldown: 0.25, carveBatch: 3, transferBatch: 3 },
  { level: 4, name: 'Royal Mason’s Set', cost: 700, rocksPerStrike: 9, carryCap: 28, swingCooldown: 0.31, carveCooldown: 0.20, carveBatch: 5, transferBatch: 5 },
  { level: 5, name: 'Solar Electrum Pick', cost: 1800, rocksPerStrike: 12, carryCap: 45, swingCooldown: 0.26, carveCooldown: 0.16, carveBatch: 8, transferBatch: 8 }
];

export const SLED_TIERS = [
  { level: 1, name: 'Acacia Runner Sled', cost: 0, capacity: 8, speedBoost: 1.25 },
  { level: 2, name: 'Lebanon Cedar Sled', cost: 120, capacity: 16, speedBoost: 1.45 },
  { level: 3, name: 'Double-Jar Wet Sled', cost: 360, capacity: 30, speedBoost: 1.65 },
  { level: 4, name: 'Heavy Quarry Barge-Sled', cost: 950, capacity: 50, speedBoost: 1.85 },
  { level: 5, name: 'Pharaoh’s Golden Sled', cost: 2400, capacity: 80, speedBoost: 2.10 }
];

export const BRUSH_TIERS = [
  { level: 1, mode: '1x1', name: '1×1 Single Stone', cost: 0, desc: 'Classic single-block hand placement.' },
  { level: 2, mode: '1x3', name: '1×3 Mason’s Course', cost: 150, desc: 'Lay 3 aligned limestone blocks at once.' },
  { level: 3, mode: '3x3', name: '3×3 Terrace Square', cost: 520, desc: 'Lay up to 9 blocks in a 3×3 square.' },
  { level: 4, mode: '5x5', name: '5×5 Master Architect', cost: 1600, desc: 'Lay up to 25 blocks in one grand sweep.' }
];

export class UpgradesDrawer {
  constructor(modalEl, gameState, audio, onChangeCallback) {
    this.modalEl = modalEl;
    this.state = gameState;
    this.audio = audio;
    this.onChange = onChangeCallback;
  }

  open() {
    this.modalEl.classList.remove('hidden');
    this.render();
  }

  close() {
    this.modalEl.classList.add('hidden');
  }

  render() {
    const pLv = this.state.upgrades.pickaxe;
    const sLv = this.state.upgrades.sled;
    const bLv = this.state.upgrades.brush;

    const pCur = PICKAXE_TIERS[pLv - 1];
    const pNext = PICKAXE_TIERS[pLv] || null;
    const sCur = SLED_TIERS[sLv - 1];
    const sNext = SLED_TIERS[sLv] || null;
    const bCur = BRUSH_TIERS[bLv - 1];
    const bNext = BRUSH_TIERS[bLv] || null;

    this.modalEl.innerHTML = `
      <div class="papyrus-modal upgrades-modal">
        <div class="modal-header">
          <div class="modal-title-wrap">
            <div class="modal-title">AMÉLIORATIONS & OUTILS</div>
            <div class="modal-sub">Gold Deben: <strong>🪙 ${this.state.deben.toLocaleString()}</strong> · 100% Hands-On Tools</div>
          </div>
          <button class="icon-chip close-btn" id="upg-close">✕</button>
        </div>

        <div class="upgrades-scroll">
          <!-- 1. PICKAXE & CHISEL -->
          <div class="upgrade-card">
            <div class="upg-top">
              <div class="upg-icon">⛏️</div>
              <div class="upg-info">
                <div class="upg-name">${pCur.name} <span class="tier-tag">Tier ${pLv}/5</span></div>
                <div class="upg-stats">Quarry Drop: <b>${pCur.rocksPerStrike} rocks/strike</b> · Carry: <b>${pCur.carryCap}</b> · Carve ×${pCur.carveBatch}</div>
              </div>
            </div>
            ${
              pNext
                ? `<button class="upg-buy-btn" id="buy-pick" ${this.state.deben < pNext.cost ? 'disabled' : ''}>
                    Upgrade → ${pNext.name} (${pNext.rocksPerStrike} rocks/strike) · 🪙 ${pNext.cost}
                  </button>`
                : `<div class="upg-max">★ MAX TIER MASTERED</div>`
            }
          </div>

          <!-- 2. WET-SAND SLED & WATER JAR -->
          <div class="upgrade-card">
            <div class="upg-top">
              <div class="upg-icon">🛷</div>
              <div class="upg-info">
                <div class="upg-name">${sCur.name} <span class="tier-tag">Tier ${sLv}/5</span></div>
                <div class="upg-stats">Cargo Deck: <b>${sCur.capacity} blocks</b> · Wet-Sand Glide: <b>+${Math.round((sCur.speedBoost - 1) * 100)}%</b></div>
              </div>
            </div>
            ${
              sNext
                ? `<button class="upg-buy-btn" id="buy-sled" ${this.state.deben < sNext.cost ? 'disabled' : ''}>
                    Upgrade → ${sNext.name} (${sNext.capacity} cap) · 🪙 ${sNext.cost}
                  </button>`
                : `<div class="upg-max">★ MAX TIER MASTERED</div>`
            }
          </div>

          <!-- 3. MASTER ARCHITECT MANUAL BRUSH -->
          <div class="upgrade-card">
            <div class="upg-top">
              <div class="upg-icon">📐</div>
              <div class="upg-info">
                <div class="upg-name">Master Architect Brush <span class="tier-tag">Tier ${bLv}/4</span></div>
                <div class="upg-stats">${bCur.desc}</div>
              </div>
            </div>
            <div class="brush-selector">
              ${BRUSH_TIERS.map((bt) => {
                const unlocked = bt.level <= bLv;
                const active = this.state.selectedBrush === bt.mode;
                return `
                  <button class="brush-pill ${active ? 'active' : ''}" data-brush="${bt.mode}" ${unlocked ? '' : 'disabled'}>
                    ${bt.mode}${unlocked ? '' : ' 🔒'}
                  </button>
                `;
              }).join('')}
            </div>
            ${
              bNext
                ? `<button class="upg-buy-btn" id="buy-brush" ${this.state.deben < bNext.cost ? 'disabled' : ''}>
                    Unlock ${bNext.name} · 🪙 ${bNext.cost}
                  </button>`
                : `<div class="upg-max">★ 5×5 GRAND ARCHITECT UNLOCKED</div>`
            }
          </div>

          <!-- 4. FREE BUILD / SANDBOX TOGGLE -->
          <div class="upgrade-card sandbox-card">
            <div class="upg-top">
              <div class="upg-icon">🏛️</div>
              <div class="upg-info">
                <div class="upg-name">FREE BUILD / SANDBOX MODE</div>
                <div class="upg-stats">Unlimited carved blocks in hands for pure architectural creativity. <em>(Pauses credit for "The Eternal Sled" no-Sandbox trial while active.)</em></div>
              </div>
              <label class="papyrus-switch">
                <input type="checkbox" id="sandbox-toggle" ${this.state.sandbox ? 'checked' : ''} />
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
      </div>
    `;

    this.modalEl.querySelector('#upg-close').addEventListener('click', () => {
      this.audio.playUiClick();
      this.close();
      this.onChange?.('CLOSE');
    });

    const buyPick = this.modalEl.querySelector('#buy-pick');
    if (buyPick && pNext) {
      buyPick.addEventListener('click', () => {
        if (this.state.deben < pNext.cost) return;
        this.state.deben -= pNext.cost;
        this.state.upgrades.pickaxe++;
        this.audio.playQuestChime();
        this.onChange?.('UPGRADE');
        this.render();
      });
    }

    const buySled = this.modalEl.querySelector('#buy-sled');
    if (buySled && sNext) {
      buySled.addEventListener('click', () => {
        if (this.state.deben < sNext.cost) return;
        this.state.deben -= sNext.cost;
        this.state.upgrades.sled++;
        this.audio.playQuestChime();
        this.onChange?.('UPGRADE');
        this.render();
      });
    }

    const buyBrush = this.modalEl.querySelector('#buy-brush');
    if (buyBrush && bNext) {
      buyBrush.addEventListener('click', () => {
        if (this.state.deben < bNext.cost) return;
        this.state.deben -= bNext.cost;
        this.state.upgrades.brush++;
        this.state.selectedBrush = bNext.mode;
        this.audio.playQuestChime();
        this.onChange?.('UPGRADE');
        this.render();
      });
    }

    this.modalEl.querySelectorAll('.brush-pill').forEach((pill) => {
      pill.addEventListener('click', () => {
        this.audio.playUiClick();
        this.state.selectedBrush = pill.dataset.brush;
        this.onChange?.('BRUSH');
        this.render();
      });
    });

    const sb = this.modalEl.querySelector('#sandbox-toggle');
    sb.addEventListener('change', () => {
      this.audio.playUiClick();
      this.state.sandbox = sb.checked;
      this.onChange?.('SANDBOX');
      this.render();
    });
  }
}
