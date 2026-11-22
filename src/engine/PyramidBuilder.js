import * as THREE from 'three';

export const PYRAMID_LAYERS = 144;
export const BLOCK_SIZE = 1.5;
export const TOTAL_BLOCKS = 1005840; // sum_{k=1..144} k^2 = 144 * 145 * 289 / 6
export const APEX_INSTANCE_ID = TOTAL_BLOCKS - 1;

/**
 * Generates a soft beveled / rounded-edge sandstone block BufferGeometry.
 * Uses 24 corner-chamfered vertices (44 triangles) with guaranteed outward winding
 * so sunlight softly catches every beveled edge like weathered Giza limestone.
 */
export function createBeveledBlockGeometry(size = 1.485, bevel = 0.13) {
  const h = size * 0.5;
  const b = h - bevel;

  const positions = [];
  const uvs = [];
  const indices = [];

  // Helper to push a quad or tri guaranteed to face outward along expectedNormal
  const vMap = new Map();
  const addVert = (x, y, z) => {
    const key = `${x.toFixed(4)},${y.toFixed(4)},${z.toFixed(4)}`;
    if (vMap.has(key)) return vMap.get(key);
    const idx = positions.length / 3;
    positions.push(x, y, z);
    // Triplanar-ish UV mapping so sandstone grain wraps seamlessly
    const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
    let u = 0, v = 0;
    if (ay >= ax && ay >= az) {
      u = (x / size) + 0.5;
      v = (z / size) + 0.5;
    } else if (ax >= ay && ax >= az) {
      u = (z / size) + 0.5;
      v = (y / size) + 0.5;
    } else {
      u = (x / size) + 0.5;
      v = (y / size) + 0.5;
    }
    uvs.push(u, v);
    vMap.set(key, idx);
    return idx;
  };

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  const expected = new THREE.Vector3();

  const addTri = (p0, p1, p2, nx, ny, nz) => {
    const i0 = addVert(p0[0], p0[1], p0[2]);
    const i1 = addVert(p1[0], p1[1], p1[2]);
    const i2 = addVert(p2[0], p2[1], p2[2]);
    vA.set(p0[0], p0[1], p0[2]);
    vB.set(p1[0], p1[1], p1[2]);
    vC.set(p2[0], p2[1], p2[2]);
    ab.subVectors(vB, vA);
    ac.subVectors(vC, vA);
    cross.crossVectors(ab, ac);
    expected.set(nx, ny, nz);
    if (cross.dot(expected) >= 0) {
      indices.push(i0, i1, i2);
    } else {
      indices.push(i0, i2, i1);
    }
  };

  const addQuad = (p0, p1, p2, p3, nx, ny, nz) => {
    addTri(p0, p1, p2, nx, ny, nz);
    addTri(p0, p2, p3, nx, ny, nz);
  };

  // 6 Main Faces
  for (const s of [-1, 1]) {
    // +/- X faces
    addQuad([s * h, -b, -b], [s * h, b, -b], [s * h, b, b], [s * h, -b, b], s, 0, 0);
    // +/- Y faces
    addQuad([-b, s * h, -b], [b, s * h, -b], [b, s * h, b], [-b, s * h, b], 0, s, 0);
    // +/- Z faces
    addQuad([-b, -b, s * h], [b, -b, s * h], [b, b, s * h], [-b, b, s * h], 0, 0, s);
  }

  // 12 Beveled Edge Strips
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      // Edges parallel to Z
      addQuad(
        [sx * h, sy * b, -b], [sx * h, sy * b, b],
        [sx * b, sy * h, b], [sx * b, sy * h, -b],
        sx, sy, 0
      );
    }
    for (const sz of [-1, 1]) {
      // Edges parallel to Y
      addQuad(
        [sx * h, -b, sz * b], [sx * h, b, sz * b],
        [sx * b, b, sz * h], [sx * b, -b, sz * h],
        sx, 0, sz
      );
    }
  }
  for (const sy of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Edges parallel to X
      addQuad(
        [-b, sy * h, sz * b], [b, sy * h, sz * b],
        [b, sy * b, sz * h], [-b, sy * b, sz * h],
        0, sy, sz
      );
    }
  }

  // 8 Corner Bevel Triangles
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        addTri(
          [sx * h, sy * b, sz * b],
          [sx * b, sy * h, sz * b],
          [sx * b, sy * b, sz * h],
          sx, sy, sz
        );
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/**
 * Generates a soft sand-yellow procedural matte sandstone CanvasTexture
 * (#EED296 to #E5C17B, subtle warm grain, soft bevel highlight, zero harsh cracks).
 */
export function createSandstoneTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Warm sand-yellow base gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#F1D69C');
  grad.addColorStop(0.5, '#EED296');
  grad.addColorStop(1, '#E5C17B');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  // Subtle horizontal sedimentary warmth bands
  for (let y = 0; y < size; y += 3) {
    const wave = Math.sin(y * 0.08) * 0.5 + 0.5;
    ctx.fillStyle = wave > 0.5
      ? `rgba(255, 241, 206, ${0.03 + wave * 0.04})`
      : `rgba(196, 150, 82, ${0.03 + (1 - wave) * 0.045})`;
    ctx.fillRect(0, y, size, 3);
  }

  // Fine mineral grain speckles (no harsh cracks)
  const imgData = ctx.getImageData(0, 0, size, size);
  const d = imgData.data;
  let seed = 13379;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 14;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n * 0.92));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n * 0.72));
  }
  ctx.putImageData(imgData, 0, 0);

  // Gentle sunlit edge highlight & soft inner shade
  ctx.strokeStyle = 'rgba(255, 246, 218, 0.25)';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, size - 10, size - 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Procedural metallic gold texture with engraved Egyptian cartouche & hieroglyphs
 * for the gleaming Layer-144 Golden Pyramidion capstone.
 */
function createPyramidionTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, size);
  g.addColorStop(0, '#FFF1A8');
  g.addColorStop(0.35, '#F5C84B');
  g.addColorStop(0.8, '#D79A28');
  g.addColorStop(1, '#B87A19');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // Engraved cartouche oval in center
  ctx.strokeStyle = '#8F5B10';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(size * 0.34, size * 0.24, size * 0.32, size * 0.48, 36);
  ctx.stroke();

  // Horizontal hieroglyphic register band at bottom
  ctx.fillStyle = 'rgba(138, 86, 12, 0.35)';
  ctx.fillRect(12, size * 0.78, size - 24, 4);
  ctx.fillRect(12, size * 0.92, size - 24, 4);

  // Stylized golden-brown glyphs
  ctx.fillStyle = '#7E4E0D';
  ctx.font = 'bold 24px serif';
  ctx.textAlign = 'center';
  ctx.fillText('𓂀 𓋹 𓆣', size * 0.5, size * 0.44);
  ctx.fillText('𓇳 𓏤 𓊹', size * 0.5, size * 0.60);
  ctx.font = 'bold 16px serif';
  ctx.fillText('𓄿 𓇋 𓂝 𓅱 𓃀 𓊪 𓆑 𓅓 𓈖 𓂋', size * 0.5, size * 0.88);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export class PyramidBuilder {
  constructor(scene) {
    this.scene = scene;
    this.layers = PYRAMID_LAYERS;
    this.blockSize = BLOCK_SIZE;
    this.totalBlocks = TOTAL_BLOCKS;

    // Flat O(1) occupancy grid: 144 * 144 * 144 = 2,985,984 bytes (~2.85 MB)
    this.grid = new Uint8Array(PYRAMID_LAYERS * PYRAMID_LAYERS * PYRAMID_LAYERS);

    // Precompute layer offsets for dense instanceId in [0, 1005839]
    this.layerOffsets = new Int32Array(PYRAMID_LAYERS);
    this.layerCounts = new Int32Array(PYRAMID_LAYERS);
    let offset = 0;
    for (let y = 0; y < PYRAMID_LAYERS; y++) {
      this.layerOffsets[y] = offset;
      const side = PYRAMID_LAYERS - y;
      offset += side * side;
    }

    // Active compacted slot maps (allows 1 single InstancedMesh with 1,005,840 capacity
    // while drawing ONLY active placed blocks for locked 60 FPS on mobile WebGL)
    this.idToSlot = new Int32Array(TOTAL_BLOCKS);
    this.idToSlot.fill(-1);
    this.slotToId = new Int32Array(TOTAL_BLOCKS);
    this.placedCount = 0;
    this.highestLayer = 0; // 1-indexed highest occupied layer (0 if empty)
    this.apexPlaced = false;

    // Shared scratch objects (zero per-frame allocations)
    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // Build shared beveled geometry & matte sandstone material
    this.blockGeometry = createBeveledBlockGeometry(BLOCK_SIZE - 0.018, 0.135);
    this.sandstoneTexture = createSandstoneTexture();
    this.blockMaterial = new THREE.MeshStandardMaterial({
      map: this.sandstoneTexture,
      roughness: 0.84,
      metalness: 0.03,
      color: 0xffffff
    });

    // ONE SINGLE InstancedMesh allocated for all 1,005,840 pyramid blocks
    this.instancedMesh = new THREE.InstancedMesh(
      this.blockGeometry,
      this.blockMaterial,
      TOTAL_BLOCKS
    );
    this.instancedMesh.name = 'PharaohMonolithInstancedMesh';
    this.instancedMesh.castShadow = true;
    this.instancedMesh.receiveShadow = true;
    this.instancedMesh.frustumCulled = false;

    // Initialize all 1,005,840 instance matrices to scale (0, 0, 0)
    // (Filling the underlying Float32Array directly is instant: ~12ms instead of 400ms!)
    this.instancedMesh.instanceMatrix.array.fill(0);
    const matArr = this.instancedMesh.instanceMatrix.array;
    for (let i = 0; i < TOTAL_BLOCKS; i++) {
      matArr[i * 16 + 15] = 1; // valid homogeneous w=1 with 0 scale
    }
    this.instancedMesh.instanceMatrix.needsUpdate = true;

    // Pre-allocate instanceColor buffer for subtle natural limestone hue variety
    const colorArr = new Float32Array(TOTAL_BLOCKS * 3);
    colorArr.fill(1);
    this.instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(colorArr, 3);
    this.instancedMesh.count = 0; // Compact active draw count (grows up to 1,005,840)

    this.scene.add(this.instancedMesh);

    // Gleaming metallic gold Pyramidion capstone at Layer 144 apex
    this._buildApexPyramidion();

    // Subtle limestone base curb & golden architect chalk lines showing the 144x144 footprint
    this._buildFoundationMarkers();
  }

  _buildApexPyramidion() {
    const pyrGeo = new THREE.ConeGeometry(BLOCK_SIZE * 0.72, BLOCK_SIZE * 1.15, 4);
    pyrGeo.rotateY(Math.PI * 0.25);
    const pyrTex = createPyramidionTexture();
    const pyrMat = new THREE.MeshStandardMaterial({
      map: pyrTex,
      color: 0xffd75e,
      metalness: 0.88,
      roughness: 0.2,
      emissive: 0x6b4508,
      emissiveIntensity: 0.25
    });
    this.pyramidionMesh = new THREE.Mesh(pyrGeo, pyrMat);
    this.pyramidionMesh.position.set(0, (PYRAMID_LAYERS - 1 + 0.56) * BLOCK_SIZE, 0);
    this.pyramidionMesh.castShadow = true;
    this.pyramidionMesh.visible = false;
    this.scene.add(this.pyramidionMesh);
  }

  _buildFoundationMarkers() {
    const group = new THREE.Group();
    const half = (PYRAMID_LAYERS * BLOCK_SIZE) * 0.5; // 108m

    // Golden architect survey line marking the 144x144 (216m x 216m) perimeter
    const borderPts = [
      new THREE.Vector3(-half, 0.04, -half),
      new THREE.Vector3(half, 0.04, -half),
      new THREE.Vector3(half, 0.04, half),
      new THREE.Vector3(-half, 0.04, half),
      new THREE.Vector3(-half, 0.04, -half)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xd99b2e,
      transparent: true,
      opacity: 0.75
    });
    group.add(new THREE.Line(lineGeo, lineMat));

    // Inner grid guide lines near the South construction entrance so players see exact 1.5m slots
    const gridPts = [];
    const guideStartX = -15 * BLOCK_SIZE;
    const guideEndX = 15 * BLOCK_SIZE;
    const guideStartZ = half - 14 * BLOCK_SIZE;
    const guideEndZ = half;
    for (let x = guideStartX; x <= guideEndX + 0.01; x += BLOCK_SIZE) {
      gridPts.push(new THREE.Vector3(x, 0.03, guideStartZ), new THREE.Vector3(x, 0.03, guideEndZ));
    }
    for (let z = guideStartZ; z <= guideEndZ + 0.01; z += BLOCK_SIZE) {
      gridPts.push(new THREE.Vector3(guideStartX, 0.03, z), new THREE.Vector3(guideEndX, 0.03, z));
    }
    const subGridGeo = new THREE.BufferGeometry().setFromPoints(gridPts);
    const subGridMat = new THREE.LineBasicMaterial({
      color: 0xe7b95a,
      transparent: true,
      opacity: 0.32
    });
    group.add(new THREE.LineSegments(subGridGeo, subGridMat));

    // Four carved sandstone corner boundary obelisks outside the corners
    const obGeo = new THREE.CylinderGeometry(0.28, 0.52, 3.6, 4);
    obGeo.rotateY(Math.PI * 0.25);
    const obMat = new THREE.MeshStandardMaterial({
      map: this.sandstoneTexture,
      roughness: 0.82
    });
    const capGeo = new THREE.ConeGeometry(0.32, 0.65, 4);
    capGeo.rotateY(Math.PI * 0.25);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0xf4c44e,
      metalness: 0.75,
      roughness: 0.28
    });

    const corners = [
      [-half - 1.4, -half - 1.4],
      [half + 1.4, -half - 1.4],
      [half + 1.4, half + 1.4],
      [-half - 1.4, half + 1.4]
    ];
    for (const [cx, cz] of corners) {
      const ob = new THREE.Mesh(obGeo, obMat);
      ob.position.set(cx, 1.8, cz);
      ob.castShadow = true;
      ob.receiveShadow = true;
      group.add(ob);

      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(cx, 3.9, cz);
      group.add(cap);
    }

    this.foundationGroup = group;
    this.scene.add(group);
  }

  /** Checks if (gx, y, gz) is inside the valid 144-layer stepped pyramid volume */
  isValidCell(gx, y, gz) {
    if (y < 0 || y >= PYRAMID_LAYERS) return false;
    const side = PYRAMID_LAYERS - y;
    return gx >= 0 && gx < side && gz >= 0 && gz < side;
  }

  /** Flat Uint8Array index for O(1) collision & occupancy */
  gridIndex(gx, y, gz) {
    return (y * PYRAMID_LAYERS + gz) * PYRAMID_LAYERS + gx;
  }

  /** Dense instanceId in [0, 1005839] */
  cellToInstanceId(gx, y, gz) {
    const side = PYRAMID_LAYERS - y;
    return this.layerOffsets[y] + gz * side + gx;
  }

  /** Inverse mapping from dense instanceId -> { gx, y, gz } */
  instanceIdToCell(id) {
    // Binary search layerOffsets (at most 8 iterations for 144 layers)
    let lo = 0;
    let hi = PYRAMID_LAYERS - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.layerOffsets[mid] <= id) lo = mid;
      else hi = mid - 1;
    }
    const y = lo;
    const rem = id - this.layerOffsets[y];
    const side = PYRAMID_LAYERS - y;
    const gz = Math.floor(rem / side);
    const gx = rem - gz * side;
    return { gx, y, gz };
  }

  /** O(1) occupancy check */
  isOccupied(gx, y, gz) {
    if (!this.isValidCell(gx, y, gz)) return false;
    return this.grid[(y * PYRAMID_LAYERS + gz) * PYRAMID_LAYERS + gx] === 1;
  }

  /** Convert pyramid cell (gx, y, gz) -> world center coordinates */
  cellToWorld(gx, y, gz, out = new THREE.Vector3()) {
    const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
    out.set(
      (gx - halfSpan + 0.5) * BLOCK_SIZE,
      (y + 0.5) * BLOCK_SIZE,
      (gz - halfSpan + 0.5) * BLOCK_SIZE
    );
    return out;
  }

  /** Convert world point (wx, wy, wz) -> pyramid cell { gx, y, gz } */
  worldToCell(wx, wy, wz) {
    const y = Math.floor(wy / BLOCK_SIZE);
    const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
    const gx = Math.floor(wx / BLOCK_SIZE + halfSpan);
    const gz = Math.floor(wz / BLOCK_SIZE + halfSpan);
    return { gx, y, gz };
  }

  /** Deterministic subtle warm limestone tint per block coordinate */
  _tintForCell(gx, y, gz, outColor) {
    const h = ((gx * 73856093) ^ (y * 19349663) ^ (gz * 83492791)) >>> 0;
    const t = (h % 1000) / 1000;
    // Soft sand-yellow limestone variations (#F7E2AF to #E2BE78)
    const r = 0.94 + t * 0.06;
    const g = 0.90 + t * 0.07;
    const b = 0.84 + t * 0.08;
    outColor.setRGB(r, g, b);
    return outColor;
  }

  /**
   * Place a block at (gx, y, gz) in O(1) time.
   * Returns true if newly placed, false if invalid or already occupied.
   */
  placeBlock(gx, y, gz, deferGpuUpload = false) {
    if (!this.isValidCell(gx, y, gz)) return false;
    const gIdx = this.gridIndex(gx, y, gz);
    if (this.grid[gIdx] === 1) return false;

    this.grid[gIdx] = 1;
    this.layerCounts[y]++;
    if (y + 1 > this.highestLayer) {
      this.highestLayer = y + 1;
    }

    const instId = this.cellToInstanceId(gx, y, gz);

    // Layer 144 apex (1,005,840th block) crowns the Golden Pyramidion
    if (instId === APEX_INSTANCE_ID) {
      this.apexPlaced = true;
      this.pyramidionMesh.visible = true;
    }

    const slot = this.placedCount++;
    this.idToSlot[instId] = slot;
    this.slotToId[slot] = instId;

    const halfSpan = (PYRAMID_LAYERS - y) * 0.5;
    this._dummy.position.set(
      (gx - halfSpan + 0.5) * BLOCK_SIZE,
      (y + 0.5) * BLOCK_SIZE,
      (gz - halfSpan + 0.5) * BLOCK_SIZE
    );
    this._dummy.rotation.set(0, 0, 0);
    // Hide underlying sandstone cube at apex so golden pyramidion shines cleanly
    if (instId === APEX_INSTANCE_ID) {
      this._dummy.scale.set(0, 0, 0);
    } else {
      this._dummy.scale.set(1, 1, 1);
    }
    this._dummy.updateMatrix();
    this.instancedMesh.setMatrixAt(slot, this._dummy.matrix);

    this._tintForCell(gx, y, gz, this._color);
    this.instancedMesh.setColorAt(slot, this._color);
    this.instancedMesh.count = this.placedCount;

    if (!deferGpuUpload) {
      this._markSlotDirty(slot);
    }
    return true;
  }

  /**
   * Remove a placed block at (gx, y, gz) in O(1) time via swap-remove.
   */
  removeBlock(gx, y, gz) {
    if (!this.isValidCell(gx, y, gz)) return false;
    const gIdx = this.gridIndex(gx, y, gz);
    if (this.grid[gIdx] === 0) return false;

    this.grid[gIdx] = 0;
    this.layerCounts[y] = Math.max(0, this.layerCounts[y] - 1);

    const instId = this.cellToInstanceId(gx, y, gz);
    if (instId === APEX_INSTANCE_ID) {
      this.apexPlaced = false;
      this.pyramidionMesh.visible = false;
    }

    const slot = this.idToSlot[instId];
    const lastSlot = this.placedCount - 1;

    if (slot >= 0 && lastSlot >= 0) {
      if (slot !== lastSlot) {
        const movedId = this.slotToId[lastSlot];
        // Copy lastSlot matrix & color into freed slot
        const matArr = this.instancedMesh.instanceMatrix.array;
        const srcOff = lastSlot * 16;
        const dstOff = slot * 16;
        for (let k = 0; k < 16; k++) matArr[dstOff + k] = matArr[srcOff + k];

        const colArr = this.instancedMesh.instanceColor.array;
        colArr[slot * 3] = colArr[lastSlot * 3];
        colArr[slot * 3 + 1] = colArr[lastSlot * 3 + 1];
        colArr[slot * 3 + 2] = colArr[lastSlot * 3 + 2];

        this.slotToId[slot] = movedId;
        this.idToSlot[movedId] = slot;
        this._markSlotDirty(slot);
      }

      // Zero-scale freed tail slot
      this.instancedMesh.setMatrixAt(lastSlot, this._zeroMatrix);
      this._markSlotDirty(lastSlot);

      this.idToSlot[instId] = -1;
      this.placedCount = lastSlot;
      this.instancedMesh.count = this.placedCount;
    }

    // Recompute highestLayer if needed
    if (y + 1 === this.highestLayer && this.layerCounts[y] === 0) {
      let top = 0;
      for (let ly = y - 1; ly >= 0; ly--) {
        if (this.layerCounts[ly] > 0) {
          top = ly + 1;
          break;
        }
      }
      this.highestLayer = top;
    }
    return true;
  }

  _markSlotDirty(slot) {
    const im = this.instancedMesh.instanceMatrix;
    if (typeof im.addUpdateRange === 'function') {
      im.addUpdateRange(slot * 16, 16);
    }
    im.needsUpdate = true;

    const ic = this.instancedMesh.instanceColor;
    if (ic) {
      if (typeof ic.addUpdateRange === 'function') {
        ic.addUpdateRange(slot * 3, 3);
      }
      ic.needsUpdate = true;
    }
  }

  flushGpuBuffers() {
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    if (this.instancedMesh.instanceColor) {
      this.instancedMesh.instanceColor.needsUpdate = true;
    }
  }

  /** Clear all placed blocks (used on Reset Save) */
  clearAll() {
    this.grid.fill(0);
    this.layerCounts.fill(0);
    this.idToSlot.fill(-1);
    const matArr = this.instancedMesh.instanceMatrix.array;
    for (let i = 0; i < this.placedCount; i++) {
      const off = i * 16;
      for (let k = 0; k < 15; k++) matArr[off + k] = 0;
      matArr[off + 15] = 1;
    }
    this.placedCount = 0;
    this.highestLayer = 0;
    this.apexPlaced = false;
    this.pyramidionMesh.visible = false;
    this.instancedMesh.count = 0;
    this.flushGpuBuffers();
  }

  /**
   * Compact Run-Length Encoding (RLE) of all placed dense instanceIds
   * Returns an array of [startId, runLength] pairs for tiny localStorage saves.
   */
  serializePlacedBlocks() {
    if (this.placedCount === 0) return [];
    const activeIds = new Int32Array(this.placedCount);
    for (let i = 0; i < this.placedCount; i++) {
      activeIds[i] = this.slotToId[i];
    }
    activeIds.sort();

    const runs = [];
    let runStart = activeIds[0];
    let runLen = 1;
    for (let i = 1; i < activeIds.length; i++) {
      if (activeIds[i] === runStart + runLen) {
        runLen++;
      } else {
        runs.push(runStart, runLen);
        runStart = activeIds[i];
        runLen = 1;
      }
    }
    runs.push(runStart, runLen);
    return runs;
  }

  /**
   * Restore placed blocks from RLE array [start0, len0, start1, len1, ...]
   */
  deserializePlacedBlocks(runs) {
    this.clearAll();
    if (!Array.isArray(runs) || runs.length === 0) return;

    for (let i = 0; i < runs.length; i += 2) {
      const start = runs[i];
      const len = runs[i + 1];
      for (let k = 0; k < len; k++) {
        const id = start + k;
        if (id >= 0 && id < TOTAL_BLOCKS) {
          const { gx, y, gz } = this.instanceIdToCell(id);
          this.placeBlock(gx, y, gz, true);
        }
      }
    }
    this.flushGpuBuffers();
  }

  /**
   * Returns valid cells for a Master Architect manual brush centered at (gx, y, gz).
   * Brush modes: '1x1', '1x3', '3x3', '5x5'.
   */
  getBrushCells(gx, y, gz, brushMode, yaw) {
    const cells = [];
    if (brushMode === '1x1') {
      if (this.isValidCell(gx, y, gz)) cells.push({ gx, y, gz });
      return cells;
    }

    if (brushMode === '1x3') {
      // Orient the 3-block bar perpendicular to player look direction
      const alongX = Math.abs(Math.sin(yaw)) < 0.707;
      for (let d = -1; d <= 1; d++) {
        const cx = alongX ? gx + d : gx;
        const cz = alongX ? gz : gz + d;
        if (this.isValidCell(cx, y, cz)) cells.push({ gx: cx, y, gz: cz });
      }
      return cells;
    }

    const radius = brushMode === '5x5' ? 2 : 1; // 3x3 -> radius 1, 5x5 -> radius 2
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const cx = gx + dx;
        const cz = gz + dz;
        if (this.isValidCell(cx, y, cz)) {
          cells.push({ gx: cx, y, gz: cz });
        }
      }
    }
    return cells;
  }
}
