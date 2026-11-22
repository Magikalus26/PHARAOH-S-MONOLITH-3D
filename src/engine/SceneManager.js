import * as THREE from 'three';
import { createBeveledBlockGeometry, createSandstoneTexture, BLOCK_SIZE } from './PyramidBuilder.js';

/**
 * Generates a warm rippled desert sand procedural texture.
 */
function createDesertSandTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#E2B876';
  ctx.fillRect(0, 0, size, size);

  // Soft wind-blown sand ripples
  for (let y = 0; y < size; y++) {
    const ripple = Math.sin((y / size) * Math.PI * 12) * 0.5 + 0.5;
    ctx.fillStyle = ripple > 0.5
      ? `rgba(247, 217, 158, ${(ripple - 0.5) * 0.28})`
      : `rgba(181, 130, 66, ${(0.5 - ripple) * 0.22})`;
    ctx.fillRect(0, y, size, 1);
  }

  // Subtle fine sand grain
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  let s = 91823;
  for (let i = 0; i < d.length; i += 4) {
    s = (s * 16807) % 2147483647;
    const n = ((s / 2147483647) - 0.5) * 12;
    d[i] = Math.min(255, Math.max(0, d[i] + n));
    d[i + 1] = Math.min(255, Math.max(0, d[i + 1] + n * 0.9));
    d[i + 2] = Math.min(255, Math.max(0, d[i + 2] + n * 0.75));
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(48, 48);
  return tex;
}

/**
 * Generates a warm cedar timber plank texture for sleds, ramps, benches, and scaffolds.
 */
function createCedarWoodTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#9C6334';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const shade = Math.sin(y * 0.25) * 10 + (Math.random() - 0.5) * 8;
    ctx.fillStyle = `rgb(${152 + shade}, ${96 + shade * 0.7}, ${50 + shade * 0.4})`;
    ctx.fillRect(0, y, size, 2);
  }
  ctx.fillStyle = 'rgba(54, 28, 12, 0.35)';
  ctx.fillRect(0, 31, size, 2);
  ctx.fillRect(0, 63, size, 2);
  ctx.fillRect(0, 95, size, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;

    // Renderer locked for mobile 60 FPS (devicePixelRatio capped at 1.5)
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xefd1a0, 0.00145);

    this.camera = new THREE.PerspectiveCamera(
      64,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.15,
      950
    );

    // Shared procedural assets
    this.sandTexture = createDesertSandTexture();
    this.woodTexture = createCedarWoodTexture();
    this.sandstoneTexture = createSandstoneTexture();
    this.woodMaterial = new THREE.MeshStandardMaterial({
      map: this.woodTexture,
      roughness: 0.85,
      metalness: 0.04
    });
    this.roughStoneMaterial = new THREE.MeshStandardMaterial({
      map: this.sandstoneTexture,
      color: 0xd9b372,
      roughness: 0.94,
      metalness: 0.02
    });
    this.carvedStoneMaterial = new THREE.MeshStandardMaterial({
      map: this.sandstoneTexture,
      color: 0xf4dca2,
      roughness: 0.80,
      metalness: 0.04
    });

    // Authoritative world stations & ramps shared with PhysicsSystem & InteractionLoop
    this.stations = {
      quarry: {
        position: new THREE.Vector3(-22, 0, 122),
        strikeTarget: new THREE.Vector3(-21.2, 2.2, 122),
        bounds: { minX: -32, maxX: -21.5, minZ: 113, maxZ: 131, maxY: 11 }
      },
      bench: {
        position: new THREE.Vector3(-6, 0, 122),
        bounds: { minX: -8.0, maxX: -4.0, minZ: 120.7, maxZ: 123.3, maxY: 1.25 }
      },
      sledStart: new THREE.Vector3(6, 0, 118),
      ramps: [
        // Wide South-East wooden approach ramp onto Layer 1-4 terraces
        {
          minX: 11.5, maxX: 17.5,
          zStart: 124.0, zEnd: 106.0,
          yStart: 0.0, yEnd: 3.1
        },
        // Secondary South-West wooden construction ramp
        {
          minX: -17.5, maxX: -11.5,
          zStart: 118.0, zEnd: 106.5,
          yStart: 0.0, yEnd: 1.6
        }
      ]
    };

    // Dynamic animated props
    this.campfires = [];
    this.dustPoints = null;
    this.nileMaterial = null;
    this.benchRoughBlockMesh = null;
    this.benchCarvedBlockMesh = null;
    this.menuOrbitAngle = 0.42;
    this.elapsed = 0;

    // Build entire Egyptian sunlit world
    this._setupLighting();
    this._buildSkyDome();
    this._buildDesertTerrain();
    this._buildNileAndPalms();
    this._buildSisterPyramids();
    this._buildQuarryCliff();
    this._buildCarvingBench();
    this._buildWoodenRamps();
    this._buildWorkerCampAndScaffolds();
    this._buildCampfires();
    this._buildAtmosphericDust();

    window.addEventListener('resize', () => this.onResize());
  }

  onResize() {
    const w = window.innerWidth;
    const h = Math.max(1, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(w, h);
  }

  _setupLighting() {
    // Warm sunlit desert hemisphere
    const hemi = new THREE.HemisphereLight(0x9ed3ff, 0xd8a35d, 0.85);
    this.scene.add(hemi);

    // Golden low-afternoon Egyptian sun
    this.sunLight = new THREE.DirectionalLight(0xfff1cc, 1.75);
    this.sunLight.position.set(85, 78, 70);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const d = 58;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0008;
    this.sunLight.target.position.set(0, 2, 112);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Subtle warm bounce fill from opposite dune direction
    const bounce = new THREE.DirectionalLight(0xffcb85, 0.38);
    bounce.position.set(-70, 28, -50);
    this.scene.add(bounce);
  }

  _buildSkyDome() {
    const skyGeo = new THREE.SphereGeometry(800, 28, 18);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x3f88d1) },
        uMid: { value: new THREE.Color(0x8ec5e8) },
        uHorizon: { value: new THREE.Color(0xf8cf96) },
        uSunDir: { value: new THREE.Vector3(0.58, 0.26, -0.77).normalize() }
      },
      vertexShader: `
        varying vec3 vWorldDir;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldDir = normalize(position);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uZenith;
        uniform vec3 uMid;
        uniform vec3 uHorizon;
        uniform vec3 uSunDir;
        varying vec3 vWorldDir;
        void main() {
          vec3 dir = normalize(vWorldDir);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.24, h));
          col = mix(col, uZenith, smoothstep(0.22, 0.78, h));

          // Soft warm sun disc & halo matching reference golden sky
          float sunAmt = max(dot(dir, uSunDir), 0.0);
          col += vec3(1.0, 0.86, 0.56) * pow(sunAmt, 14.0) * 0.45;
          col += vec3(1.0, 0.97, 0.85) * smoothstep(0.9965, 0.9992, sunAmt) * 1.1;

          // Subtle wispy desert horizon clouds
          float band = smoothstep(0.04, 0.16, h) * (1.0 - smoothstep(0.16, 0.34, h));
          float wisp = sin(dir.x * 11.0 + dir.z * 7.0) * 0.5 + 0.5;
          col = mix(col, vec3(0.99, 0.90, 0.76), band * wisp * 0.18);

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);
  }

  _buildDesertTerrain() {
    const size = 900;
    const segs = 96;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Keep Giza construction plateau completely level (y = 0) across the pyramid & work camp
      const distX = Math.max(0, Math.abs(x) - 128);
      const distZ = z > 158 ? z - 158 : (z < -128 ? -128 - z : 0);
      const flatBlend = Math.min(1, Math.hypot(distX, distZ) / 48);

      // Gently depress eastern Nile riverbed
      const nileDepression = x > 158 && x < 245
        ? -2.8 * Math.sin(((x - 158) / 87) * Math.PI)
        : 0;

      // Rolling sunlit sand dunes beyond the plateau
      const dune =
        (Math.sin(x * 0.021 + z * 0.013) * 5.2 +
          Math.cos(x * 0.011 - z * 0.025) * 4.4 +
          Math.sin(x * 0.045) * 1.4) *
        flatBlend;

      const y = Math.max(0, dune) * (nileDepression < -0.2 ? 0 : 1) + nileDepression;
      pos.setY(i, y);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      map: this.sandTexture,
      roughness: 0.93,
      metalness: 0.02
    });
    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  _buildNileAndPalms() {
    // Shimmering Nile River strip along East horizon
    const nileGeo = new THREE.PlaneGeometry(78, 860, 12, 32);
    nileGeo.rotateX(-Math.PI / 2);
    this.nileMaterial = new THREE.MeshStandardMaterial({
      color: 0x3b8bb3,
      emissive: 0x16425b,
      emissiveIntensity: 0.35,
      roughness: 0.16,
      metalness: 0.55
    });
    const nile = new THREE.Mesh(nileGeo, this.nileMaterial);
    nile.position.set(202, -0.55, 0);
    this.scene.add(nile);

    // Lush green-gold riverbank strips
    const bankMat = new THREE.MeshStandardMaterial({
      color: 0x7e9445,
      roughness: 0.92
    });
    const westBank = new THREE.Mesh(new THREE.PlaneGeometry(18, 820), bankMat);
    westBank.rotation.x = -Math.PI / 2;
    westBank.position.set(158, 0.04, 0);
    westBank.receiveShadow = true;
    this.scene.add(westBank);

    // Date palms along the Nile and framing the oasis edges
    const palmCoords = [
      [152, 130], [156, 114], [148, 96], [155, 76], [150, 52],
      [158, 28], [149, 4], [154, -24], [150, -52], [156, -84],
      [148, 148], [132, 144], [124, 152], [96, 148],
      [-54, 142], [-62, 134], [-48, 152], [48, 148], [58, 142]
    ];

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7d5432, roughness: 0.92 });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x4b7d31,
      roughness: 0.78,
      side: THREE.DoubleSide
    });
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.34, 6.2, 6);
    const frondGeo = new THREE.ConeGeometry(0.95, 3.8, 4);
    frondGeo.scale(1, 1, 0.22);

    const palmGroup = new THREE.Group();
    palmCoords.forEach(([px, pz], idx) => {
      const palm = new THREE.Group();
      const scale = 0.85 + (idx % 4) * 0.16;
      palm.position.set(px, 0, pz);
      palm.scale.setScalar(scale);

      const trunk = new THREE.Mesh(trunkGeo, trunkMat);
      trunk.position.y = 3.0;
      trunk.rotation.z = ((idx % 3) - 1) * 0.08;
      trunk.castShadow = idx < 14;
      palm.add(trunk);

      for (let f = 0; f < 6; f++) {
        const frond = new THREE.Mesh(frondGeo, frondMat);
        const angle = (f / 6) * Math.PI * 2 + idx * 0.5;
        frond.position.set(
          Math.cos(angle) * 1.15,
          5.95,
          Math.sin(angle) * 1.15
        );
        frond.rotation.y = -angle + Math.PI * 0.5;
        frond.rotation.x = 1.12;
        palm.add(frond);
      }
      palmGroup.add(palm);
    });
    this.scene.add(palmGroup);
  }

  /**
   * Builds iconic stepped Giza sister pyramids on the horizon AND a scenic preview
   * showcase monument so the sunlit Egyptian skyline looks unmistakably monumental
   * from frame 1 (even before the player places block #1 on their own 144x144 monolith).
   */
  _buildSisterPyramids() {
    const pyrMat = new THREE.MeshStandardMaterial({
      map: this.sandstoneTexture,
      color: 0xf2d394,
      roughness: 0.82,
      metalness: 0.03
    });
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd24c,
      metalness: 0.85,
      roughness: 0.22
    });

    const buildSteppedPyramid = (baseSize, layers, posX, posZ, withGoldCap = true) => {
      const g = new THREE.Group();
      const stepH = (baseSize * 0.64) / layers;
      for (let i = 0; i < layers; i++) {
        const w = baseSize * (1 - i / layers);
        const tierGeo = new THREE.BoxGeometry(w, stepH * 0.96, w);
        const tier = new THREE.Mesh(tierGeo, pyrMat);
        tier.position.y = (i + 0.5) * stepH;
        g.add(tier);
      }
      if (withGoldCap) {
        const capW = (baseSize / layers) * 1.45;
        const capGeo = new THREE.ConeGeometry(capW * 0.72, stepH * 1.6, 4);
        capGeo.rotateY(Math.PI * 0.25);
        const cap = new THREE.Mesh(capGeo, goldMat);
        cap.position.y = layers * stepH + stepH * 0.65;
        g.add(cap);
      }
      g.position.set(posX, 0, posZ);
      this.scene.add(g);
      return g;
    };

    // Distant Giza plateau monuments framing the sunlit horizon (outside player's 216x216 build zone)
    buildSteppedPyramid(92, 16, -205, -190, true);
    buildSteppedPyramid(64, 13, 125, -245, true);
  }

  /**
   * Stepped sandstone quarry cliff on the West side of the South Work Plaza.
   */
  _buildQuarryCliff() {
    const group = new THREE.Group();
    const qPos = this.stations.quarry.position;

    const blockGeo = createBeveledBlockGeometry(2.6, 0.22);
    const cliffMat = new THREE.MeshStandardMaterial({
      map: this.sandstoneTexture,
      color: 0xdfb974,
      roughness: 0.92
    });
    const cliffDarkMat = new THREE.MeshStandardMaterial({
      map: this.sandstoneTexture,
      color: 0xc99c58,
      roughness: 0.95
    });

    // Multi-tiered stepped limestone quarry face
    const tiers = [
      { x: -24.5, y: 1.25, z: 122, sx: 2.2, sy: 1.0, sz: 6.2 },
      { x: -26.8, y: 3.6, z: 122, sx: 2.4, sy: 1.2, sz: 6.8 },
      { x: -29.2, y: 6.2, z: 122, sx: 2.6, sy: 1.4, sz: 7.4 },
      { x: -23.0, y: 1.1, z: 116.8, sx: 1.4, sy: 0.9, sz: 2.1 },
      { x: -23.2, y: 1.2, z: 127.2, sx: 1.5, sy: 1.0, sz: 2.2 },
      { x: -25.4, y: 3.1, z: 115.6, sx: 1.6, sy: 1.0, sz: 2.0 },
      { x: -25.0, y: 3.2, z: 128.0, sx: 1.7, sy: 1.1, sz: 2.1 }
    ];

    tiers.forEach((t, idx) => {
      const m = new THREE.Mesh(blockGeo, idx % 2 === 0 ? cliffMat : cliffDarkMat);
      m.position.set(t.x, t.y, t.z);
      m.scale.set(t.sx, t.sy, t.sz);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    });

    // Decorative pre-cut quarry ledge blocks & wooden quarry framing posts
    const postGeo = new THREE.CylinderGeometry(0.12, 0.14, 3.8, 6);
    for (const pz of [116.2, 127.8]) {
      const post = new THREE.Mesh(postGeo, this.woodMaterial);
      post.position.set(-21.2, 1.9, pz);
      post.castShadow = true;
      group.add(post);
    }

    // Subtle glowing gold quarry marker stone banner
    const signGeo = new THREE.BoxGeometry(0.18, 0.7, 2.4);
    const signMat = new THREE.MeshStandardMaterial({
      color: 0xd99b38,
      roughness: 0.5,
      metalness: 0.35
    });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(-21.4, 3.4, qPos.z);
    group.add(sign);

    this.quarryGroup = group;
    this.scene.add(group);
  }

  /**
   * Stonemason Carving Workbench with wooden trestle legs, shade awning,
   * chisel/mallet props, and visible active stone slot.
   */
  _buildCarvingBench() {
    const group = new THREE.Group();
    const bp = this.stations.bench.position;
    group.position.copy(bp);

    // Heavy cedar tabletop
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.24, 2.1), this.woodMaterial);
    top.position.y = 0.96;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    // 4 stout legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.96, 0.22);
    for (const lx of [-1.4, 1.4]) {
      for (const lz of [-0.78, 0.78]) {
        const leg = new THREE.Mesh(legGeo, this.woodMaterial);
        leg.position.set(lx, 0.48, lz);
        leg.castShadow = true;
        group.add(leg);
      }
    }

    // Sunlit linen canopy poles + terracotta-striped awning
    const poleGeo = new THREE.CylinderGeometry(0.07, 0.08, 3.3, 6);
    for (const lx of [-1.55, 1.55]) {
      for (const lz of [-0.9, 0.9]) {
        const pole = new THREE.Mesh(poleGeo, this.woodMaterial);
        pole.position.set(lx, 1.65, lz);
        pole.castShadow = true;
        group.add(pole);
      }
    }
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0xf4e4c1,
      roughness: 0.92,
      side: THREE.DoubleSide
    });
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.08, 2.5), canopyMat);
    canopy.position.set(0, 3.25, 0);
    canopy.rotation.x = 0.08;
    canopy.castShadow = true;
    group.add(canopy);

    // Terracotta trim stripe
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xb0482b, roughness: 0.85 });
    const trim = new THREE.Mesh(new THREE.BoxGeometry(3.84, 0.14, 0.14), trimMat);
    trim.position.set(0, 3.16, 1.24);
    group.add(trim);

    // Bronze chisel & wooden mallet resting on the bench side
    const malletHead = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.28, 8), this.woodMaterial);
    malletHead.rotation.z = Math.PI * 0.5;
    malletHead.position.set(1.1, 1.18, 0.45);
    group.add(malletHead);

    const chiselMat = new THREE.MeshStandardMaterial({ color: 0xc98142, metalness: 0.72, roughness: 0.35 });
    const chisel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.42), chiselMat);
    chisel.position.set(1.22, 1.11, -0.15);
    chisel.rotation.y = 0.4;
    group.add(chisel);

    // Active block resting on workbench (toggled during carving!)
    const roughGeo = new THREE.DodecahedronGeometry(0.58, 0);
    this.benchRoughBlockMesh = new THREE.Mesh(roughGeo, this.roughStoneMaterial);
    this.benchRoughBlockMesh.position.set(-0.2, 1.54, 0);
    this.benchRoughBlockMesh.castShadow = true;
    this.benchRoughBlockMesh.visible = false;
    group.add(this.benchRoughBlockMesh);

    const carvedGeo = createBeveledBlockGeometry(0.95, 0.1);
    this.benchCarvedBlockMesh = new THREE.Mesh(carvedGeo, this.carvedStoneMaterial);
    this.benchCarvedBlockMesh.position.set(-0.2, 1.56, 0);
    this.benchCarvedBlockMesh.castShadow = true;
    this.benchCarvedBlockMesh.visible = false;
    group.add(this.benchCarvedBlockMesh);

    this.benchGroup = group;
    this.scene.add(group);
  }

  /**
   * Wide wooden side ramps for walking & pulling the loaded cargo sled up onto pyramid terraces.
   */
  _buildWoodenRamps() {
    const group = new THREE.Group();

    this.stations.ramps.forEach((r) => {
      const width = r.maxX - r.minX;
      const run = r.zStart - r.zEnd;
      const rise = r.yEnd - r.yStart;
      const length = Math.hypot(run, rise);
      const angle = Math.atan2(rise, run);
      const cx = (r.minX + r.maxX) * 0.5;
      const cz = (r.zStart + r.zEnd) * 0.5;
      const cy = (r.yStart + r.yEnd) * 0.5;

      // Sloped plank deck
      const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.24, length), this.woodMaterial);
      deck.position.set(cx, cy - 0.1, cz);
      deck.rotation.x = angle;
      deck.castShadow = true;
      deck.receiveShadow = true;
      group.add(deck);

      // Side timber guard rails & support pillars
      const railGeo = new THREE.BoxGeometry(0.22, 0.34, length);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, this.woodMaterial);
        rail.position.set(cx + side * (width * 0.5 - 0.12), cy + 0.12, cz);
        rail.rotation.x = angle;
        rail.castShadow = true;
        group.add(rail);
      }

      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const frac = i / steps;
        const pz = r.zStart - run * frac;
        const ph = r.yStart + rise * frac;
        const postGeo = new THREE.BoxGeometry(0.26, ph, 0.26);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(postGeo, this.woodMaterial);
          post.position.set(cx + side * (width * 0.44), ph * 0.5, pz);
          post.castShadow = true;
          group.add(post);
        }
      }
    });

    this.scene.add(group);
  }

  /**
   * Worker shade tents, wooden scaffolds with woven baskets (echoing the App Icon!),
   * amphorae, and reserve sandstone block stacks.
   */
  _buildWorkerCampAndScaffolds() {
    const group = new THREE.Group();
    const linenMat = new THREE.MeshStandardMaterial({ color: 0xf3e4c4, roughness: 0.92, side: THREE.DoubleSide });
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xab472a, roughness: 0.88 });
    const basketMat = new THREE.MeshStandardMaterial({ color: 0xb88446, roughness: 0.9 });

    // Worker linen tents (East & West flanks of the plaza)
    const tents = [
      { x: 26, z: 126, rot: -0.35 },
      { x: 33, z: 118, rot: -0.7 },
      { x: -24, z: 137, rot: 0.45 }
    ];
    tents.forEach((t) => {
      const tent = new THREE.Group();
      tent.position.set(t.x, 0, t.z);
      tent.rotation.y = t.rot;

      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.2, 2.2, 4), linenMat);
      roof.position.y = 3.0;
      roof.rotation.y = Math.PI * 0.25;
      roof.castShadow = true;
      tent.add(roof);

      const band = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.22, 4.4), stripeMat);
      band.position.y = 1.95;
      tent.add(band);

      const poleGeo = new THREE.CylinderGeometry(0.08, 0.09, 2.0, 6);
      for (const sx of [-1.9, 1.9]) {
        for (const sz of [-1.9, 1.9]) {
          const p = new THREE.Mesh(poleGeo, this.woodMaterial);
          p.position.set(sx, 1.0, sz);
          p.castShadow = true;
          tent.add(p);
        }
      }
      group.add(tent);
    });

    // Wooden scaffolding tables with woven baskets (icon homage!)
    const scaffolds = [
      [10.2, 113.5], [-10.5, 114.2], [20.5, 114.0]
    ];
    scaffolds.forEach(([sx, sz]) => {
      const sc = new THREE.Group();
      sc.position.set(sx, 0, sz);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.14, 1.4), this.woodMaterial);
      deck.position.y = 1.35;
      deck.castShadow = true;
      sc.add(deck);

      const legGeo = new THREE.BoxGeometry(0.12, 1.35, 0.12);
      for (const lx of [-0.72, 0.72]) {
        for (const lz of [-0.56, 0.56]) {
          const l = new THREE.Mesh(legGeo, this.woodMaterial);
          l.position.set(lx, 0.675, lz);
          l.castShadow = true;
          sc.add(l);
        }
      }

      // Woven reed tool basket on top
      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.26, 0.42, 10), basketMat);
      basket.position.set(0.15, 1.62, 0.05);
      basket.castShadow = true;
      sc.add(basket);

      group.add(sc);
    });

    // Decorative neatly stacked reserve sandstone blocks near camp edges
    const decoBlockGeo = createBeveledBlockGeometry(1.42, 0.13);
    const stacks = [
      [-15.5, 0.71, 130], [-14.0, 0.71, 130.2], [-14.7, 2.13, 130.1],
      [22.5, 0.71, 131], [24.0, 0.71, 131.1], [23.2, 2.13, 131.0]
    ];
    stacks.forEach(([bx, by, bz]) => {
      const m = new THREE.Mesh(decoBlockGeo, this.carvedStoneMaterial);
      m.position.set(bx, by, bz);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    });

    this.scene.add(group);
  }

  /**
   * Dynamic flickering Egyptian stone braziers / campfires with glowing embers.
   */
  _buildCampfires() {
    const locations = [
      [19.5, 123.5],
      [-15.5, 124.5],
      [2.0, 128.5]
    ];

    const bowlMat = new THREE.MeshStandardMaterial({ color: 0x705136, roughness: 0.85 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa62b });
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xfff099 });

    locations.forEach(([fx, fz], idx) => {
      const g = new THREE.Group();
      g.position.set(fx, 0, fz);

      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.36, 0.55, 8), bowlMat);
      bowl.position.y = 0.28;
      bowl.castShadow = true;
      g.add(bowl);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.85, 6), flameMat);
      flame.position.y = 0.82;
      g.add(flame);

      const core = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 6), innerMat);
      core.position.y = 0.74;
      g.add(core);

      const light = new THREE.PointLight(0xff8c2b, 3.2, 16, 1.6);
      light.position.y = 1.35;
      g.add(light);

      this.scene.add(g);
      this.campfires.push({ flame, core, light, phase: idx * 2.1 });
    });
  }

  /**
   * Atmospheric golden sunlit desert dust motes drifting through the air.
   */
  _buildAtmosphericDust() {
    const count = 240;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 90;
      positions[i * 3 + 1] = 0.4 + Math.random() * 14;
      positions[i * 3 + 2] = 80 + Math.random() * 68;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffe6ab,
      size: 0.24,
      transparent: true,
      opacity: 0.52,
      depthWrite: false
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
  }

  /**
   * Updates animated desert environment (campfires, dust motes, Nile shimmer, menu camera).
   */
  update(dt, state, pyramidBuilder, playerPos) {
    this.elapsed += dt;

    // Flickering dynamic campfires
    for (const cf of this.campfires) {
      const f = 0.85 + Math.sin(this.elapsed * 9.5 + cf.phase) * 0.14 + Math.cos(this.elapsed * 15.2 + cf.phase) * 0.08;
      cf.flame.scale.set(0.95 + (f - 0.85) * 0.6, f * 1.08, 0.95 + (f - 0.85) * 0.6);
      cf.core.scale.setScalar(0.9 + (f - 0.85) * 0.7);
      cf.light.intensity = 2.6 + f * 1.4;
    }

    // Drifting golden dust motes
    if (this.dustPoints) {
      const arr = this.dustPoints.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += dt * 0.55;
        arr[i + 1] += Math.sin(this.elapsed * 0.7 + i) * dt * 0.12;
        if (arr[i] > 45) arr[i] = -45;
      }
      this.dustPoints.geometry.attributes.position.needsUpdate = true;
    }

    // Subtle Nile sunlight glint
    if (this.nileMaterial) {
      this.nileMaterial.emissiveIntensity = 0.28 + Math.sin(this.elapsed * 1.6) * 0.08;
    }

    // Keep shadow frustum centered near the player during gameplay for sharp shadows everywhere
    if (state === 'PLAYING' && playerPos) {
      this.sunLight.target.position.set(playerPos.x, Math.max(0, playerPos.y), playerPos.z);
      this.sunLight.position.set(playerPos.x + 65, Math.max(40, playerPos.y + 72), playerPos.z + 52);
    }

    // Scenic orbiting camera on the Main Menu matching the sunlit desert pyramid reference
    if (state === 'MENU') {
      this.menuOrbitAngle += dt * 0.12;
      const hasMajorPyramid = pyramidBuilder && pyramidBuilder.placedCount >= 25;
      if (hasMajorPyramid) {
        // Orbit the player's living Great Monolith & South construction camp
        const radius = 54 + Math.min(90, pyramidBuilder.highestLayer * 1.4);
        const cx = Math.sin(this.menuOrbitAngle) * radius;
        const cz = 96 + Math.cos(this.menuOrbitAngle) * 38;
        const cy = 18 + Math.min(48, pyramidBuilder.highestLayer * 0.75);
        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(0, 6 + pyramidBuilder.highestLayer * 0.4, 92);
      } else {
        // Frame the sunlit construction camp, wooden ramps, Nile + palms & distant Giza pyramid
        const sway = Math.sin(this.menuOrbitAngle * 1.1) * 18;
        this.camera.position.set(22 + sway, 15.5, 146);
        this.camera.lookAt(-18 + sway * 0.2, 8.5, 65);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
