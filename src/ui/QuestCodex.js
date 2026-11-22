import { TOTAL_BLOCKS } from '../engine/PyramidBuilder.js';

/**
 * 5 Progressive Chapters + Ultimate Endgame Trials (FTB-Quests-style dependency DAG)
 */
export const QUEST_CHAPTERS = [
  {
    id: 'ch1',
    roman: 'I',
    title: 'First Stone',
    subtitle: 'Begin the Pharaoh’s eternal monument',
    quests: [
      {
        id: 'q1_quarry',
        title: 'Quarry Awakening',
        desc: 'Strike the stepped sandstone cliff with your copper pickaxe to break loose 4 rough stones.',
        shape: 'diamond',
        x: 70, y: 120,
        deps: [],
        reward: 35,
        getProgress: (st) => ({ cur: Math.min(4, st.stats.stonesQuarried), max: 4 })
      },
      {
        id: 'q1_carve',
        title: 'Stonemason’s Edge',
        desc: 'Bring rough stones to the cedar carving bench and chisel 4 smooth beveled blocks.',
        shape: 'square',
        x: 210, y: 120,
        deps: ['q1_quarry'],
        reward: 50,
        getProgress: (st) => ({ cur: Math.min(4, st.stats.stonesCarved), max: 4 })
      },
      {
        id: 'q1_first_place',
        title: 'First Foundation Stone',
        desc: 'Walk inside the golden pyramid perimeter and lay your very first limestone block.',
        shape: 'diamond',
        x: 350, y: 120,
        deps: ['q1_carve'],
        reward: 75,
        getProgress: (st, pyr) => ({ cur: Math.min(1, pyr.placedCount), max: 1 })
      },
      {
        id: 'q1_ten_blocks',
        title: 'Row of the Vizier',
        desc: 'Lay 10 smooth sand-yellow limestone blocks along the Layer 1 base course.',
        shape: 'cluster',
        x: 490, y: 120,
        deps: ['q1_first_place'],
        reward: 120,
        getProgress: (st, pyr) => ({ cur: Math.min(10, pyr.placedCount), max: 10 })
      }
    ]
  },
  {
    id: 'ch2',
    roman: 'II',
    title: 'The Master’s Craft',
    subtitle: 'Tools of copper and wet-sand runners',
    quests: [
      {
        id: 'q2_upgrade_pick',
        title: 'Tempered Copper',
        desc: 'Upgrade your Pickaxe & Chisel to Tier 2 in Upgrades & Tools.',
        shape: 'square',
        x: 80, y: 80,
        deps: ['q1_ten_blocks'],
        reward: 140,
        getProgress: (st) => ({ cur: Math.min(2, st.upgrades.pickaxe), max: 2 })
      },
      {
        id: 'q2_carve_50',
        title: 'Chisel Rhythm',
        desc: 'Carve a total of 50 beveled limestone blocks at the stonemason bench.',
        shape: 'cluster',
        x: 80, y: 205,
        deps: ['q1_ten_blocks'],
        reward: 180,
        getProgress: (st) => ({ cur: Math.min(50, st.stats.stonesCarved), max: 50 })
      },
      {
        id: 'q2_first_sled',
        title: 'Glide on Wet Sand',
        desc: 'Load carved blocks onto your wooden sled and pull it across the pyramid boundary.',
        shape: 'diamond',
        x: 255, y: 140,
        deps: ['q2_upgrade_pick', 'q2_carve_50'],
        reward: 240,
        getProgress: (st) => ({ cur: Math.min(1, st.stats.sledDeliveriesTotal), max: 1 })
      },
      {
        id: 'q2_place_50',
        title: 'Cornerstone Course',
        desc: 'Reach 50 placed limestone blocks inside the Great Pyramid.',
        shape: 'diamond',
        x: 430, y: 140,
        deps: ['q2_first_sled'],
        reward: 320,
        getProgress: (st, pyr) => ({ cur: Math.min(50, pyr.placedCount), max: 50 })
      }
    ]
  },
  {
    id: 'ch3',
    roman: 'III',
    title: 'Builders of Giza',
    subtitle: 'Ascend the terraces with master brushes',
    quests: [
      {
        id: 'q3_layer2',
        title: 'Second Terrace',
        desc: 'Climb atop your masonry and place your first block on Layer 2.',
        shape: 'diamond',
        x: 85, y: 120,
        deps: ['q2_place_50'],
        reward: 350,
        getProgress: (st, pyr) => ({ cur: Math.min(2, pyr.highestLayer), max: 2 })
      },
      {
        id: 'q3_brush',
        title: 'Architect’s Line',
        desc: 'Unlock the 1×3 Master Architect manual placement brush.',
        shape: 'square',
        x: 235, y: 65,
        deps: ['q3_layer2'],
        reward: 400,
        getProgress: (st) => ({ cur: Math.min(2, st.upgrades.brush), max: 2 })
      },
      {
        id: 'q3_sled_15',
        title: 'Nile Caravan',
        desc: 'Complete 15 loaded sled deliveries to the pyramid construction site.',
        shape: 'cluster',
        x: 235, y: 185,
        deps: ['q3_layer2'],
        reward: 480,
        getProgress: (st) => ({ cur: Math.min(15, st.stats.sledDeliveriesTotal), max: 15 })
      },
      {
        id: 'q3_place_250',
        title: 'Quarter Thousand',
        desc: 'Place 250 smooth limestone blocks in your monolith.',
        shape: 'diamond',
        x: 410, y: 125,
        deps: ['q3_brush', 'q3_sled_15'],
        reward: 650,
        getProgress: (st, pyr) => ({ cur: Math.min(250, pyr.placedCount), max: 250 })
      }
    ]
  },
  {
    id: 'ch4',
    roman: 'IV',
    title: 'Rising Monument',
    subtitle: 'Heavy sleds & royal masonry scale',
    quests: [
      {
        id: 'q4_sled_tier3',
        title: 'Royal Cedar Runners',
        desc: 'Upgrade your Sled & Water-Jar to Tier 3 for heavy limestone loads.',
        shape: 'square',
        x: 85, y: 75,
        deps: ['q3_place_250'],
        reward: 750,
        getProgress: (st) => ({ cur: Math.min(3, st.upgrades.sled), max: 3 })
      },
      {
        id: 'q4_brush_5x5',
        title: 'Grand Square Brush',
        desc: 'Master the 5×5 Master Architect manual placement brush (Tier 4).',
        shape: 'square',
        x: 85, y: 195,
        deps: ['q3_place_250'],
        reward: 1100,
        getProgress: (st) => ({ cur: Math.min(4, st.upgrades.brush), max: 4 })
      },
      {
        id: 'q4_layer10',
        title: 'Ten Steps Skyward',
        desc: 'Ascend and lay masonry on Layer 10 of the 144-layer Great Pyramid.',
        shape: 'diamond',
        x: 265, y: 135,
        deps: ['q4_sled_tier3'],
        reward: 1400,
        getProgress: (st, pyr) => ({ cur: Math.min(10, pyr.highestLayer), max: 10 })
      },
      {
        id: 'q4_place_2500',
        title: 'Pharaoh’s Pride',
        desc: 'Reach 2,500 placed limestone blocks.',
        shape: 'cluster',
        x: 435, y: 135,
        deps: ['q4_layer10', 'q4_brush_5x5'],
        reward: 2500,
        getProgress: (st, pyr) => ({ cur: Math.min(2500, pyr.placedCount), max: 2500 })
      }
    ]
  },
  {
    id: 'ch5',
    roman: 'V',
    title: 'Ultimate Trials',
    subtitle: 'Legendary feats of the Immortal Vizier',
    quests: [
      {
        id: 'q5_eternal_sled',
        title: 'The Eternal Sled',
        desc: 'Complete 500 FULL wooden sled deliveries to the pyramid WITHOUT Sandbox mode active.',
        shape: 'ultimate',
        x: 110, y: 135,
        deps: [],
        reward: 15000,
        getProgress: (st) => ({ cur: Math.min(500, st.stats.sledDeliveriesNoSandbox), max: 500 })
      },
      {
        id: 'q5_skyward',
        title: 'Skyward Ascent',
        desc: 'Reach Layer 120 and place 900,000 smooth limestone blocks.',
        shape: 'ultimate',
        x: 280, y: 135,
        deps: ['q5_eternal_sled'],
        reward: 50000,
        getProgress: (st, pyr) => ({
          cur: Math.min(900000, pyr.placedCount),
          max: 900000,
          extraComplete: pyr.highestLayer >= 120,
          customText: `Layer ${pyr.highestLayer}/120 · ${pyr.placedCount.toLocaleString()}/900,000`
        })
      },
      {
        id: 'q5_monolith',
        title: 'The One Million Monolith',
        desc: 'Lay all 1,005,840 blocks and crown Layer 144 with the Golden Pyramidion apex. Unlocks the "IMMORTAL VIZIER" title.',
        shape: 'ultimate',
        x: 455, y: 135,
        deps: ['q5_skyward'],
        reward: 100000,
        titleReward: 'IMMORTAL VIZIER',
        getProgress: (st, pyr) => ({
          cur: Math.min(TOTAL_BLOCKS, pyr.placedCount),
          max: TOTAL_BLOCKS,
          extraComplete: pyr.apexPlaced,
          customText: `${pyr.placedCount.toLocaleString()} / 1,005,840${pyr.apexPlaced ? ' · Apex Crowned!' : ''}`
        })
      }
    ]
  }
];

export class QuestCodex {
  constructor(modalEl, gameState, pyramidBuilder, audio, onClaimCallback) {
    this.modalEl = modalEl;
    this.state = gameState;
    this.pyramid = pyramidBuilder;
    this.audio = audio;
    this.onClaim = onClaimCallback;

    this.activeChapterId = 'ch1';
    this.selectedQuestId = 'q1_quarry';
    this.sidebarCollapsed = false;

    // Pan & Zoom state for touch-interactive papyrus node graph
    this.pan = { x: 16, y: 20 };
    this.zoom = 0.88;
    this.dragging = false;
    this.dragLast = { x: 0, y: 0 };

    // Build flat lookup map
    this.questMap = new Map();
    for (const ch of QUEST_CHAPTERS) {
      for (const q of ch.quests) {
        this.questMap.set(q.id, { ...q, chapterId: ch.id });
      }
    }

    this._renderShell();
  }

  getQuestStatus(quest) {
    if (this.state.claimedQuests.includes(quest.id)) return 'claimed';

    // Check prerequisites
    for (const depId of quest.deps) {
      if (!this.state.claimedQuests.includes(depId)) {
        return 'locked';
      }
    }

    const prog = quest.getProgress(this.state, this.pyramid);
    const extraOk = prog.extraComplete !== undefined ? prog.extraComplete : true;
    if (prog.cur >= prog.max && extraOk) return 'claimable';
    return 'active';
  }

  /** Returns the first active or claimable quest for the HUD pinned quest scroll card */
  getPinnedQuest() {
    let firstClaimable = null;
    let firstActive = null;
    for (const ch of QUEST_CHAPTERS) {
      for (const q of ch.quests) {
        const s = this.getQuestStatus(q);
        if (s === 'claimable' && !firstClaimable) firstClaimable = q;
        if (s === 'active' && !firstActive) firstActive = q;
      }
    }
    const q = firstClaimable || firstActive || QUEST_CHAPTERS[4].quests[2];
    const prog = q.getProgress(this.state, this.pyramid);
    return {
      quest: q,
      status: this.getQuestStatus(q),
      progress: prog
    };
  }

  hasClaimableQuests() {
    for (const ch of QUEST_CHAPTERS) {
      for (const q of ch.quests) {
        if (this.getQuestStatus(q) === 'claimable') return true;
      }
    }
    return false;
  }

  open(focusQuestId = null) {
    if (focusQuestId && this.questMap.has(focusQuestId)) {
      const q = this.questMap.get(focusQuestId);
      this.activeChapterId = q.chapterId;
      this.selectedQuestId = q.id;
    } else {
      const pinned = this.getPinnedQuest();
      if (pinned) {
        const q = this.questMap.get(pinned.quest.id);
        this.activeChapterId = q.chapterId;
        this.selectedQuestId = q.id;
      }
    }
    this.pan = { x: 10, y: 12 };
    this.zoom = 0.85;
    this.modalEl.classList.remove('hidden');
    this.render();
  }

  close() {
    this.modalEl.classList.add('hidden');
  }

  _renderShell() {
    this.modalEl.innerHTML = `
      <div class="papyrus-modal codex-modal">
        <div class="modal-header">
          <button class="icon-chip" id="codex-toggle-tree" title="Chapters">☰</button>
          <div class="modal-title-wrap">
            <div class="modal-title">LIVRE DES QUÊTES</div>
            <div class="modal-sub" id="codex-title-badge">Royal Builder's Codex</div>
          </div>
          <button class="icon-chip close-btn" id="codex-close">✕</button>
        </div>
        <div class="codex-body">
          <aside class="codex-sidebar" id="codex-sidebar"></aside>
          <section class="codex-graph-pane">
            <div class="codex-chapter-banner" id="codex-chapter-banner"></div>
            <div class="codex-canvas-wrap" id="codex-canvas-wrap">
              <div class="codex-graph-stage" id="codex-graph-stage">
                <svg class="codex-lines" id="codex-lines" width="600" height="300"></svg>
                <div class="codex-nodes" id="codex-nodes"></div>
              </div>
              <div class="codex-zoom-controls">
                <button class="zoom-btn" id="codex-zoom-in">+</button>
                <button class="zoom-btn" id="codex-zoom-out">−</button>
                <button class="zoom-btn" id="codex-zoom-reset">⌖</button>
              </div>
            </div>
            <div class="codex-detail-card" id="codex-detail-card"></div>
          </section>
        </div>
        <div class="codex-milestones" id="codex-milestones"></div>
      </div>
    `;

    this.sidebarEl = this.modalEl.querySelector('#codex-sidebar');
    this.bannerEl = this.modalEl.querySelector('#codex-chapter-banner');
    this.wrapEl = this.modalEl.querySelector('#codex-canvas-wrap');
    this.stageEl = this.modalEl.querySelector('#codex-graph-stage');
    this.linesSvg = this.modalEl.querySelector('#codex-lines');
    this.nodesEl = this.modalEl.querySelector('#codex-nodes');
    this.detailEl = this.modalEl.querySelector('#codex-detail-card');
    this.milestonesEl = this.modalEl.querySelector('#codex-milestones');
    this.badgeEl = this.modalEl.querySelector('#codex-title-badge');

    this.modalEl.querySelector('#codex-close').addEventListener('click', () => {
      this.audio.playUiClick();
      this.close();
      this.onClaim?.('CLOSE');
    });

    this.modalEl.querySelector('#codex-toggle-tree').addEventListener('click', () => {
      this.audio.playUiClick();
      this.sidebarCollapsed = !this.sidebarCollapsed;
      this.sidebarEl.classList.toggle('collapsed', this.sidebarCollapsed);
    });

    this.modalEl.querySelector('#codex-zoom-in').addEventListener('click', () => {
      this.zoom = Math.min(1.45, this.zoom + 0.16);
      this._applyStageTransform();
    });
    this.modalEl.querySelector('#codex-zoom-out').addEventListener('click', () => {
      this.zoom = Math.max(0.55, this.zoom - 0.16);
      this._applyStageTransform();
    });
    this.modalEl.querySelector('#codex-zoom-reset').addEventListener('click', () => {
      this.pan = { x: 10, y: 12 };
      this.zoom = 0.85;
      this._applyStageTransform();
    });

    // Touch & pointer panning on the papyrus node graph
    const onStart = (x, y) => {
      this.dragging = true;
      this.dragLast.x = x;
      this.dragLast.y = y;
    };
    const onMove = (x, y) => {
      if (!this.dragging) return;
      this.pan.x = Math.max(-360, Math.min(120, this.pan.x + (x - this.dragLast.x)));
      this.pan.y = Math.max(-140, Math.min(110, this.pan.y + (y - this.dragLast.y)));
      this.dragLast.x = x;
      this.dragLast.y = y;
      this._applyStageTransform();
    };
    const onEnd = () => { this.dragging = false; };

    this.wrapEl.addEventListener('touchstart', (e) => {
      if (e.target.closest('.quest-node') || e.target.closest('.zoom-btn')) return;
      if (e.touches.length === 1) onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    this.wrapEl.addEventListener('touchmove', (e) => {
      if (this.dragging && e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
    this.wrapEl.addEventListener('touchend', onEnd, { passive: true });

    this.wrapEl.addEventListener('mousedown', (e) => {
      if (e.target.closest('.quest-node') || e.target.closest('.zoom-btn')) return;
      onStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);
  }

  _applyStageTransform() {
    this.stageEl.style.transform = `translate(${this.pan.x}px, ${this.pan.y}px) scale(${this.zoom})`;
  }

  render() {
    this.badgeEl.textContent = this.state.stats.immortalVizierUnlocked
      ? '👑 TITLE: IMMORTAL VIZIER'
      : 'Royal Builder’s Papyrus Codex';

    // 1. Render Left Chapter Tree
    this.sidebarEl.innerHTML = QUEST_CHAPTERS.map((ch) => {
      const done = ch.quests.filter((q) => this.state.claimedQuests.includes(q.id)).length;
      const hasReady = ch.quests.some((q) => this.getQuestStatus(q) === 'claimable');
      const active = ch.id === this.activeChapterId ? 'active' : '';
      return `
        <button class="chapter-btn ${active}" data-ch="${ch.id}">
          <span class="chapter-roman">${ch.roman}</span>
          <span class="chapter-meta">
            <span class="chapter-name">${ch.title}</span>
            <span class="chapter-count">${done}/${ch.quests.length}</span>
          </span>
          ${hasReady ? '<span class="ready-dot"></span>' : ''}
        </button>
      `;
    }).join('');

    this.sidebarEl.querySelectorAll('.chapter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.audio.playUiClick();
        this.activeChapterId = btn.dataset.ch;
        const ch = QUEST_CHAPTERS.find((c) => c.id === this.activeChapterId);
        if (ch && ch.quests[0]) this.selectedQuestId = ch.quests[0].id;
        this.pan = { x: 10, y: 12 };
        this.render();
      });
    });

    // 2. Render Active Chapter Graph
    const chapter = QUEST_CHAPTERS.find((c) => c.id === this.activeChapterId) || QUEST_CHAPTERS[0];
    this.bannerEl.innerHTML = `<strong>Ch. ${chapter.roman}: ${chapter.title}</strong> <span>${chapter.subtitle}</span>`;

    // Sepia/Gold dependency connector lines
    const chapterQuestIds = new Set(chapter.quests.map((q) => q.id));
    let svgLines = '';
    for (const q of chapter.quests) {
      const qStatus = this.getQuestStatus(q);
      for (const depId of q.deps) {
        if (!chapterQuestIds.has(depId)) continue;
        const parent = chapter.quests.find((p) => p.id === depId);
        if (!parent) continue;
        const claimed = qStatus === 'claimed' || qStatus === 'claimable';
        const stroke = claimed ? '#D49A2A' : '#8A6B46';
        svgLines += `
          <line x1="${parent.x}" y1="${parent.y}" x2="${q.x}" y2="${q.y}"
            stroke="${stroke}" stroke-width="${claimed ? 4 : 3}" stroke-dasharray="${qStatus === 'locked' ? '6 5' : 'none'}"
            stroke-linecap="round" />
        `;
      }
    }
    this.linesSvg.innerHTML = svgLines;

    // Crisp inline SVG icons (100% consistent across iOS, Android & desktop)
    const icons = {
      diamond: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 L21 18 H3 Z"/><path d="M8 18 L12 11 L16 18"/></svg>`,
      square: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 L14 10"/><path d="M11 6 L18 13 L20 11 L13 4 Z"/></svg>`,
      cluster: `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linejoin="round"><rect x="3" y="12" width="8" height="7" rx="1"/><rect x="13" y="12" width="8" height="7" rx="1"/><rect x="8" y="4" width="8" height="7" rx="1"/></svg>`,
      ultimate: `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M3 12 Q12 5 21 12 Q12 19 3 12 Z"/><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M12 16 L10 21 M14 16 C16 19 19 20 20 18"/></svg>`
    };
    this.nodesEl.innerHTML = chapter.quests.map((q) => {
      const status = this.getQuestStatus(q);
      const selected = q.id === this.selectedQuestId ? 'selected' : '';
      return `
        <button class="quest-node shape-${q.shape} status-${status} ${selected}"
          data-qid="${q.id}" style="left:${q.x}px; top:${q.y}px;">
          <span class="node-inner"><span class="node-glyph">${status === 'claimed' ? '✓' : icons[q.shape]}</span></span>
          <span class="node-label">${q.title}</span>
        </button>
      `;
    }).join('');

    this.nodesEl.querySelectorAll('.quest-node').forEach((nodeEl) => {
      nodeEl.addEventListener('click', (e) => {
        e.stopPropagation();
        this.audio.playUiClick();
        this.selectedQuestId = nodeEl.dataset.qid;
        this.render();
      });
    });

    this._applyStageTransform();

    // 3. Render Selected Quest Detail Card
    const sel = chapter.quests.find((q) => q.id === this.selectedQuestId) || chapter.quests[0];
    if (sel) {
      const status = this.getQuestStatus(sel);
      const prog = sel.getProgress(this.state, this.pyramid);
      const pct = Math.min(100, Math.round((prog.cur / Math.max(1, prog.max)) * 100));
      const progText = prog.customText || `${prog.cur.toLocaleString()} / ${prog.max.toLocaleString()}`;

      this.detailEl.innerHTML = `
        <div class="detail-top">
          <div>
            <div class="detail-title">${sel.title}</div>
            <div class="detail-desc">${sel.desc}</div>
          </div>
          <div class="detail-reward">+${sel.reward.toLocaleString()} 🪙</div>
        </div>
        <div class="detail-bottom">
          <div class="detail-bar-wrap">
            <div class="detail-bar-fill" style="width:${pct}%"></div>
            <span class="detail-bar-text">${progText}</span>
          </div>
          ${
            status === 'claimable'
              ? `<button class="claim-btn" id="codex-claim-btn">CLAIM</button>`
              : status === 'claimed'
                ? `<span class="status-pill claimed">CLAIMED ✓</span>`
                : status === 'locked'
                  ? `<span class="status-pill locked">LOCKED</span>`
                  : `<span class="status-pill active">IN PROGRESS</span>`
          }
        </div>
      `;

      const claimBtn = this.detailEl.querySelector('#codex-claim-btn');
      if (claimBtn) {
        claimBtn.addEventListener('click', () => {
          this.state.claimedQuests.push(sel.id);
          this.state.deben += sel.reward;
          if (sel.titleReward) {
            this.state.stats.immortalVizierUnlocked = true;
          }
          this.audio.playQuestChime();
          this.onClaim?.('CLAIM', sel);
          this.render();
        });
      }
    }

    // 4. Bottom Ultimate Trials Milestone Row
    const ult = QUEST_CHAPTERS[4].quests;
    this.milestonesEl.innerHTML = ult.map((q) => {
      const st = this.getQuestStatus(q);
      const p = q.getProgress(this.state, this.pyramid);
      const pct = Math.min(100, Math.round((p.cur / Math.max(1, p.max)) * 100));
      return `
        <button class="milestone-chip status-${st}" data-mqid="${q.id}">
          <span class="ms-title">${q.title}</span>
          <span class="ms-pct">${st === 'claimed' ? '✓' : pct + '%'}</span>
        </button>
      `;
    }).join('');

    this.milestonesEl.querySelectorAll('.milestone-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        this.audio.playUiClick();
        this.activeChapterId = 'ch5';
        this.selectedQuestId = chip.dataset.mqid;
        this.render();
      });
    });
  }
}
