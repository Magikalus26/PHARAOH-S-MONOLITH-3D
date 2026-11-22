import * as THREE from 'three';
import { BLOCK_SIZE, PYRAMID_LAYERS, createBeveledBlockGeometry } from '../engine/PyramidBuilder.js';

const GRAVITY = -18.5;
const MAX_QUARRY_ROCKS = 48;
const MAX_PARTICLES = 120;
const MAX_WET_DECALS = 64;
const MAX_SLED_VISUAL_BLOCKS = 36;

export class PhysicsSystem {
  constructor(sceneManager, pyramidBuilder, audio) {
    this.sceneManager = sceneManager;
    this.scene = sceneManager.scene;
    this.pyramid = pyramidBuilder;
    this.audio = audio;

    // Player physical state
    this.player = {
      position: new THREE.Vector3(-4, 0, 129.5), // feet world position facing work camp & pyramid
      velocity: new THREE.Vector3(),
      yaw: 0.16,   // frames quarry cliff (left), bench (front-left), sled (right) & pyramid ahead
      pitch: -0.06,
      radius: 0.42,
      height: 1.75,
      eyeHeight: 1.56,
      grounded: true,
      visualY: 0   // smoothed Y for buttery 1-block auto-step stair climbing
    };

    // Rigid-body falling quarry rocks pool
    this.quarryRocks = [];
    this._initQuarryRockPool();

    // Particle pool (dust puffs, chisel chips, water drops)
    this.particles = [];
    this._initParticlePool();

    // Glistening dark wet-sand trail decal pool
    this.wetDecals = [];
    this.wetDecalCursor = 0;
    this.wetTrailCooldown = 0;
    this._initWetSandDecals();

    // Medieval-cart-style wet-sand wooden sled
    this.sled = {
      position: sceneManager.stations.sledStart.clone(),
      velocity: new THREE.Vector3(),
      yaw: Math.PI, // facing North (-Z) toward the pyramid (local +Z is sled front!)
      angularVel: 0,
      pitch: 0,
      roll: 0,
      isTowed: false,
      attachT: 0, // 0..1 smooth 0.3s attach blend
      blocksCount: 0,
      maxCapacity: 8,
      speedBoost: 1.25,
      group: null,
      cargoMeshes: [],
      waterStreamMesh: null,
      ropeLeft: null,
      ropeRight: null
    };
    this._buildSledMesh();

    // Scratch vectors
    this._tmpV1 = new THREE.Vector3();
    this._tmpV2 = new THREE.Vector3();
  }

  _initQuarryRockPool() {
    // Slightly irregular faceted rough limestone boulder
    const geo = new THREE.DodecahedronGeometry(0.36, 0);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const vx = pos.getX(i);
      const vy = pos.getY(i);
      const vz = pos.getZ(i);
      const wobble = 0.86 + ((i * 37) % 10) * 0.032;
      pos.setXYZ(i, vx * wobble, vy * (wobble * 0.88), vz * wobble);
    }
    geo.computeVertexNormals();

    const mat = this.sceneManager.roughStoneMaterial;
    for (let i = 0; i < MAX_QUARRY_ROCKS; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.visible = false;
      this.scene.add(mesh);

      this.quarryRocks.push({
        active: false,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        angVel: new THREE.Vector3(),
        radius: 0.33,
        settled: false,
        age: 0
      });
    }
  }

  _initParticlePool() {
    const geo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xe6c88c,
        transparent: true,
        opacity: 0.8
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.particles.push({
        active: false,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.6,
        gravity: -8,
        baseScale: 1
      });
    }
  }

  _initWetSandDecals() {
    const geo = new THREE.PlaneGeometry(1.9, 1.35);
    geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < MAX_WET_DECALS; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: 0x7d572a,
        roughness: 0.18,
        metalness: 0.22,
        transparent: true,
        opacity: 0,
        depthWrite: false
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.wetDecals.push({
        active: false,
        mesh,
        age: 0,
        maxAge: 11.0
      });
    }
  }

  _buildSledMesh() {
    const g = new THREE.Group();
    const wood = this.sceneManager.woodMaterial;

    // Two heavy upturned wooden runners (local +Z is front of sled)
    const runnerGeo = new THREE.BoxGeometry(0.24, 0.22, 3.6);
    const tipGeo = new THREE.BoxGeometry(0.24, 0.22, 0.72);
    for (const sx of [-0.95, 0.95]) {
      const runner = new THREE.Mesh(runnerGeo, wood);
      runner.position.set(sx, 0.11, 0);
      runner.castShadow = true;
      runner.receiveShadow = true;
      g.add(runner);

      // Upturned curved prow tip at +Z
      const tip = new THREE.Mesh(tipGeo, wood);
      tip.position.set(sx, 0.28, 1.98);
      tip.rotation.x = -0.58;
      tip.castShadow = true;
      g.add(tip);
    }

    // Thick cedar plank cargo deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.16, 3.05), wood);
    deck.position.set(0, 0.30, -0.05);
    deck.castShadow = true;
    deck.receiveShadow = true;
    g.add(deck);

    // Side & rear wooden cargo braces
    const rearRail = new THREE.Mesh(new THREE.BoxGeometry(2.25, 0.34, 0.16), wood);
    rearRail.position.set(0, 0.52, -1.52);
    rearRail.castShadow = true;
    g.add(rearRail);

    const frontBeam = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.22, 0.22), wood);
    frontBeam.position.set(0, 0.44, 1.56);
    frontBeam.castShadow = true;
    g.add(frontBeam);

    // Front Clay Water Jar mounted on the prow for the wet-sand glide mechanic!
    const jarMat = new THREE.MeshStandardMaterial({
      color: 0xb65836,
      roughness: 0.76,
      metalness: 0.05
    });
    const jarBody = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), jarMat);
    jarBody.scale.set(0.95, 1.25, 0.95);
    jarBody.position.set(0, 0.72, 1.65);
    jarBody.rotation.x = 0.42; // tilted forward ready to pour
    jarBody.castShadow = true;
    g.add(jarBody);

    const jarNeck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.28, 10), jarMat);
    jarNeck.position.set(0, 0.98, 1.84);
    jarNeck.rotation.x = 0.48;
    g.add(jarNeck);

    // Shimmering water stream pouring onto sand ahead of runners when towed
    const streamMat = new THREE.MeshBasicMaterial({
      color: 0x6fd0f5,
      transparent: true,
      opacity: 0.78
    });
    const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.085, 1.05, 6), streamMat);
    stream.position.set(0, 0.52, 2.08);
    stream.rotation.x = 0.24;
    stream.visible = false;
    g.add(stream);
    this.sled.waterStreamMesh = stream;

    // Stacked carved sand-yellow limestone cargo block visual meshes on deck
    const miniBlockGeo = createBeveledBlockGeometry(0.62, 0.06);
    const carvedMat = this.sceneManager.carvedStoneMaterial;
    for (let i = 0; i < MAX_SLED_VISUAL_BLOCKS; i++) {
      const layer = Math.floor(i / 12);
      const rem = i % 12;
      const col = rem % 3;
      const row = Math.floor(rem / 3);
      const bm = new THREE.Mesh(miniBlockGeo, carvedMat);
      bm.position.set(
        (col - 1) * 0.66,
        0.69 + layer * 0.63,
        -1.02 + row * 0.68
      );
      bm.castShadow = true;
      bm.receiveShadow = true;
      bm.visible = false;
      g.add(bm);
      this.sled.cargoMeshes.push(bm);
    }

    // Dynamic hemp tow-ropes (in world space, connecting sled front beam to player hands when pulling)
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xc8a364, roughness: 0.95 });
    const ropeGeo = new THREE.CylinderGeometry(0.032, 0.032, 1, 5);
    ropeGeo.rotateX(Math.PI * 0.5);
    this.sled.ropeLeft = new THREE.Mesh(ropeGeo, ropeMat);
    this.sled.ropeRight = new THREE.Mesh(ropeGeo, ropeMat);
    this.sled.ropeLeft.visible = false;
    this.sled.ropeRight.visible = false;
    this.scene.add(this.sled.ropeLeft);
    this.scene.add(this.sled.ropeRight);

    g.position.copy(this.sled.position);
    g.rotation.y = this.sled.yaw;
    this.sled.group = g;
    this.scene.add(g);
  }

  /** Sync physical cargo stack meshes on the wooden sled deck */
  syncSledCargoVisuals() {
    const visCount = Math.min(MAX_SLED_VISUAL_BLOCKS, this.sled.blocksCount);
    for (let i = 0; i < MAX_SLED_VISUAL_BLOCKS; i++) {
      this.sled.cargoMeshes[i].visible = i < visCount;
    }
  }

  /** Spawns a burst of dust/chip/water particles from the pool */
  spawnParticles(origin, count, colorHex, speed = 2.8, gravity = -9.5, life = 0.55, scale = 1.0) {
    let spawned = 0;
    for (let i = 0; i < this.particles.length && spawned < count; i++) {
      const p = this.particles[i];
      if (p.active) continue;
      p.active = true;
      p.pos.copy(origin);
      p.vel.set(
        (Math.random() - 0.5) * speed * 1.4,
        0.7 + Math.random() * speed,
        (Math.random() - 0.5) * speed * 1.4
      );
      p.life = life * (0.7 + Math.random() * 0.5);
      p.maxLife = p.life;
      p.gravity = gravity;
      p.baseScale = scale * (0.7 + Math.random() * 0.65);
      p.mesh.material.color.setHex(colorHex);
      p.mesh.material.opacity = 0.85;
      p.mesh.position.copy(p.pos);
      p.mesh.scale.setScalar(p.baseScale);
      p.mesh.visible = true;
      spawned++;
    }
  }

  /**
   * Spawns N physical rough sandstone rocks directly out of the stepped quarry cliff face
   * with outward impulse, gravity, mid-air tumbling rotation, bouncing, and dust puffs!
   */
  spawnQuarryRocks(origin, count = 2) {
    let spawned = 0;
    for (let i = 0; i < this.quarryRocks.length && spawned < count; i++) {
      const r = this.quarryRocks[i];
      if (r.active) continue;
      r.active = true;
      r.settled = false;
      r.age = 0;
      r.pos.set(
        origin.x + 0.35 + Math.random() * 0.5,
        origin.y + (Math.random() - 0.3) * 1.2,
        origin.z + (Math.random() - 0.5) * 2.2
      );
      // Outward impulse away from the West cliff face (+X) with lively arc
      r.vel.set(
        2.4 + Math.random() * 3.6,
        2.0 + Math.random() * 3.2,
        (Math.random() - 0.5) * 3.6
      );
      r.angVel.set(
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12,
        (Math.random() - 0.5) * 12
      );
      const s = 0.82 + Math.random() * 0.36;
      r.radius = 0.33 * s;
      r.mesh.scale.setScalar(s);
      r.mesh.position.copy(r.pos);
      r.mesh.visible = true;
      spawned++;
    }

    // If pool is completely full, recycle the oldest settled rock so mining always feels rewarding
    if (spawned < count) {
      for (let k = spawned; k < count; k++) {
        let oldest = this.quarryRocks[0];
        for (const r of this.quarryRocks) {
          if (r.age > oldest.age) oldest = r;
        }
        oldest.active = true;
        oldest.settled = false;
        oldest.age = 0;
        oldest.pos.set(origin.x + 0.4, origin.y + 0.4, origin.z + (Math.random() - 0.5) * 2);
        oldest.vel.set(2.6 + Math.random() * 3.0, 2.2 + Math.random() * 2.6, (Math.random() - 0.5) * 3.2);
        oldest.angVel.set((Math.random() - 0.5) * 11, (Math.random() - 0.5) * 11, (Math.random() - 0.5) * 11);
        oldest.mesh.position.copy(oldest.pos);
        oldest.mesh.visible = true;
      }
    }

    this.spawnParticles(origin, 8, 0xe8c78a, 3.2, -9.0, 0.55, 1.15);
  }

  /** Find nearest active fallen quarry rock within pickup distance */
  findNearestQuarryRock(pos, maxDist = 2.6) {
    let best = null;
    let bestD2 = maxDist * maxDist;
    for (const r of this.quarryRocks) {
      if (!r.active || r.age < 0.28) continue;
      const dx = r.pos.x - pos.x;
      const dz = r.pos.z - pos.z;
      const dy = r.pos.y - (pos.y + 0.7);
      const d2 = dx * dx + dz * dz + dy * dy * 0.5;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = r;
      }
    }
    return best;
  }

  consumeQuarryRock(rock) {
    if (!rock) return;
    rock.active = false;
    rock.mesh.visible = false;
  }

  getActiveQuarryRockCount() {
    let c = 0;
    for (const r of this.quarryRocks) if (r.active) c++;
    return c;
  }

  /** Query ramp deck height at (x, z) if on a wooden ramp, else 0 */
  getRampHeightAt(x, z) {
    let h = 0;
    for (const r of this.sceneManager.stations.ramps) {
      if (x >= r.minX && x <= r.maxX && z <= r.zStart && z >= r.zEnd) {
        const t = (r.zStart - z) / (r.zStart - r.zEnd);
        const rh = r.yStart + t * (r.yEnd - r.yStart);
        if (rh > h) h = rh;
      }
    }
    return h;
  }

  /**
   * O(1) Uint8Array pyramid occupancy check at world coordinates (wx, wy, wz)
   */
  isSolidPyramidAt(wx, wy, wz) {
    if (wy < 0) return false;
    const y = Math.floor(wy / BLOCK_SIZE);
    if (y < 0 || y >= PYRAMID_LAYERS) return false;
    const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
    const gx = Math.floor(wx / BLOCK_SIZE + halfSpan);
    const gz = Math.floor(wz / BLOCK_SIZE + halfSpan);
    return this.pyramid.isOccupied(gx, y, gz);
  }

  /**
   * Checks if player cylinder at (px, footY, pz) collides with any placed pyramid block
   * or static station (quarry cliff, carving bench). Runs strictly in O(1) time.
   */
  _collidesAt(px, footY, pz, radius) {
    // 1. Static station AABBs (quarry cliff & carving bench)
    const qb = this.sceneManager.stations.quarry.bounds;
    if (
      px + radius > qb.minX && px - radius < qb.maxX &&
      pz + radius > qb.minZ && pz - radius < qb.maxZ &&
      footY < qb.maxY
    ) {
      return true;
    }

    const bb = this.sceneManager.stations.bench.bounds;
    if (
      px + radius > bb.minX && px - radius < bb.maxX &&
      pz + radius > bb.minZ && pz - radius < bb.maxZ &&
      footY < bb.maxY
    ) {
      return true;
    }

    // 2. O(1) Uint8Array check against the 144-layer pyramid grid
    const minY = Math.max(0, Math.floor((footY + 0.08) / BLOCK_SIZE));
    const maxY = Math.min(PYRAMID_LAYERS - 1, Math.floor((footY + this.player.height - 0.08) / BLOCK_SIZE));

    for (let y = minY; y <= maxY; y++) {
      const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
      const minGx = Math.floor((px - radius) / BLOCK_SIZE + halfSpan);
      const maxGx = Math.floor((px + radius) / BLOCK_SIZE + halfSpan);
      const minGz = Math.floor((pz - radius) / BLOCK_SIZE + halfSpan);
      const maxGz = Math.floor((pz + radius) / BLOCK_SIZE + halfSpan);

      for (let gz = minGz; gz <= maxGz; gz++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          if (this.pyramid.isOccupied(gx, y, gz)) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Finds the highest walkable support Y directly under the player footprint at (px, pz)
   * starting from at most maxStepUp above currentFootY. O(1) lookup!
   */
  _getSupportHeight(px, pz, currentFootY) {
    let supportY = this.getRampHeightAt(px, pz);
    const r = this.player.radius * 0.78;
    const maxLayer = Math.min(
      PYRAMID_LAYERS - 1,
      Math.floor((currentFootY + 0.35) / BLOCK_SIZE)
    );
    const minLayer = Math.max(0, maxLayer - 2);

    for (let y = maxLayer; y >= minLayer; y--) {
      const blockTop = (y + 1) * BLOCK_SIZE;
      if (blockTop <= supportY) break;
      const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
      const minGx = Math.floor((px - r) / BLOCK_SIZE + halfSpan);
      const maxGx = Math.floor((px + r) / BLOCK_SIZE + halfSpan);
      const minGz = Math.floor((pz - r) / BLOCK_SIZE + halfSpan);
      const maxGz = Math.floor((pz + r) / BLOCK_SIZE + halfSpan);

      let found = false;
      for (let gz = minGz; gz <= maxGz && !found; gz++) {
        for (let gx = minGx; gx <= maxGx; gx++) {
          if (this.pyramid.isOccupied(gx, y, gz)) {
            supportY = Math.max(supportY, blockTop);
            found = true;
            break;
          }
        }
      }
      if (found) break;
    }
    return supportY;
  }

  /**
   * Main fixed-step physics update: player movement + O(1) pyramid collision + 1-block auto-step,
   * rigid-body falling quarry rocks, medieval-cart wet-sand sled towing, and particles.
   */
  update(dt, moveForward, moveRight, wantsJump = false) {
    const clampedDt = Math.min(dt, 0.05);

    this._updatePlayer(clampedDt, moveForward, moveRight, wantsJump);
    this._updateSled(clampedDt);
    this._updateQuarryRocks(clampedDt);
    this._updateParticles(clampedDt);
    this._updateWetDecals(clampedDt);
  }

  _updatePlayer(dt, moveForward, moveRight, wantsJump) {
    const p = this.player;

    // Base speed; wet-sand sled towing applies realistic heavy inertia & water-jar glide speed!
    let maxSpeed = 6.8;
    if (this.sled.isTowed) {
      const loadRatio = this.sled.blocksCount / Math.max(1, this.sled.maxCapacity);
      const weightFactor = 1.0 - loadRatio * 0.24;
      maxSpeed = 4.5 * weightFactor * this.sled.speedBoost;
    }

    // Convert joystick/WASD local input to world XZ vector based on player yaw
    const sinY = Math.sin(p.yaw);
    const cosY = Math.cos(p.yaw);
    // yaw = 0 faces -Z: forward = (-sinY, -cosY), right = (cosY, -sinY)
    let wishX = -sinY * moveForward + cosY * moveRight;
    let wishZ = -cosY * moveForward - sinY * moveRight;
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 1) {
      wishX /= wishLen;
      wishZ /= wishLen;
    }

    const accel = this.sled.isTowed ? 6.5 : 16.0;
    const damping = this.sled.isTowed ? 5.2 : 11.0;

    if (wishLen > 0.02) {
      p.velocity.x += (wishX * maxSpeed - p.velocity.x) * Math.min(1, accel * dt);
      p.velocity.z += (wishZ * maxSpeed - p.velocity.z) * Math.min(1, accel * dt);
    } else {
      const f = Math.exp(-damping * dt);
      p.velocity.x *= f;
      p.velocity.z *= f;
    }

    // Optional light hop when not pulling the sled
    if (wantsJump && p.grounded && !this.sled.isTowed) {
      p.velocity.y = 7.4;
      p.grounded = false;
    }

    // Apply gravity
    p.velocity.y += GRAVITY * dt;

    // Horizontal movement with O(1) grid AABB collision + 1-block auto-step!
    const stepHeight = BLOCK_SIZE + 0.14; // allows climbing 1.5m pyramid layers automatically like giant stairs!
    const tryMoveAxis = (dx, dz) => {
      const nx = p.position.x + dx;
      const nz = p.position.z + dz;

      // Stay inside the playable Giza plateau bounds
      if (nx < -130 || nx > 142 || nz < -130 || nz > 152) return;

      // Check ramp elevation at destination first
      const rampY = this.getRampHeightAt(nx, nz);
      const testY = Math.max(p.position.y, rampY);

      if (!this._collidesAt(nx, testY, nz, p.radius)) {
        p.position.x = nx;
        p.position.z = nz;
        if (rampY > p.position.y && rampY - p.position.y <= 0.65) {
          p.position.y = rampY;
        }
        return;
      }

      // 1-block auto-step: if walking into a single placed layer (1.5m high) and space above is clear!
      if (p.grounded && !this.sled.isTowed) {
        const targetStepY = Math.floor((p.position.y + 0.1) / BLOCK_SIZE + 1) * BLOCK_SIZE;
        if (
          targetStepY - p.position.y <= stepHeight &&
          !this._collidesAt(nx, targetStepY, nz, p.radius)
        ) {
          p.position.x = nx;
          p.position.z = nz;
          p.position.y = targetStepY;
          p.velocity.y = 0;
          return;
        }
      }

      // Blocked along this axis
      if (dx !== 0) p.velocity.x = 0;
      if (dz !== 0) p.velocity.z = 0;
    };

    tryMoveAxis(p.velocity.x * dt, 0);
    tryMoveAxis(0, p.velocity.z * dt);

    // Vertical integration & ground/pyramid top support
    const prevY = p.position.y;
    p.position.y += p.velocity.y * dt;

    const supportY = this._getSupportHeight(p.position.x, p.position.z, prevY);
    if (p.position.y <= supportY) {
      p.position.y = supportY;
      p.velocity.y = 0;
      p.grounded = true;
    } else {
      p.grounded = false;
    }

    // Smooth visual Y interpolation so 1-block auto-step climbs feel buttery-smooth (zero jarring pop)
    p.visualY += (p.position.y - p.visualY) * Math.min(1, dt * 14);
  }

  /**
   * Medieval-cart-style spring-damped tow-bar / hinge physics for the Wet-Sand Wooden Sled.
   * Pivots around rear runners with heavy inertia, turning lag, ramp climbing,
   * sand-ripple tilt, and dark glistening wet-sand trail!
   */
  _updateSled(dt) {
    const s = this.sled;
    const p = this.player;

    // Forward unit vector of sled in XZ (local +Z is sled front!)
    const fwdX = Math.sin(s.yaw);
    const fwdZ = Math.cos(s.yaw);
    const rightX = Math.cos(s.yaw);
    const rightZ = -Math.sin(s.yaw);

    if (s.isTowed) {
      s.attachT = Math.min(1, s.attachT + dt / 0.3);

      // Front hitch world position (+1.65m ahead of sled center)
      const hitchX = s.position.x + fwdX * 1.65;
      const hitchZ = s.position.z + fwdZ * 1.65;

      // Vector from sled hitch to player hands
      const toPX = p.position.x - hitchX;
      const toPZ = p.position.z - hitchZ;
      const dist = Math.hypot(toPX, toPZ);
      const restLen = 1.65;

      // Spring-damped tow-bar pull force when taut (dist > restLen)
      const stretch = dist - restLen;
      if (dist > 0.05) {
        const dirX = toPX / dist;
        const dirZ = toPZ / dist;

        // Desired yaw toward player with medieval wooden-cart turning lag (pivots around rear runners!)
        const targetYaw = Math.atan2(p.position.x - s.position.x, p.position.z - s.position.z);
        let yawErr = targetYaw - s.yaw;
        while (yawErr > Math.PI) yawErr -= Math.PI * 2;
        while (yawErr < -Math.PI) yawErr += Math.PI * 2;

        // Heavy rotational inertia: torque scales with pull tension & speed
        const kAng = 6.8;
        const cAng = 4.6;
        s.angularVel += (yawErr * kAng - s.angularVel * cAng) * dt;
        s.yaw += s.angularVel * dt;

        if (stretch > 0) {
          const pullForce = Math.min(28, stretch * 17.5);
          s.velocity.x += dirX * pullForce * dt;
          s.velocity.z += dirZ * pullForce * dt;
        }

        // Prevent player from stretching infinitely away from the heavy sled ropes
        const maxRope = 3.1;
        if (dist > maxRope) {
          const excess = dist - maxRope;
          p.position.x -= dirX * excess * 0.55;
          p.position.z -= dirZ * excess * 0.55;
        }
      }
    } else {
      s.attachT = Math.max(0, s.attachT - dt / 0.25);
      // Natural angular deceleration on release
      s.angularVel *= Math.exp(-6.5 * dt);
      s.yaw += s.angularVel * dt;
    }

    // Decompose sled velocity into forward & lateral components for authentic runner tracking!
    const vFwd = s.velocity.x * fwdX + s.velocity.z * fwdZ;
    const vLat = s.velocity.x * rightX + s.velocity.z * rightZ;

    // Wet sand cuts forward runner drag dramatically while towed; dry sand brakes smoothly on release
    const fwdFriction = s.isTowed ? 2.4 : 5.4;
    const latFriction = 11.5; // strong lateral runner grip prevents cart drifting sideways

    const newVFwd = vFwd * Math.exp(-fwdFriction * dt);
    const newVLat = vLat * Math.exp(-latFriction * dt);

    s.velocity.x = fwdX * newVFwd + rightX * newVLat;
    s.velocity.z = fwdZ * newVFwd + rightZ * newVLat;

    // Integrate sled position with world bounds & quarry/bench avoidance
    const nextX = s.position.x + s.velocity.x * dt;
    const nextZ = s.position.z + s.velocity.z * dt;
    const qb = this.sceneManager.stations.quarry.bounds;
    const bb = this.sceneManager.stations.bench.bounds;
    const hitsQuarry = nextX > qb.minX - 1.4 && nextX < qb.maxX + 1.4 && nextZ > qb.minZ - 1.4 && nextZ < qb.maxZ + 1.4;
    const hitsBench = nextX > bb.minX - 1.3 && nextX < bb.maxX + 1.3 && nextZ > bb.minZ - 1.3 && nextZ < bb.maxZ + 1.3;

    if (!hitsQuarry && !hitsBench && nextX > -126 && nextX < 136 && nextZ > -126 && nextZ < 146) {
      s.position.x = nextX;
      s.position.z = nextZ;
    } else {
      s.velocity.multiplyScalar(0.2);
    }

    // Elevation on wooden ramps or placed pyramid terraces + gentle pitch/roll over sand ripples
    const frontY = this._getSledGroundAt(s.position.x + fwdX * 1.4, s.position.z + fwdZ * 1.4);
    const rearY = this._getSledGroundAt(s.position.x - fwdX * 1.4, s.position.z - fwdZ * 1.4);
    const midY = (frontY + rearY) * 0.5;
    s.position.y += (midY - s.position.y) * Math.min(1, dt * 10);

    const speed = Math.hypot(s.velocity.x, s.velocity.z);
    const slopePitch = -Math.atan2(frontY - rearY, 2.8);
    const ripplePitch = Math.sin(s.position.x * 0.9 + s.position.z * 0.8) * 0.025 * Math.min(1, speed);
    const rippleRoll = Math.cos(s.position.x * 0.7 - s.position.z * 1.1) * 0.03 * Math.min(1, speed) - s.angularVel * 0.05;

    s.pitch += (slopePitch + ripplePitch - s.pitch) * Math.min(1, dt * 8);
    s.roll += (rippleRoll - s.roll) * Math.min(1, dt * 8);

    // Update sled 3D transform
    s.group.position.copy(s.position);
    s.group.rotation.order = 'YXZ';
    s.group.rotation.y = s.yaw;
    s.group.rotation.x = s.pitch;
    s.group.rotation.z = s.roll;

    // Wet-sand water jar pouring & glistening wet-sand trail while moving!
    const pouring = s.isTowed && speed > 0.35;
    s.waterStreamMesh.visible = pouring;
    if (pouring) {
      s.waterStreamMesh.scale.y = 0.85 + Math.sin(this.sceneManager.elapsed * 22) * 0.16;
      this.wetTrailCooldown -= dt;
      if (this.wetTrailCooldown <= 0) {
        this.wetTrailCooldown = 0.16;
        this._spawnWetSandDecal(
          s.position.x + fwdX * 1.9,
          s.position.y + 0.035,
          s.position.z + fwdZ * 1.9,
          s.yaw
        );
        this.spawnParticles(
          this._tmpV1.set(s.position.x + fwdX * 2.05, s.position.y + 0.12, s.position.z + fwdZ * 2.05),
          2,
          0x78d5f5,
          1.1,
          -12,
          0.32,
          0.6
        );
        this.audio.playWaterSplash();
      }
    }

    // Update visible taut hemp tow ropes between sled prow and player hands
    if (s.isTowed && s.attachT > 0.05) {
      const handY = p.visualY + 1.02;
      const pRightX = Math.cos(p.yaw);
      const pRightZ = -Math.sin(p.yaw);

      this._positionRope(
        s.ropeLeft,
        s.position.x + fwdX * 1.62 - rightX * 0.65, s.position.y + 0.44, s.position.z + fwdZ * 1.62 - rightZ * 0.65,
        p.position.x - pRightX * 0.28, handY, p.position.z - pRightZ * 0.28
      );
      this._positionRope(
        s.ropeRight,
        s.position.x + fwdX * 1.62 + rightX * 0.65, s.position.y + 0.44, s.position.z + fwdZ * 1.62 + rightZ * 0.65,
        p.position.x + pRightX * 0.28, handY, p.position.z + pRightZ * 0.28
      );
      s.ropeLeft.visible = true;
      s.ropeRight.visible = true;
    } else {
      s.ropeLeft.visible = false;
      s.ropeRight.visible = false;
    }
  }

  _positionRope(mesh, x1, y1, z1, x2, y2, z2) {
    this._tmpV1.set(x1, y1, z1);
    this._tmpV2.set(x2, y2, z2);
    const len = this._tmpV1.distanceTo(this._tmpV2);
    mesh.position.lerpVectors(this._tmpV1, this._tmpV2, 0.5);
    mesh.scale.set(1, 1, Math.max(0.05, len));
    mesh.lookAt(this._tmpV2);
  }

  _getSledGroundAt(x, z) {
    let h = this.getRampHeightAt(x, z);
    // Check if sled is on top of placed pyramid blocks (up to 3 layers above current sled Y)
    const maxY = Math.min(PYRAMID_LAYERS - 1, Math.floor((this.sled.position.y + 0.9) / BLOCK_SIZE));
    for (let y = maxY; y >= 0; y--) {
      const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
      const gx = Math.floor(x / BLOCK_SIZE + halfSpan);
      const gz = Math.floor(z / BLOCK_SIZE + halfSpan);
      if (this.pyramid.isOccupied(gx, y, gz)) {
        h = Math.max(h, (y + 1) * BLOCK_SIZE);
        break;
      }
    }
    return h;
  }

  _spawnWetSandDecal(x, y, z, yaw) {
    const d = this.wetDecals[this.wetDecalCursor];
    this.wetDecalCursor = (this.wetDecalCursor + 1) % MAX_WET_DECALS;
    d.active = true;
    d.age = 0;
    d.mesh.position.set(x, y, z);
    d.mesh.rotation.y = yaw;
    d.mesh.material.opacity = 0.62;
    d.mesh.visible = true;
  }

  _updateWetDecals(dt) {
    for (const d of this.wetDecals) {
      if (!d.active) continue;
      d.age += dt;
      if (d.age >= d.maxAge) {
        d.active = false;
        d.mesh.visible = false;
      } else {
        const remain = 1 - d.age / d.maxAge;
        d.mesh.material.opacity = 0.62 * remain * remain;
      }
    }
  }

  _updateQuarryRocks(dt) {
    const cliffEdgeX = this.sceneManager.stations.quarry.bounds.maxX;

    for (let i = 0; i < this.quarryRocks.length; i++) {
      const r = this.quarryRocks[i];
      if (!r.active) continue;
      r.age += dt;

      if (!r.settled) {
        r.vel.y += GRAVITY * dt;
        r.pos.addScaledVector(r.vel, dt);

        // Mid-air tumbling rotation
        r.mesh.rotation.x += r.angVel.x * dt;
        r.mesh.rotation.y += r.angVel.y * dt;
        r.mesh.rotation.z += r.angVel.z * dt;

        // Bounce off quarry cliff ledges
        if (r.pos.x - r.radius < cliffEdgeX && r.pos.y > 0.9) {
          r.pos.x = cliffEdgeX + r.radius;
          r.vel.x = Math.abs(r.vel.x) * 0.55 + 0.6;
          this.audio.playRockClack(0.5);
        }

        // Bounce off desert sand floor with dust puffs & tumbling rock clacks!
        if (r.pos.y <= r.radius) {
          r.pos.y = r.radius;
          const impact = Math.abs(r.vel.y);
          if (impact > 1.35) {
            r.vel.y = impact * 0.36;
            r.vel.x *= 0.72;
            r.vel.z *= 0.72;
            r.angVel.multiplyScalar(0.68);
            this.audio.playRockClack(Math.min(1, impact / 8));
            this.spawnParticles(r.pos, 3, 0xe4c287, 1.5, -7.0, 0.38, 0.75);
          } else {
            r.vel.y = 0;
            r.vel.x *= Math.exp(-9 * dt);
            r.vel.z *= Math.exp(-9 * dt);
            r.angVel.multiplyScalar(Math.exp(-10 * dt));
            if (Math.hypot(r.vel.x, r.vel.z) < 0.08) {
              r.settled = true;
            }
          }
        }

        // Soft rock-on-rock pile separation so fallen rocks form a physical heap
        for (let j = i + 1; j < this.quarryRocks.length; j++) {
          const o = this.quarryRocks[j];
          if (!o.active) continue;
          const dx = r.pos.x - o.pos.x;
          const dy = r.pos.y - o.pos.y;
          const dz = r.pos.z - o.pos.z;
          const minD = r.radius + o.radius;
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 > 0.0001 && d2 < minD * minD) {
            const d = Math.sqrt(d2);
            const overlap = (minD - d) * 0.5;
            const nx = dx / d;
            const ny = dy / d;
            const nz = dz / d;
            r.pos.x += nx * overlap;
            r.pos.y = Math.max(r.radius, r.pos.y + ny * overlap);
            r.pos.z += nz * overlap;
            if (!o.settled) {
              o.pos.x -= nx * overlap;
              o.pos.y = Math.max(o.radius, o.pos.y - ny * overlap);
              o.pos.z -= nz * overlap;
            }
          }
        }

        r.mesh.position.copy(r.pos);
      }
    }
  }

  _updateParticles(dt) {
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      if (p.pos.y < 0.05) {
        p.pos.y = 0.05;
        p.vel.y *= -0.2;
      }
      const frac = p.life / p.maxLife;
      p.mesh.position.copy(p.pos);
      p.mesh.scale.setScalar(p.baseScale * frac);
      p.mesh.material.opacity = 0.85 * frac;
    }
  }
}
