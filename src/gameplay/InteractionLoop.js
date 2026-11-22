import * as THREE from 'three';
import { BLOCK_SIZE, PYRAMID_LAYERS, createBeveledBlockGeometry } from '../engine/PyramidBuilder.js';

const RAYCAST_RANGE = 8.0;
const ANIM_DURATION = 0.3; // Smooth 0.3s cubic ease-out pickup / placement / attach animations

function easeOutCubic(t) {
  const u = 1 - Math.max(0, Math.min(1, t));
  return 1 - u * u * u;
}

export class InteractionLoop {
  constructor({ sceneManager, pyramidBuilder, physics, audio, gameState, callbacks }) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.camera = sceneManager.camera;
    this.pyramid = pyramidBuilder;
    this.physics = physics;
    this.audio = audio;
    this.state = gameState;
    this.callbacks = callbacks; // { onStatsChanged, onToast, onActionContextChanged }

    // Input state
    this.keys = new Set();
    this.joyActive = false;
    this.joyId = null;
    this.joyOrigin = { x: 0, y: 0 };
    this.joyVec = { x: 0, y: 0 }; // x = right, y = forward

    this.lookTouchId = null;
    this.lookLast = { x: 0, y: 0 };
    this.mouseDragging = false;

    this.actionHeld = false;
    this.actionCooldown = 0;
    this.carveProgress = 0;
    this.placeMode = 'PLACE'; // 'PLACE' | 'REMOVE'
    this.wantsJump = false;

    // Smooth 0.3s sled attach lerp state (zero teleporting!)
    this.sledAttachLerp = {
      active: false,
      t: 0,
      startPos: new THREE.Vector3(),
      targetPos: new THREE.Vector3(),
      startYaw: 0,
      targetYaw: 0
    };

    // Active 0.3s animated flying blocks (pickup / load / unload / placement downward arc)
    this.flyingBlocks = [];
    this._flyGeoCarved = createBeveledBlockGeometry(BLOCK_SIZE * 0.96, 0.12);
    this._flyGeoRough = new THREE.DodecahedronGeometry(0.42, 0);

    // Current raycast target & contextual action
    this.rayResult = null;
    this.currentAction = { id: 'NONE', label: 'EXPLORE', icon: 'compass', canSledToggle: false, showModeToggle: false };
    this.sledLoadedAtCamp = false;

    // First-person viewmodel & ghost wireframe preview pool (up to 25 blocks for 5x5 brush)
    this._buildFirstPersonViewmodel();
    this._buildGhostPreviewPool();

    // Scratch vectors
    this._rayOrigin = new THREE.Vector3();
    this._rayDir = new THREE.Vector3();
    this._tmpV = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();

    this._bindInputs();
  }

  _buildFirstPersonViewmodel() {
    this.vmRoot = new THREE.Group();

    // Pickaxe (copper curved blade + cedar wood shaft)
    this.vmPickaxe = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 0.68, 6),
      this.sceneManager.woodMaterial
    );
    shaft.position.set(0, -0.05, 0);
    this.vmPickaxe.add(shaft);

    const copperMat = new THREE.MeshStandardMaterial({
      color: 0xe2924d,
      emissive: 0x3b1c08,
      emissiveIntensity: 0.35,
      metalness: 0.45,
      roughness: 0.35
    });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.055, 0.055), copperMat);
    head.position.set(0, 0.25, 0);
    this.vmPickaxe.add(head);

    const tipL = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.14, 4), copperMat);
    tipL.rotation.z = Math.PI * 0.56;
    tipL.position.set(-0.23, 0.22, 0);
    this.vmPickaxe.add(tipL);

    const tipR = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.12, 4), copperMat);
    tipR.rotation.z = -Math.PI * 0.56;
    tipR.position.set(0.22, 0.23, 0);
    this.vmPickaxe.add(tipR);

    this.vmPickaxe.position.set(0.34, -0.34, -0.78);
    this.vmPickaxe.rotation.set(0.22, -0.58, 0.16);
    this.vmRoot.add(this.vmPickaxe);

    // Chisel & Wooden Mallet
    this.vmChisel = new THREE.Group();
    const mallet = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.16, 8), this.sceneManager.woodMaterial);
    mallet.rotation.z = Math.PI * 0.5;
    mallet.position.set(0.24, -0.28, -0.66);
    this.vmChisel.add(mallet);

    const chiselBar = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.028, 0.26), copperMat);
    chiselBar.position.set(-0.18, -0.30, -0.66);
    chiselBar.rotation.set(0.25, 0.35, 0);
    this.vmChisel.add(chiselBar);
    this.vmChisel.visible = false;
    this.vmRoot.add(this.vmChisel);

    // Carried carved beveled sandstone block held gracefully in lower-right foreground
    const heldCarvedGeo = createBeveledBlockGeometry(0.24, 0.028);
    this.vmCarvedBlock = new THREE.Mesh(heldCarvedGeo, this.sceneManager.carvedStoneMaterial);
    this.vmCarvedBlock.position.set(0.25, -0.30, -0.68);
    this.vmCarvedBlock.rotation.set(0.18, -0.35, 0.05);
    this.vmCarvedBlock.visible = false;
    this.vmRoot.add(this.vmCarvedBlock);

    // Carried rough quarried stone
    const heldRoughGeo = new THREE.DodecahedronGeometry(0.15, 0);
    this.vmRoughBlock = new THREE.Mesh(heldRoughGeo, this.sceneManager.roughStoneMaterial);
    this.vmRoughBlock.position.set(0.25, -0.30, -0.68);
    this.vmRoughBlock.visible = false;
    this.vmRoot.add(this.vmRoughBlock);

    this.swingT = 0;
    this.bobPhase = 0;

    this.camera.add(this.vmRoot);
    this.scene.add(this.camera);
  }

  _buildGhostPreviewPool() {
    this.ghostGroup = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(BLOCK_SIZE * 1.005, BLOCK_SIZE * 1.005, BLOCK_SIZE * 1.005);
    const edgesGeo = new THREE.EdgesGeometry(boxGeo);

    this.ghostWireMatValid = new THREE.LineBasicMaterial({
      color: 0xffd754,
      transparent: true,
      opacity: 0.95
    });
    this.ghostWireMatRemove = new THREE.LineBasicMaterial({
      color: 0xe65336,
      transparent: true,
      opacity: 0.95
    });
    this.ghostFillMatValid = new THREE.MeshBasicMaterial({
      color: 0xffd24d,
      transparent: true,
      opacity: 0.22,
      depthWrite: false
    });
    this.ghostFillMatRemove = new THREE.MeshBasicMaterial({
      color: 0xd94b2b,
      transparent: true,
      opacity: 0.24,
      depthWrite: false
    });

    this.ghostSlots = [];
    for (let i = 0; i < 25; i++) {
      const slot = new THREE.Group();
      const wire = new THREE.LineSegments(edgesGeo, this.ghostWireMatValid);
      const fill = new THREE.Mesh(boxGeo, this.ghostFillMatValid);
      slot.add(fill);
      slot.add(wire);
      slot.visible = false;
      this.ghostGroup.add(slot);
      this.ghostSlots.push({ group: slot, wire, fill });
    }
    this.scene.add(this.ghostGroup);
  }

  _bindInputs() {
    // Desktop keyboard support
    window.addEventListener('keydown', (e) => {
      if (this.state.mode !== 'PLAYING' || this.state.modalOpen) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') {
        this.audio.unlock();
        this.triggerPrimaryAction(true);
      } else if (e.code === 'KeyF') {
        this.audio.unlock();
        this.togglePullSled();
      } else if (e.code === 'KeyR' || e.code === 'KeyM') {
        this.togglePlaceMode();
      } else if (e.code === 'Space') {
        this.wantsJump = true;
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.actionHeld = false;
      if (e.code === 'Space') this.wantsJump = false;
    });

    // Touch-drag look on canvas (supports simultaneous multi-touch with joystick)
    const canvas = this.sceneManager.canvas;
    canvas.addEventListener('touchstart', (e) => {
      if (this.state.mode !== 'PLAYING' || this.state.modalOpen) return;
      this.audio.unlock();
      for (const touch of e.changedTouches) {
        if (this.lookTouchId === null && touch.identifier !== this.joyId) {
          this.lookTouchId = touch.identifier;
          this.lookLast.x = touch.clientX;
          this.lookLast.y = touch.clientY;
        }
      }
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (this.state.mode !== 'PLAYING' || this.state.modalOpen) return;
      const sens = 0.0052 * (this.state.settings.sensitivity || 1.0);
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.lookTouchId) {
          const dx = touch.clientX - this.lookLast.x;
          const dy = touch.clientY - this.lookLast.y;
          this.lookLast.x = touch.clientX;
          this.lookLast.y = touch.clientY;
          this.physics.player.yaw -= dx * sens;
          this.physics.player.pitch = Math.max(
            -1.36,
            Math.min(1.36, this.physics.player.pitch - dy * sens)
          );
        }
      }
    }, { passive: true });

    const endLook = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.lookTouchId) {
          this.lookTouchId = null;
        }
      }
    };
    canvas.addEventListener('touchend', endLook, { passive: true });
    canvas.addEventListener('touchcancel', endLook, { passive: true });

    // Desktop mouse drag look
    canvas.addEventListener('mousedown', (e) => {
      if (this.state.mode !== 'PLAYING' || this.state.modalOpen) return;
      if (e.button !== 0) return;
      this.audio.unlock();
      this.mouseDragging = true;
      this.lookLast.x = e.clientX;
      this.lookLast.y = e.clientY;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.mouseDragging || this.state.mode !== 'PLAYING' || this.state.modalOpen) return;
      const sens = 0.0045 * (this.state.settings.sensitivity || 1.0);
      const dx = e.clientX - this.lookLast.x;
      const dy = e.clientY - this.lookLast.y;
      this.lookLast.x = e.clientX;
      this.lookLast.y = e.clientY;
      this.physics.player.yaw -= dx * sens;
      this.physics.player.pitch = Math.max(
        -1.36,
        Math.min(1.36, this.physics.player.pitch - dy * sens)
      );
    });
    window.addEventListener('mouseup', () => {
      this.mouseDragging = false;
    });
  }

  /** Bind the floating virtual thumbstick DOM zone (bottom-left) */
  bindJoystickElement(zoneEl, baseEl, knobEl) {
    const maxRadius = 40;

    const updateStick = (clientX, clientY) => {
      const dx = clientX - this.joyOrigin.x;
      const dy = clientY - this.joyOrigin.y;
      const dist = Math.hypot(dx, dy);
      const clamped = Math.min(maxRadius, dist);
      const ang = Math.atan2(dy, dx);
      const nx = Math.cos(ang) * clamped;
      const ny = Math.sin(ang) * clamped;

      knobEl.style.transform = `translate(${nx}px, ${ny}px)`;
      this.joyVec.x = nx / maxRadius;
      this.joyVec.y = -ny / maxRadius; // up on screen = forward (+1)
    };

    const startStick = (id, x, y) => {
      this.audio.unlock();
      this.joyActive = true;
      this.joyId = id;
      const rect = zoneEl.getBoundingClientRect();
      this.joyOrigin.x = x;
      this.joyOrigin.y = y;
      // Float thumbstick ring smoothly to touch origin inside the left touch zone
      const relX = Math.max(46, Math.min(rect.width - 46, x - rect.left));
      const relY = Math.max(46, Math.min(rect.height - 46, y - rect.top));
      this.joyOrigin.x = rect.left + relX;
      this.joyOrigin.y = rect.top + relY;
      baseEl.style.left = `${relX}px`;
      baseEl.style.top = `${relY}px`;
      baseEl.classList.add('active');
      updateStick(x, y);
    };

    const endStick = () => {
      this.joyActive = false;
      this.joyId = null;
      this.joyVec.x = 0;
      this.joyVec.y = 0;
      knobEl.style.transform = 'translate(0px, 0px)';
      baseEl.classList.remove('active');
    };

    zoneEl.addEventListener('touchstart', (e) => {
      if (this.state.mode !== 'PLAYING' || this.state.modalOpen) return;
      e.preventDefault();
      e.stopPropagation();
      const t = e.changedTouches[0];
      if (!this.joyActive && t) startStick(t.identifier, t.clientX, t.clientY);
    }, { passive: false });

    zoneEl.addEventListener('touchmove', (e) => {
      if (!this.joyActive) return;
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          updateStick(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    const onTouchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joyId) {
          endStick();
          break;
        }
      }
    };
    zoneEl.addEventListener('touchend', onTouchEnd, { passive: true });
    zoneEl.addEventListener('touchcancel', onTouchEnd, { passive: true });

    // Pointer fallback for desktop mouse testing
    zoneEl.addEventListener('mousedown', (e) => {
      if (this.state.mode !== 'PLAYING' || this.state.modalOpen) return;
      e.preventDefault();
      e.stopPropagation();
      startStick('mouse', e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => {
      if (this.joyActive && this.joyId === 'mouse') updateStick(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', () => {
      if (this.joyActive && this.joyId === 'mouse') endStick();
    });
  }

  /** Called by the terracotta circular Action seal button */
  setActionHeld(held) {
    this.audio.unlock();
    if (held && !this.actionHeld) {
      this.triggerPrimaryAction(true);
    }
    this.actionHeld = held;
  }

  togglePlaceMode() {
    this.audio.playUiClick();
    this.placeMode = this.placeMode === 'PLACE' ? 'REMOVE' : 'PLACE';
    this.callbacks.onActionContextChanged?.(this.currentAction, this.placeMode);
  }

  /**
   * Smoothly attaches or detaches the player from the wooden sled's front tow ropes
   * over 0.3s cubic ease-out with zero teleporting!
   */
  togglePullSled() {
    const s = this.physics.sled;
    const p = this.physics.player;
    if (s.isTowed) {
      s.isTowed = false;
      this.sledAttachLerp.active = false;
      this.audio.playUiClick();
      this.callbacks.onToast?.('Sled released — gliding to a halt');
      return;
    }

    const dist = Math.hypot(p.position.x - s.position.x, p.position.z - s.position.z);
    if (dist > 5.4) {
      this.callbacks.onToast?.('Move closer to the wooden sled');
      return;
    }

    // Target position smoothly 2.8m ahead of sled center along its forward direction
    const fwdX = Math.sin(s.yaw);
    const fwdZ = Math.cos(s.yaw);
    this.sledAttachLerp.active = true;
    this.sledAttachLerp.t = 0;
    this.sledAttachLerp.startPos.copy(p.position);
    this.sledAttachLerp.targetPos.set(
      s.position.x + fwdX * 2.85,
      p.position.y,
      s.position.z + fwdZ * 2.85
    );
    this.sledAttachLerp.startYaw = p.yaw;
    this.sledAttachLerp.targetYaw = Math.atan2(-fwdX, -fwdZ);

    s.isTowed = true;
    if (s.blocksCount > 0) {
      this.sledLoadedAtCamp = true;
    }
    this.audio.playWaterSplash();
    this.callbacks.onToast?.('Pulling Wet-Sand Sled!');
  }

  /**
   * 3D DDA Voxel Raycast (8m range) through the 144-layer stepped pyramid grid.
   * Uses Amanatides-Woo stepping across layer Y planes and each layer's shifted (gx, gz) grid.
   */
  raycastPyramid() {
    this.camera.getWorldPosition(this._rayOrigin);
    this.camera.getWorldDirection(this._rayDir);

    const ox = this._rayOrigin.x;
    const oy = this._rayOrigin.y;
    const oz = this._rayOrigin.z;
    const dx = this._rayDir.x;
    const dy = this._rayDir.y;
    const dz = this._rayDir.z;

    const eps = 1e-6;
    let t = 0.05;
    let prevCell = null;

    // Exact multi-layer 3D DDA: advance to next X, Y, or Z boundary of current layer's 1.5m voxel grid
    for (let iter = 0; iter < 48 && t <= RAYCAST_RANGE; iter++) {
      const px = ox + dx * t;
      const py = oy + dy * t;
      const pz = oz + dz * t;

      // Check floor plane intersection (y = 0) for placing directly on Layer 0 foundation!
      if (py <= 0.001) {
        if (dy < -eps) {
          const tFloor = (0.01 - oy) / dy;
          if (tFloor > 0 && tFloor <= RAYCAST_RANGE) {
            const fx = ox + dx * tFloor;
            const fz = oz + dz * tFloor;
            const halfSpan0 = PYRAMID_LAYERS * 0.5;
            const gx0 = Math.floor(fx / BLOCK_SIZE + halfSpan0);
            const gz0 = Math.floor(fz / BLOCK_SIZE + halfSpan0);
            if (this.pyramid.isValidCell(gx0, 0, gz0) && !this.pyramid.isOccupied(gx0, 0, gz0)) {
              return {
                hitCell: null,
                placeCell: { gx: gx0, y: 0, gz: gz0 },
                dist: tFloor
              };
            }
          }
        }
        return null;
      }

      const y = Math.floor(py / BLOCK_SIZE);
      if (y >= 0 && y < PYRAMID_LAYERS) {
        const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
        const gx = Math.floor(px / BLOCK_SIZE + halfSpan);
        const gz = Math.floor(pz / BLOCK_SIZE + halfSpan);

        if (this.pyramid.isOccupied(gx, y, gz)) {
          let placeCell = null;
          if (prevCell && this.pyramid.isValidCell(prevCell.gx, prevCell.y, prevCell.gz) &&
              !this.pyramid.isOccupied(prevCell.gx, prevCell.y, prevCell.gz)) {
            placeCell = prevCell;
          } else if (y + 1 < PYRAMID_LAYERS) {
            // Outer-edge fallback: snap to valid stepped upper layer cell directly above hit block
            const sideAbove = PYRAMID_LAYERS - (y + 1);
            const topHalf = sideAbove * 0.5;
            const rawGx = Math.floor(px / BLOCK_SIZE + topHalf);
            const rawGz = Math.floor(pz / BLOCK_SIZE + topHalf);
            const tgx = Math.max(0, Math.min(sideAbove - 1, rawGx));
            const tgz = Math.max(0, Math.min(sideAbove - 1, rawGz));
            if (this.pyramid.isValidCell(tgx, y + 1, tgz) && !this.pyramid.isOccupied(tgx, y + 1, tgz)) {
              placeCell = { gx: tgx, y: y + 1, gz: tgz };
            }
          }
          return {
            hitCell: { gx, y, gz },
            placeCell,
            dist: t
          };
        }

        prevCell = { gx, y, gz };

        // Compute exact DDA distances to next X, Y, Z cell boundaries for this layer
        const minX = (gx - halfSpan) * BLOCK_SIZE;
        const maxX = minX + BLOCK_SIZE;
        const minY = y * BLOCK_SIZE;
        const maxY = minY + BLOCK_SIZE;
        const minZ = (gz - halfSpan) * BLOCK_SIZE;
        const maxZ = minZ + BLOCK_SIZE;

        const dtX = dx > eps ? (maxX - px) / dx : (dx < -eps ? (minX - px) / dx : Infinity);
        const dtY = dy > eps ? (maxY - py) / dy : (dy < -eps ? (minY - py) / dy : Infinity);
        const dtZ = dz > eps ? (maxZ - pz) / dz : (dz < -eps ? (minZ - pz) / dz : Infinity);

        const stepT = Math.min(dtX, dtY, dtZ);
        t += Math.max(0.015, stepT + 0.002);
      } else {
        // Above pyramid layers: step down to top layer or exit
        if (dy < -eps) {
          const tTop = (PYRAMID_LAYERS * BLOCK_SIZE - 0.01 - oy) / dy;
          if (tTop > t && tTop <= RAYCAST_RANGE) {
            t = tTop;
            continue;
          }
        }
        return null;
      }
    }

    return null;
  }

  /**
   * Spawns a smooth 0.3s cubic ease-out animated block flying between startPos and endPos.
   */
  _spawnFlyingBlock(startPos, endPos, isRough, arcHeight, onArrive) {
    const mesh = new THREE.Mesh(
      isRough ? this._flyGeoRough : this._flyGeoCarved,
      isRough ? this.sceneManager.roughStoneMaterial : this.sceneManager.carvedStoneMaterial
    );
    mesh.position.copy(startPos);
    mesh.castShadow = true;
    this.scene.add(mesh);

    this.flyingBlocks.push({
      mesh,
      start: startPos.clone(),
      end: endPos.clone(),
      t: 0,
      duration: ANIM_DURATION,
      arcHeight,
      isRough,
      onArrive
    });
  }

  _getHandWorldPos(out = new THREE.Vector3()) {
    out.set(0, -0.35, -0.85);
    out.applyMatrix4(this.camera.matrixWorld);
    return out;
  }

  /** Evaluate nearest interactive station/target and determine contextual Action Seal */
  _evaluateContext() {
    const p = this.physics.player.position;
    const s = this.physics.sled;
    const qPos = this.sceneManager.stations.quarry.position;
    const bPos = this.sceneManager.stations.bench.position;
    const inv = this.state.inventory;
    const carryCap = this.state.getCarryCapacity();
    const totalHeld = inv.rough + inv.carved;

    const distQuarry = Math.hypot(p.x - qPos.x, p.z - qPos.z);
    const distBench = Math.hypot(p.x - bPos.x, p.z - bPos.z);
    const distSled = Math.hypot(p.x - s.position.x, p.z - s.position.z);
    const nearRock = this.physics.findNearestQuarryRock(p, 3.2);

    const canSledToggle = s.isTowed || distSled < 4.8;
    const nearPyramid = p.z <= 116 && Math.abs(p.x) <= 116;
    const showModeToggle = !s.isTowed && (nearPyramid || inv.carved > 0 || this.state.sandbox);

    // 1. Pulling sled -> Action seal releases sled or boosts water pour
    if (s.isTowed) {
      this.currentAction = {
        id: 'RELEASE_SLED',
        label: 'RELEASE',
        icon: 'sled',
        canSledToggle: true,
        showModeToggle: false
      };
      return;
    }

    // 2. Pyramid manual placement / removal via 3D DDA voxel raycast
    this.rayResult = this.raycastPyramid();
    if (this.placeMode === 'REMOVE' && this.rayResult?.hitCell) {
      this.currentAction = {
        id: 'REMOVE',
        label: 'REMOVE',
        icon: 'remove',
        canSledToggle,
        showModeToggle: true
      };
      return;
    }
    if (this.placeMode === 'PLACE' && this.rayResult?.placeCell && (inv.carved > 0 || this.state.sandbox)) {
      this.currentAction = {
        id: 'PLACE',
        label: 'PLACE',
        icon: 'place',
        canSledToggle,
        showModeToggle: true
      };
      return;
    }

    // 3. Stonemason Carving Workbench (if carrying rough blocks)
    if (distBench < 4.2 && inv.rough > 0) {
      this.currentAction = {
        id: 'CARVE',
        label: 'CARVE',
        icon: 'chisel',
        canSledToggle,
        showModeToggle
      };
      return;
    }

    // 4. Wooden Cargo Sled loading / unloading
    if (distSled < 4.5) {
      if (inv.carved > 0 && s.blocksCount < s.maxCapacity) {
        this.currentAction = {
          id: 'LOAD',
          label: 'LOAD',
          icon: 'load',
          canSledToggle: true,
          showModeToggle
        };
        return;
      }
      if (s.blocksCount > 0 && totalHeld < carryCap) {
        this.currentAction = {
          id: 'UNLOAD',
          label: 'GRAB',
          icon: 'grab',
          canSledToggle: true,
          showModeToggle
        };
        return;
      }
      this.currentAction = {
        id: 'PULL_SLED',
        label: 'PULL SLED',
        icon: 'sled',
        canSledToggle: true,
        showModeToggle
      };
      return;
    }

    // 5. Fallen quarry rocks nearby & space in hands
    if (nearRock && totalHeld < carryCap && distQuarry > 4.2) {
      this.currentAction = {
        id: 'GRAB',
        label: 'GRAB',
        icon: 'grab',
        canSledToggle,
        showModeToggle
      };
      return;
    }

    // 6. Stepped Sandstone Quarry Cliff
    if (distQuarry < 7.0) {
      this.currentAction = {
        id: 'MINE',
        label: 'MINE',
        icon: 'pickaxe',
        canSledToggle,
        showModeToggle
      };
      return;
    }

    // Fallback: if standing near fallen rocks
    if (nearRock && totalHeld < carryCap) {
      this.currentAction = {
        id: 'GRAB',
        label: 'GRAB',
        icon: 'grab',
        canSledToggle,
        showModeToggle
      };
      return;
    }

    // Default exploration or place prompt
    if (this.rayResult?.placeCell) {
      this.currentAction = {
        id: 'PLACE',
        label: 'PLACE',
        icon: 'place',
        canSledToggle,
        showModeToggle: true
      };
    } else {
      this.currentAction = {
        id: 'MINE_HINT',
        label: 'MINE',
        icon: 'pickaxe',
        canSledToggle,
        showModeToggle
      };
    }
  }

  /** Execute one step of the current contextual action */
  triggerPrimaryAction(isInitialPress = false) {
    if (this.actionCooldown > 0) return;

    const act = this.currentAction.id;
    const inv = this.state.inventory;
    const s = this.physics.sled;
    const pickStats = this.state.getPickaxeStats();

    if (act === 'RELEASE_SLED' || act === 'PULL_SLED') {
      if (isInitialPress) this.togglePullSled();
      this.actionCooldown = 0.35;
      return;
    }

    // STEP 1: QUARRYING WITH RIGID-BODY FALLING ROCKS
    if (act === 'MINE') {
      this.swingT = 1.0;
      this.actionCooldown = pickStats.swingCooldown;
      this.audio.playPickaxeStrike();

      const strikePt = this.sceneManager.stations.quarry.strikeTarget.clone();
      // Aim strike vertically near player's look height along cliff
      strikePt.y = Math.max(1.5, Math.min(4.8, this.physics.player.position.y + 2.1));
      strikePt.z = Math.max(115, Math.min(129, this.physics.player.position.z));

      this.physics.spawnQuarryRocks(strikePt, pickStats.rocksPerStrike);
      this.state.stats.stonesQuarried += pickStats.rocksPerStrike;
      this.callbacks.onStatsChanged?.();
      return;
    }

    // STEP 1b: MANUAL GRAB OF FALLEN ROCK
    if (act === 'GRAB') {
      const rock = this.physics.findNearestQuarryRock(this.physics.player.position, 3.6);
      if (rock && inv.rough + inv.carved < this.state.getCarryCapacity()) {
        this._scoopRock(rock);
        this.actionCooldown = 0.12;
      }
      return;
    }

    // STEP 2: STONEMASON CARVING WORKBENCH
    if (act === 'CARVE') {
      if (inv.rough <= 0) return;
      this.swingT = 1.0;
      this.actionCooldown = pickStats.carveCooldown;
      this.audio.playChiselScrape();

      // Show rough/carved block on bench and emit flying sandstone chips
      const bp = this.sceneManager.stations.bench.position;
      this.sceneManager.benchRoughBlockMesh.visible = false;
      this.sceneManager.benchCarvedBlockMesh.visible = true;
      this.physics.spawnParticles(
        this._tmpV.set(bp.x - 0.2, bp.y + 1.55, bp.z),
        7,
        0xf3d79b,
        2.6,
        -11.0,
        0.42,
        0.72
      );

      const batch = Math.min(inv.rough, pickStats.carveBatch);
      inv.rough -= batch;
      inv.carved += batch;
      this.state.stats.stonesCarved += batch;
      this.state.deben += batch; // +1 Deben masonry craftsmanship bonus
      this.audio.playPickup(2);
      this.callbacks.onStatsChanged?.();
      return;
    }

    // STEP 3a: LOAD CARVED BLOCKS ONTO WOODEN SLED
    if (act === 'LOAD') {
      if (inv.carved <= 0 || s.blocksCount >= s.maxCapacity) return;
      const toLoad = Math.min(inv.carved, s.maxCapacity - s.blocksCount, pickStats.transferBatch);
      inv.carved -= toLoad;
      this.actionCooldown = 0.14;
      this.audio.playPickup(1);

      const handPos = this._getHandWorldPos();
      const deckPos = s.position.clone().add(new THREE.Vector3(0, 0.9, 0));
      this._spawnFlyingBlock(handPos, deckPos, false, 0.75, () => {
        s.blocksCount = Math.min(s.maxCapacity, s.blocksCount + toLoad);
        this.physics.syncSledCargoVisuals();
        this.audio.playStoneThud(1.35);
        this.callbacks.onStatsChanged?.();
      });
      this.callbacks.onStatsChanged?.();
      return;
    }

    // STEP 3b: UNLOAD / GRAB CARVED BLOCKS FROM SLED INTO FIRST-PERSON HANDS
    if (act === 'UNLOAD') {
      const cap = this.state.getCarryCapacity();
      const freeSpace = cap - (inv.rough + inv.carved);
      if (s.blocksCount <= 0 || freeSpace <= 0) return;

      const toGrab = Math.min(s.blocksCount, freeSpace, pickStats.transferBatch);
      s.blocksCount -= toGrab;
      this.physics.syncSledCargoVisuals();
      this.actionCooldown = 0.14;
      this.audio.playPickup(3);

      const deckPos = s.position.clone().add(new THREE.Vector3(0, 0.95, 0));
      const handPos = this._getHandWorldPos();
      this._spawnFlyingBlock(deckPos, handPos, false, 0.55, () => {
        inv.carved += toGrab;
        this.callbacks.onStatsChanged?.();
      });
      this.callbacks.onStatsChanged?.();
      return;
    }

    // STEP 4: INSIDE-THE-PYRAMID MANUAL PLACEMENT (with Master Architect multi-block brush!)
    if (act === 'PLACE') {
      if (!this.rayResult?.placeCell) return;
      if (!this.state.sandbox && inv.carved <= 0) {
        if (isInitialPress) this.callbacks.onToast?.('Carve limestone or grab blocks from your sled!');
        this.actionCooldown = 0.35;
        return;
      }

      const { gx, y, gz } = this.rayResult.placeCell;
      const brushCells = this.pyramid.getBrushCells(
        gx, y, gz,
        this.state.selectedBrush,
        this.physics.player.yaw
      );

      // Filter to empty cells that don't intersect player's own torso
      const pPos = this.physics.player.position;
      const validTargets = [];
      for (const c of brushCells) {
        if (this.pyramid.isOccupied(c.gx, c.y, c.gz)) continue;
        const wc = this.pyramid.cellToWorld(c.gx, c.y, c.gz, this._tmpV);
        const insidePlayer =
          Math.abs(wc.x - pPos.x) < BLOCK_SIZE * 0.5 + 0.25 &&
          Math.abs(wc.z - pPos.z) < BLOCK_SIZE * 0.5 + 0.25 &&
          wc.y + BLOCK_SIZE * 0.5 > pPos.y + 0.15 &&
          wc.y - BLOCK_SIZE * 0.5 < pPos.y + this.physics.player.height - 0.1;
        if (insidePlayer) continue;
        validTargets.push(c);
      }

      if (validTargets.length === 0) return;

      const maxPlace = this.state.sandbox ? validTargets.length : Math.min(validTargets.length, inv.carved);
      if (maxPlace <= 0) return;

      if (!this.state.sandbox) {
        inv.carved -= maxPlace;
      }
      this.actionCooldown = 0.20;
      const handPos = this._getHandWorldPos();

      // Launch smooth 0.3s cubic ease-out downward arc block(s) into the grid slots!
      for (let i = 0; i < maxPlace; i++) {
        const cell = validTargets[i];
        const targetWorld = this.pyramid.cellToWorld(cell.gx, cell.y, cell.gz);
        const isFirst = i === 0;
        this._spawnFlyingBlock(handPos, targetWorld, false, 0.65, () => {
          const placed = this.pyramid.placeBlock(cell.gx, cell.y, cell.gz);
          if (placed) {
            this.state.stats.blocksPlacedTotal++;
            if (!this.state.sandbox) {
              this.state.deben += 4;
            }
            if (isFirst) {
              this.audio.playStoneThud(0.95 + Math.random() * 0.12);
              this.physics.spawnParticles(targetWorld, 8, 0xf1d69c, 2.2, -6.5, 0.45, 0.9);
            }
            if (this.pyramid.apexPlaced && !this.state.stats.immortalVizierUnlocked) {
              this.state.stats.immortalVizierUnlocked = true;
              this.audio.playQuestChime();
              this.callbacks.onToast?.('CROWNED THE GOLDEN PYRAMIDION! IMMORTAL VIZIER!');
            }
            this.callbacks.onStatsChanged?.();
          }
        });
      }
      this.callbacks.onStatsChanged?.();
      return;
    }

    // STEP 4b: REMOVE MODE
    if (act === 'REMOVE' && this.rayResult?.hitCell) {
      const { gx, y, gz } = this.rayResult.hitCell;
      const removed = this.pyramid.removeBlock(gx, y, gz);
      if (removed) {
        this.actionCooldown = 0.22;
        const wc = this.pyramid.cellToWorld(gx, y, gz);
        this.physics.spawnParticles(wc, 6, 0xe8c78a, 2.5, -8.5, 0.4, 0.85);
        this.audio.playRockClack(0.85);
        if (!this.state.sandbox && inv.rough + inv.carved < this.state.getCarryCapacity()) {
          inv.carved++;
        }
        this.callbacks.onStatsChanged?.();
      }
      return;
    }

    if (act === 'MINE_HINT' && isInitialPress) {
      this.callbacks.onToast?.('Walk West to the Quarry Cliff to mine sandstone!');
      this.actionCooldown = 0.5;
    }
  }

  _scoopRock(rock) {
    const startPos = rock.pos.clone();
    this.physics.consumeQuarryRock(rock);
    this.audio.playPickup(0);

    const handPos = this._getHandWorldPos();
    this._spawnFlyingBlock(startPos, handPos, true, 0.42, () => {
      const cap = this.state.getCarryCapacity();
      if (this.state.inventory.rough + this.state.inventory.carved < cap) {
        this.state.inventory.rough++;
        this.callbacks.onStatsChanged?.();
      }
    });
  }

  /**
   * Main per-frame gameplay update (called only in PLAYING state).
   */
  update(dt) {
    const p = this.physics.player;
    const s = this.physics.sled;

    // 1. Handle smooth 0.3s sled attach lerp (zero teleporting!)
    if (this.sledAttachLerp.active) {
      this.sledAttachLerp.t += dt / ANIM_DURATION;
      const e = easeOutCubic(this.sledAttachLerp.t);
      p.position.lerpVectors(this.sledAttachLerp.startPos, this.sledAttachLerp.targetPos, e);
      p.visualY = p.position.y;
      if (this.sledAttachLerp.t >= 1) {
        this.sledAttachLerp.active = false;
      }
    }

    // 2. Combine virtual thumbstick + desktop WASD input
    let moveFwd = this.joyVec.y;
    let moveRight = this.joyVec.x;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) moveFwd += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) moveFwd -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveRight += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveRight -= 1;

    // Step physics
    if (!this.sledAttachLerp.active) {
      this.physics.update(dt, moveFwd, moveRight, this.wantsJump);
    }

    // 3. Position first-person camera smoothly at player eyes
    const horizSpeed = Math.hypot(p.velocity.x, p.velocity.z);
    if (horizSpeed > 0.35 && p.grounded) {
      this.bobPhase += dt * (s.isTowed ? 7.2 : 10.2);
    }
    const bobY = Math.sin(this.bobPhase) * 0.035 * Math.min(1, horizSpeed / 5);
    this.camera.position.set(
      p.position.x,
      p.visualY + p.eyeHeight + bobY,
      p.position.z
    );
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = p.yaw;
    this.camera.rotation.x = p.pitch;
    this.camera.rotation.z = 0;

    // 4. Auto-scoop fallen quarry rocks smoothly when walking near them!
    const totalHeld = this.state.inventory.rough + this.state.inventory.carved;
    if (!s.isTowed && totalHeld < this.state.getCarryCapacity()) {
      const rock = this.physics.findNearestQuarryRock(p.position, 2.35);
      if (rock) {
        this._scoopRock(rock);
      }
    }

    // 5. Detect Sled Delivery into the Pyramid Construction Zone (z <= 111.5)
    if (this.sledLoadedAtCamp && s.position.z <= 111.5 && s.blocksCount > 0) {
      this.sledLoadedAtCamp = false;
      this.state.stats.sledDeliveriesTotal++;
      const isFullSled = s.blocksCount >= s.maxCapacity;
      if (isFullSled && !this.state.sandbox) {
        this.state.stats.sledDeliveriesNoSandbox++;
        this.state.deben += 25;
        this.audio.playQuestChime();
        this.callbacks.onToast?.('Full Sled Delivered! +25 Deben');
      } else {
        this.state.deben += 8;
        this.callbacks.onToast?.('Sled Arrived at Pyramid Site! +8 Deben');
      }
      this.callbacks.onStatsChanged?.();
    } else if (!this.sledLoadedAtCamp && s.position.z >= 116 && s.blocksCount > 0) {
      this.sledLoadedAtCamp = true;
    }

    // 6. Evaluate contextual action & continuous hold actions
    const prevActionId = this.currentAction.id;
    const prevSledToggle = this.currentAction.canSledToggle;
    const prevModeToggle = this.currentAction.showModeToggle;
    this._evaluateContext();
    if (
      prevActionId !== this.currentAction.id ||
      prevSledToggle !== this.currentAction.canSledToggle ||
      prevModeToggle !== this.currentAction.showModeToggle
    ) {
      this.callbacks.onActionContextChanged?.(this.currentAction, this.placeMode);
    }

    if (this.actionCooldown > 0) this.actionCooldown -= dt;
    if (this.actionHeld && this.actionCooldown <= 0) {
      this.triggerPrimaryAction(false);
    }

    // 7. Update workbench visual block indicator
    const distBench = Math.hypot(
      p.position.x - this.sceneManager.stations.bench.position.x,
      p.position.z - this.sceneManager.stations.bench.position.z
    );
    if (distBench < 5 && this.state.inventory.rough > 0 && !this.sceneManager.benchCarvedBlockMesh.visible) {
      this.sceneManager.benchRoughBlockMesh.visible = true;
    } else if (distBench >= 5.5) {
      this.sceneManager.benchRoughBlockMesh.visible = false;
      this.sceneManager.benchCarvedBlockMesh.visible = false;
    }

    // 8. Update glowing golden wireframe ghost preview & first-person viewmodel
    this._updateGhostPreview();
    this._updateViewmodel(dt, horizSpeed);
    this._updateFlyingBlocks(dt);
  }

  _updateGhostPreview() {
    for (const s of this.ghostSlots) s.group.visible = false;

    if (this.state.mode !== 'PLAYING' || this.physics.sled.isTowed || !this.rayResult) return;

    const pulse = 0.72 + Math.sin(this.sceneManager.elapsed * 5.2) * 0.24;

    if (this.placeMode === 'REMOVE' && this.rayResult.hitCell) {
      const { gx, y, gz } = this.rayResult.hitCell;
      const slot = this.ghostSlots[0];
      this.pyramid.cellToWorld(gx, y, gz, slot.group.position);
      slot.wire.material = this.ghostWireMatRemove;
      slot.fill.material = this.ghostFillMatRemove;
      this.ghostWireMatRemove.opacity = pulse;
      slot.group.visible = true;
      return;
    }

    if (this.placeMode === 'PLACE' && this.rayResult.placeCell) {
      const { gx, y, gz } = this.rayResult.placeCell;
      const cells = this.pyramid.getBrushCells(
        gx, y, gz,
        this.state.selectedBrush,
        this.physics.player.yaw
      );
      const hasBlocks = this.state.sandbox || this.state.inventory.carved > 0;
      this.ghostWireMatValid.opacity = pulse;
      this.ghostFillMatValid.opacity = hasBlocks ? 0.24 : 0.08;

      let idx = 0;
      for (const c of cells) {
        if (idx >= this.ghostSlots.length) break;
        if (this.pyramid.isOccupied(c.gx, c.y, c.gz)) continue;
        const slot = this.ghostSlots[idx++];
        this.pyramid.cellToWorld(c.gx, c.y, c.gz, slot.group.position);
        slot.wire.material = hasBlocks ? this.ghostWireMatValid : this.ghostWireMatRemove;
        slot.fill.material = hasBlocks ? this.ghostFillMatValid : this.ghostFillMatRemove;
        slot.group.visible = true;
      }
    }
  }

  _updateViewmodel(dt, horizSpeed) {
    const act = this.currentAction.id;
    const inv = this.state.inventory;
    const isTowing = this.physics.sled.isTowed;

    this.vmRoot.visible = this.state.mode === 'PLAYING' && !isTowing;
    if (!this.vmRoot.visible) return;

    // Select visible tool or carried stone block
    const showCarve = act === 'CARVE';
    const showPick = !showCarve && (act === 'MINE' || (inv.carved === 0 && inv.rough === 0 && !this.state.sandbox));
    const showCarvedBlock = !showCarve && !showPick && (inv.carved > 0 || this.state.sandbox);
    const showRoughBlock = !showCarve && !showPick && !showCarvedBlock && inv.rough > 0;

    this.vmPickaxe.visible = showPick;
    this.vmChisel.visible = showCarve;
    this.vmCarvedBlock.visible = showCarvedBlock;
    this.vmRoughBlock.visible = showRoughBlock;

    // Smooth walk sway
    const swayX = Math.cos(this.bobPhase * 0.5) * 0.018 * Math.min(1, horizSpeed / 5);
    const swayY = Math.abs(Math.sin(this.bobPhase * 0.5)) * 0.02 * Math.min(1, horizSpeed / 5);
    this.vmRoot.position.set(swayX, -swayY, 0);

    // Overhead copper pickaxe / chisel swing animation
    if (this.swingT > 0) {
      this.swingT = Math.max(0, this.swingT - dt * 4.2);
      const swingCurve = Math.sin(this.swingT * Math.PI);
      this.vmPickaxe.rotation.x = 0.22 - swingCurve * 1.15;
      this.vmPickaxe.position.z = -0.78 - swingCurve * 0.14;
      this.vmChisel.position.y = -swingCurve * 0.12;
      this.vmChisel.rotation.x = swingCurve * 0.45;
    } else {
      this.vmPickaxe.rotation.x = 0.22;
      this.vmPickaxe.position.z = -0.78;
      this.vmChisel.position.y = 0;
      this.vmChisel.rotation.x = 0;
    }
  }

  _updateFlyingBlocks(dt) {
    for (let i = this.flyingBlocks.length - 1; i >= 0; i--) {
      const fb = this.flyingBlocks[i];
      fb.t += dt / fb.duration;
      const e = easeOutCubic(fb.t);

      // Smooth parabolic arc with gentle downward settle cushion at end
      fb.mesh.position.lerpVectors(fb.start, fb.end, e);
      fb.mesh.position.y += Math.sin(e * Math.PI) * fb.arcHeight;

      if (fb.isRough) {
        fb.mesh.rotation.x += dt * 7;
        fb.mesh.rotation.y += dt * 5;
        fb.mesh.scale.setScalar(1 - e * 0.45);
      } else {
        // Gentle squash-and-settle cushion right as it lands
        const settle = fb.t > 0.8 ? 1 - Math.sin(((fb.t - 0.8) / 0.2) * Math.PI) * 0.09 : 1;
        fb.mesh.scale.set(1 / Math.sqrt(settle), settle, 1 / Math.sqrt(settle));
      }

      if (fb.t >= 1) {
        this.scene.remove(fb.mesh);
        this.flyingBlocks.splice(i, 1);
        fb.onArrive?.();
      }
    }
  }
}
