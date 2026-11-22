import * as THREE from 'three';
import { createBeveledBlockGeometry } from './PyramidBuilder.js';
import {
  createDesertEnvMap,
  createDesertSandMaterial,
  createLimestoneBlockPBR,
  createQuarryCliffMaterial,
  createCedarWoodPBR,
  createHempRopeMaterial,
  createStripedLinenMaterial,
  createSoftDustSpriteTexture,
  createRoyalBannerTexture
} from './ProceduralPBR.js';

/**
 * Helper: creates a vertex-sculpted stratified sandstone cliff crag with stepped horizontal
 * geological ledges, organic craggy ridges, and baked crevice ambient occlusion vertex colors.
 */
function createSculptedCliffGeometry(width, height, depth, seed = 1) {
  const geo = new THREE.BoxGeometry(width, height, depth, 10, 12, 14);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);

  const halfH = height * 0.5;
  for (let i = 0; i < pos.count; i++) {
    let vx = pos.getX(i);
    let vy = pos.getY(i);
    let vz = pos.getZ(i);

    // Normalized height [0..1]
    const ny = (vy + halfH) / Math.max(0.001, height);

    // Taper top slightly like weathered desert mesa / stepped quarry cut
    const taper = 1.0 - ny * 0.22;
    vx *= taper;
    vz *= (1.0 - ny * 0.14);

    // Stepped sedimentary strata ledges protruding horizontally
    const strataWave = Math.sin(ny * Math.PI * 7.0 + seed) * 0.28 +
                       Math.cos(ny * Math.PI * 13.0 + vz * 0.45) * 0.14;

    // Sculpted craggy horizontal faces & quarry chisel notches
    const crag = Math.sin(vz * 0.55 + seed * 2.1) * Math.cos(vy * 0.75) * 0.42 +
                 Math.sin(vx * 0.65 - vz * 0.35 + seed) * 0.24;

    // Only displace outward-facing rock surfaces (leave base seated cleanly on sand)
    const groundMask = Math.min(1, ny * 4.5);
    vx += (strataWave + crag) * groundMask * (vx >= 0 ? 1.15 : 0.65);
    vz += Math.sin(vy * 0.9 + vx * 0.5 + seed) * 0.28 * groundMask;
    vy += Math.sin(vx * 0.5 + vz * 0.45 + seed) * 0.16 * (ny > 0.85 ? 1.0 : 0.3);

    pos.setXYZ(i, vx, vy, vz);

    // Baked stylized ambient occlusion in lower base & recessed strata creases
    const ao = Math.max(0.58, Math.min(1.06, 0.72 + ny * 0.26 + strataWave * 0.35));
    colors[i * 3]     = ao;
    colors[i * 3 + 1] = ao * 0.96;
    colors[i * 3 + 2] = ao * 0.90;
  }

  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Helper: creates a curved arched palm frond blade geometry with realistic central droop.
 */
function createArchedFrondGeometry() {
  const geo = new THREE.PlaneGeometry(1.15, 4.2, 2, 7);
  // Shift pivot to base of frond (y = 0 -> y = 4.2)
  geo.translate(0, 2.1, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const t = y / 4.2; // 0 at trunk -> 1 at tip

    // Taper width organically like a real date palm blade
    const widthProfile = Math.sin(Math.pow(t, 0.72) * Math.PI);
    const nx = x * (0.22 + widthProfile * 0.95);

    // Graceful outward arch & downward tip droop + V-fold spine crease
    const archZ = t * 3.15;
    const droopY = Math.sin(t * Math.PI * 0.78) * 1.35 - t * t * 1.15;
    const spineFold = Math.abs(nx) * 0.22;

    pos.setXYZ(i, nx, droopY - spineFold, archZ);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Helper: Lathe-turned stylized Egyptian terracotta clay amphora geometry.
 */
function createAmphoraGeometry() {
  const pts = [
    new THREE.Vector2(0.01, 0.0),
    new THREE.Vector2(0.14, 0.04),
    new THREE.Vector2(0.24, 0.24),
    new THREE.Vector2(0.32, 0.50),
    new THREE.Vector2(0.29, 0.72),
    new THREE.Vector2(0.13, 0.88),
    new THREE.Vector2(0.12, 1.02),
    new THREE.Vector2(0.18, 1.09),
    new THREE.Vector2(0.15, 1.12),
    new THREE.Vector2(0.10, 1.04)
  ];
  return new THREE.LatheGeometry(pts, 14);
}

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;

    // Mobile-locked 60 FPS WebGLRenderer (devicePixelRatio capped at 1.5, ACESFilmicToneMapping)
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
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xf2cfa0, 0.0012);

    // Bake lightweight stylized Golden-Hour Desert PMREM Environment Map for realistic PBR sheen
    this.envMap = createDesertEnvMap(this.renderer);
    this.scene.environment = this.envMap;
    if ('environmentIntensity' in this.scene) {
      this.scene.environmentIntensity = 0.62;
    }

    this.camera = new THREE.PerspectiveCamera(
      64,
      window.innerWidth / Math.max(1, window.innerHeight),
      0.15,
      980
    );

    // Shared High-Definition 512x512 Procedural PBR Materials
    this.limestonePbr = createLimestoneBlockPBR();
    this.sandstoneTexture = this.limestonePbr.map;
    this.sandMaterial = createDesertSandMaterial(46);
    this.cliffMaterial = createQuarryCliffMaterial();
    this.woodMaterial = createCedarWoodPBR();
    this.ropeMaterial = createHempRopeMaterial();
    this.linenMaterial = createStripedLinenMaterial();
    this.dustSpriteTexture = createSoftDustSpriteTexture();
    this.bannerTexture = createRoyalBannerTexture();

    this.bronzeMaterial = new THREE.MeshStandardMaterial({
      color: 0x5c4632,
      metalness: 0.78,
      roughness: 0.34
    });
    this.copperMaterial = new THREE.MeshStandardMaterial({
      color: 0xd98042,
      metalness: 0.82,
      roughness: 0.28
    });
    this.goldMaterial = new THREE.MeshStandardMaterial({
      color: 0xf7c948,
      metalness: 0.88,
      roughness: 0.22
    });
    this.terracottaMaterial = new THREE.MeshStandardMaterial({
      color: 0xb95632,
      roughness: 0.68,
      metalness: 0.05
    });

    this.roughStoneMaterial = new THREE.MeshStandardMaterial({
      map: this.limestonePbr.map,
      normalMap: this.limestonePbr.normalMap,
      normalScale: new THREE.Vector2(1.4, 1.4),
      roughnessMap: this.limestonePbr.roughnessMap,
      color: 0xdab06d,
      roughness: 1.0,
      metalness: 0.02
    });
    this.carvedStoneMaterial = new THREE.MeshStandardMaterial({
      map: this.limestonePbr.map,
      normalMap: this.limestonePbr.normalMap,
      normalScale: new THREE.Vector2(0.75, 0.75),
      roughnessMap: this.limestonePbr.roughnessMap,
      color: 0xf8e2ac,
      roughness: 1.0,
      metalness: 0.03
    });

    // Authoritative world stations & ramps shared with PhysicsSystem & InteractionLoop
    this.stations = {
      quarry: {
        position: new THREE.Vector3(-22, 0, 122),
        strikeTarget: new THREE.Vector3(-21.2, 2.2, 122),
        bounds: { minX: -33, maxX: -21.5, minZ: 112.5, maxZ: 131.5, maxY: 12 }
      },
      bench: {
        position: new THREE.Vector3(-6, 0, 122),
        bounds: { minX: -8.0, maxX: -4.0, minZ: 120.7, maxZ: 123.3, maxY: 1.25 }
      },
      sledStart: new THREE.Vector3(6, 0, 118),
      ramps: [
        {
          minX: 11.5, maxX: 17.5,
          zStart: 124.0, zEnd: 106.0,
          yStart: 0.0, yEnd: 3.1
        },
        {
          minX: -17.5, maxX: -11.5,
          zStart: 118.0, zEnd: 106.5,
          yStart: 0.0, yEnd: 1.6
        }
      ]
    };

    // Animated environment handles
    this.campfires = [];
    this.palmCrowns = [];
    this.bannerUniforms = [];
    this.nileUniforms = null;
    this.dustPoints = null;
    this.emberPoints = null;
    this.benchRoughBlockMesh = null;
    this.benchCarvedBlockMesh = null;
    this.menuOrbitAngle = 0.42;
    this.elapsed = 0;

    // Build stylized Fortnite-inspired sunlit Egyptian world
    this._setupLighting();
    this._buildSkyDome();
    this._buildDesertTerrain();
    this._buildNileAndOasis();
    this._buildSisterPyramids();
    this._buildSculptedQuarryCliff();
    this._buildCarvingBench();
    this._buildWoodenRamps();
    this._buildCampPropsAndBanners();
    this._buildBraziers();
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
    // Cool azure sky / warm golden desert ground bounce HemisphereLight
    const hemi = new THREE.HemisphereLight(0x6db3f2, 0xc99a5b, 0.95);
    this.scene.add(hemi);

    // Warm golden-hour key sunlight (#FFE4B5) with crisp soft PCF shadows
    this.sunLight = new THREE.DirectionalLight(0xffe4b5, 2.15);
    this.sunLight.position.set(85, 76, 68);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 260;
    const d = 56;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0007;
    this.sunLight.shadow.normalBias = 0.03;
    this.sunLight.target.position.set(0, 2, 114);
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Warm sand-bounce rim fill from opposite horizon so shaded sides stay rich & never flat black
    const rimFill = new THREE.DirectionalLight(0xffb96b, 0.42);
    rimFill.position.set(-72, 24, -54);
    this.scene.add(rimFill);
  }

  _buildSkyDome() {
    const skyGeo = new THREE.SphereGeometry(840, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(0x2f7dd1) },
        uMid: { value: new THREE.Color(0x7fc1ea) },
        uHorizon: { value: new THREE.Color(0xfbd396) },
        uSunDir: { value: new THREE.Vector3(0.58, 0.25, -0.77).normalize() }
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
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.25, h));
          col = mix(col, uZenith, smoothstep(0.22, 0.78, h));

          // Golden-hour solar bloom & radiant sun disc
          float sunAmt = max(dot(dir, uSunDir), 0.0);
          col += vec3(1.0, 0.83, 0.48) * pow(sunAmt, 9.0) * 0.48;
          col += vec3(1.0, 0.96, 0.84) * smoothstep(0.9962, 0.9991, sunAmt) * 1.25;

          // Stylized painted desert cirrus clouds
          float band = smoothstep(0.04, 0.16, h) * (1.0 - smoothstep(0.18, 0.38, h));
          float c1 = sin(dir.x * 10.0 + dir.z * 6.0) * 0.5 + 0.5;
          float c2 = cos(dir.x * 19.0 - dir.z * 11.0) * 0.5 + 0.5;
          float cloud = smoothstep(0.45, 0.82, c1 * 0.65 + c2 * 0.35);
          col = mix(col, vec3(1.0, 0.92, 0.78), band * cloud * 0.32);

          gl_FragColor = vec4(col, 1.0);
        }
      `
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));
  }

  /**
   * Sculpted multi-layered desert dunes outside the level Giza construction plaza,
   * shaded with vertex-color ochre/terracotta dune warmth and micro-sparkle sand PBR.
   */
  _buildDesertTerrain() {
    const size = 940;
    const segs = 88;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      // Keep Giza construction plateau completely flat (y = 0) for exact 144x144 placement & sled
      const distX = Math.max(0, Math.abs(x) - 128);
      const distZ = z > 158 ? z - 158 : (z < -128 ? -128 - z : 0);
      const flatBlend = Math.min(1, Math.hypot(distX, distZ) / 42);
      const smoothBlend = flatBlend * flatBlend * (3 - 2 * flatBlend);

      // Nile riverbed depression along East flank
      const nileMask = x > 155 && x < 248
        ? Math.sin(((x - 155) / 93) * Math.PI)
        : 0;
      const nileDepression = -3.1 * nileMask;

      // Multi-layered wind-sculpted sharp-crested Saharan dunes
      const ridge1 = 1.0 - Math.abs(Math.sin(x * 0.017 + z * 0.011 + Math.sin(z * 0.008) * 1.4));
      const ridge2 = 1.0 - Math.abs(Math.cos(x * 0.012 - z * 0.021));
      const undulation = Math.sin(x * 0.033 + z * 0.028) * 1.6;
      const dune = (Math.pow(ridge1, 1.8) * 11.5 + Math.pow(ridge2, 1.6) * 7.2 + undulation) * smoothBlend;

      const y = Math.max(0, dune) * (nileMask > 0.12 ? 0 : 1) + nileDepression;
      pos.setY(i, y);

      // Stylized vertex tint: sunlit golden crests, warm ochre troughs, fertile greenish Nile bank
      let r = 1.0, g = 0.98, b = 0.94;
      if (nileMask > 0.01 && nileMask < 0.35) {
        // Fertile damp sandy riverbank edge
        r = 0.86; g = 0.88; b = 0.72;
      } else if (y > 0.5) {
        const crest = Math.min(1, y / 14);
        r = 0.96 + crest * 0.08;
        g = 0.91 + crest * 0.08;
        b = 0.84 + crest * 0.06;
      }
      colors[i * 3] = r;
      colors[i * 3 + 1] = g;
      colors[i * 3 + 2] = b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    this.terrainMesh = new THREE.Mesh(geo, this.sandMaterial);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);
  }

  /**
   * Realistic Shimmering Nile Water Shader + Lush Curved Segmented Date Palm Groves
   * + Stylized Oasis Grass & Papyrus Reed Tufts.
   */
  _buildNileAndOasis() {
    // 1. Shimmering animated Nile Water Shader reflecting the golden sky
    const nileGeo = new THREE.PlaneGeometry(82, 880, 16, 48);
    nileGeo.rotateX(-Math.PI / 2);
    this.nileUniforms = {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x165b84) },
      uShallowColor: { value: new THREE.Color(0x3ba8b8) },
      uSkyColor: { value: new THREE.Color(0x9fd2f0) },
      uSunColor: { value: new THREE.Color(0xffe9a6) }
    };
    const nileMat = new THREE.ShaderMaterial({
      uniforms: this.nileUniforms,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec3 p = position;
          p.y += sin(p.z * 0.14 + uTime * 1.9) * 0.09 + cos(p.x * 0.25 - uTime * 1.4) * 0.06;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSkyColor;
        uniform vec3 uSunColor;
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          // Animated dual wave ripples
          float w1 = sin(vWorldPos.z * 0.42 + uTime * 2.1 + sin(vWorldPos.x * 0.35) * 1.6);
          float w2 = cos(vWorldPos.x * 0.65 - vWorldPos.z * 0.28 + uTime * 1.7);
          vec3 n = normalize(vec3((w1 + w2) * 0.09, 1.0, (w1 - w2) * 0.09));

          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 3.0);

          // Turquoise bank shallows transitioning to deep lapis Nile center
          float bankEdge = 1.0 - smoothstep(0.0, 0.22, min(vUv.x, 1.0 - vUv.x));
          vec3 waterCol = mix(uDeepColor, uShallowColor, bankEdge * 0.78 + (w1 * 0.5 + 0.5) * 0.14);

          // Golden sky Fresnel reflection
          waterCol = mix(waterCol, uSkyColor, clamp(fresnel * 0.72, 0.0, 0.8));

          // Sun specular shimmer path across the water
          vec3 sunDir = normalize(vec3(0.55, 0.32, -0.75));
          vec3 halfV = normalize(viewDir + sunDir);
          float glint = pow(max(dot(n, halfV), 0.0), 54.0);
          waterCol += uSunColor * glint * 1.35;

          // Subtle foam ribbon right along riverbank
          float foam = smoothstep(0.75, 0.96, bankEdge + w1 * 0.08);
          waterCol = mix(waterCol, vec3(0.95, 0.94, 0.88), foam * 0.35);

          gl_FragColor = vec4(waterCol, 1.0);
        }
      `
    });
    const nile = new THREE.Mesh(nileGeo, nileMat);
    nile.position.set(202, -0.45, 0);
    this.scene.add(nile);

    // 2. Fertile green-gold oasis riverbank & grass tufts
    const bankMat = new THREE.MeshStandardMaterial({
      color: 0x6f8d38,
      roughness: 0.92,
      metalness: 0.01
    });
    const westBank = new THREE.Mesh(new THREE.PlaneGeometry(20, 840), bankMat);
    westBank.rotation.x = -Math.PI / 2;
    westBank.position.set(157, 0.04, 0);
    westBank.receiveShadow = true;
    this.scene.add(westBank);

    // 3. Detailed Date Palm Clusters via 3 InstancedMeshes (460 meshes -> 3 draw calls for locked 60 FPS!)
    const palmCoords = [
      [152, 132], [156, 114], [148, 96], [155, 76], [150, 52],
      [158, 28], [149, 4], [154, -24], [150, -52], [156, -84],
      [146, 146], [134, 144], [122, 150], [98, 148],
      [42, 132], [47, 126], [39, 119],
      [-46, 134], [-54, 127], [-42, 144]
    ];

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x855a36,
      normalMap: this.woodMaterial.normalMap,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughness: 0.92
    });
    this.frondUniforms = { uTime: { value: 0 } };
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x559635,
      roughness: 0.65,
      metalness: 0.04,
      side: THREE.DoubleSide
    });
    // GPU wind-sway on instanced palm fronds (zero CPU matrix updates per frame!)
    frondMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.frondUniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           float tipFactor = clamp(position.z / 3.2, 0.0, 1.0);
           transformed.y += sin(uTime * 1.8 + instanceMatrix[3][0] * 0.15 + instanceMatrix[3][2] * 0.12) * 0.22 * tipFactor;`
        );
    };
    const coconutMat = new THREE.MeshStandardMaterial({ color: 0x6b3f1c, roughness: 0.8 });

    const segGeo = new THREE.CylinderGeometry(0.24, 0.31, 0.95, 7);
    const frondGeo = createArchedFrondGeometry();
    const dateClusterGeo = new THREE.SphereGeometry(0.18, 6, 5);

    const segInst = new THREE.InstancedMesh(segGeo, trunkMat, palmCoords.length * 8);
    const frondInst = new THREE.InstancedMesh(frondGeo, frondMat, palmCoords.length * 12);
    const dateInst = new THREE.InstancedMesh(dateClusterGeo, coconutMat, palmCoords.length * 3);
    segInst.castShadow = true;
    segInst.receiveShadow = true;

    const dummy = new THREE.Object3D();
    const rootDummy = new THREE.Object3D();
    const localDummy = new THREE.Object3D();
    const mFinal = new THREE.Matrix4();
    const tint = new THREE.Color();

    let segIdx = 0, frondIdx = 0, dateIdx = 0;
    palmCoords.forEach(([px, pz], idx) => {
      const scale = 0.88 + (idx % 4) * 0.16;
      rootDummy.position.set(px, 0, pz);
      rootDummy.rotation.set(0, idx * 1.37, 0);
      rootDummy.scale.setScalar(scale);
      rootDummy.updateMatrix();

      let curX = 0, curY = 0;
      const lean = 0.14 + (idx % 3) * 0.05;
      for (let s = 0; s < 8; s++) {
        const frac = s / 7;
        const tilt = lean * frac;
        const rScale = 1.0 - frac * 0.36;
        localDummy.position.set(curX, curY + 0.44, 0);
        localDummy.rotation.set(0, 0, -tilt);
        localDummy.scale.set(rScale, 1.0, rScale);
        localDummy.updateMatrix();
        mFinal.multiplyMatrices(rootDummy.matrix, localDummy.matrix);
        segInst.setMatrixAt(segIdx++, mFinal);
        curX += Math.sin(tilt) * 0.84;
        curY += Math.cos(tilt) * 0.84;
      }

      for (let tier = 0; tier < 2; tier++) {
        const count = tier === 0 ? 7 : 5;
        for (let f = 0; f < count; f++) {
          const angle = (f / count) * Math.PI * 2 + tier * 0.45;
          localDummy.position.set(curX, curY + 0.12, 0);
          localDummy.rotation.set(tier === 0 ? 0.15 : -0.22, angle, 0);
          localDummy.scale.setScalar(tier === 0 ? 1.0 : 0.78);
          localDummy.updateMatrix();
          mFinal.multiplyMatrices(rootDummy.matrix, localDummy.matrix);
          frondInst.setMatrixAt(frondIdx, mFinal);
          tint.setHex(tier === 0 ? 0x4d8c32 : 0x6ba63a);
          frondInst.setColorAt(frondIdx, tint);
          frondIdx++;
        }
      }

      for (let c = 0; c < 3; c++) {
        const a = c * 2.1;
        localDummy.position.set(curX + Math.cos(a) * 0.28, curY - 0.06, Math.sin(a) * 0.28);
        localDummy.rotation.set(0, 0, 0);
        localDummy.scale.setScalar(1);
        localDummy.updateMatrix();
        mFinal.multiplyMatrices(rootDummy.matrix, localDummy.matrix);
        dateInst.setMatrixAt(dateIdx++, mFinal);
      }
    });

    segInst.instanceMatrix.needsUpdate = true;
    frondInst.instanceMatrix.needsUpdate = true;
    if (frondInst.instanceColor) frondInst.instanceColor.needsUpdate = true;
    dateInst.instanceMatrix.needsUpdate = true;
    this.scene.add(segInst, frondInst, dateInst);

    // 4. Stylized Oasis Grass & Papyrus Reed Tufts via 1 single InstancedMesh
    const reedGeo = new THREE.ConeGeometry(0.11, 1.35, 4);
    reedGeo.translate(0, 0.65, 0);
    const reedMat = new THREE.MeshStandardMaterial({ color: 0x629636, roughness: 0.78 });
    const tuftCenters = [
      ...palmCoords.slice(0, 12),
      [40, 131], [45, 127], [-44, 134], [-51, 128], [36, 122]
    ];
    const reedInst = new THREE.InstancedMesh(reedGeo, reedMat, tuftCenters.length * 5);
    let reedIdx = 0;
    tuftCenters.forEach(([tx, tz], idx) => {
      for (let b = 0; b < 5; b++) {
        const a = (b / 5) * Math.PI * 2 + idx;
        dummy.position.set(tx + Math.cos(a) * 0.85, 0, tz + Math.sin(a) * 0.85);
        dummy.rotation.set(Math.sin(a) * 0.28, a, Math.cos(a) * 0.28);
        dummy.scale.set(1, 0.7 + (b % 3) * 0.28, 1);
        dummy.updateMatrix();
        reedInst.setMatrixAt(reedIdx++, dummy.matrix);
      }
    });
    reedInst.instanceMatrix.needsUpdate = true;
    this.scene.add(reedInst);
  }

  /**
   * Sunlit Giza sister pyramids framing the distant golden horizon.
   */
  _buildSisterPyramids() {
    const pyrMat = new THREE.MeshStandardMaterial({
      map: this.limestonePbr.map,
      normalMap: this.limestonePbr.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughnessMap: this.limestonePbr.roughnessMap,
      color: 0xf4d698,
      roughness: 1.0,
      metalness: 0.03
    });

    const buildSteppedPyramid = (baseSize, layers, posX, posZ) => {
      const g = new THREE.Group();
      const stepH = (baseSize * 0.64) / layers;
      for (let i = 0; i < layers; i++) {
        const w = baseSize * (1 - i / layers);
        const tierGeo = new THREE.BoxGeometry(w, stepH * 0.96, w);
        const tier = new THREE.Mesh(tierGeo, pyrMat);
        tier.position.y = (i + 0.5) * stepH;
        g.add(tier);
      }
      const capW = (baseSize / layers) * 1.48;
      const capGeo = new THREE.ConeGeometry(capW * 0.72, stepH * 1.65, 4);
      capGeo.rotateY(Math.PI * 0.25);
      const cap = new THREE.Mesh(capGeo, this.goldMaterial);
      cap.position.y = layers * stepH + stepH * 0.68;
      g.add(cap);

      g.position.set(posX, 0, posZ);
      this.scene.add(g);
    };

    buildSteppedPyramid(94, 16, -205, -190);
    buildSteppedPyramid(64, 13, 125, -245);
  }

  /**
   * Sculpted Multi-Tiered Stratified Sandstone Quarry Cliffs with horizontal strata ridges,
   * baked crevice AO, timber quarry shoring beams, iron/bronze brackets, and coiled hemp rope.
   */
  _buildSculptedQuarryCliff() {
    const group = new THREE.Group();

    const crags = [
      { x: -24.8, y: 1.85, z: 122.0, w: 6.4, h: 3.9, d: 14.2, seed: 1.1 },
      { x: -27.6, y: 4.55, z: 122.2, w: 7.2, h: 4.8, d: 16.0, seed: 2.7 },
      { x: -30.5, y: 7.40, z: 121.6, w: 7.6, h: 5.6, d: 17.4, seed: 4.3 },
      { x: -23.4, y: 1.50, z: 115.6, w: 4.8, h: 3.1, d: 5.8,  seed: 5.8 },
      { x: -23.6, y: 1.65, z: 128.4, w: 5.0, h: 3.4, d: 6.0,  seed: 7.2 },
      { x: -26.2, y: 3.70, z: 114.2, w: 5.4, h: 3.6, d: 5.2,  seed: 8.9 },
      { x: -25.8, y: 3.90, z: 129.6, w: 5.6, h: 3.9, d: 5.5,  seed: 10.4 }
    ];

    crags.forEach((c) => {
      const geo = createSculptedCliffGeometry(c.w, c.h, c.d, c.seed);
      const mesh = new THREE.Mesh(geo, this.cliffMaterial);
      mesh.position.set(c.x, c.y, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    });

    // Timber quarry bracing frame with bolted dark bronze brackets & cross-beam
    const postGeo = new THREE.CylinderGeometry(0.14, 0.17, 4.4, 8);
    const bracketGeo = new THREE.BoxGeometry(0.36, 0.24, 0.36);
    for (const pz of [116.0, 128.0]) {
      const post = new THREE.Mesh(postGeo, this.woodMaterial);
      post.position.set(-21.1, 2.2, pz);
      post.castShadow = true;
      group.add(post);

      const baseBr = new THREE.Mesh(bracketGeo, this.bronzeMaterial);
      baseBr.position.set(-21.1, 0.15, pz);
      group.add(baseBr);

      const topBr = new THREE.Mesh(bracketGeo, this.bronzeMaterial);
      topBr.position.set(-21.1, 4.1, pz);
      group.add(topBr);
    }

    // Overhead cedar crane crossbeam + coiled braided hemp hoist rope
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.30, 12.6), this.woodMaterial);
    beam.position.set(-21.1, 4.25, 122.0);
    beam.castShadow = true;
    group.add(beam);

    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.12, 8, 16), this.ropeMaterial);
    coil.rotation.x = Math.PI * 0.5;
    coil.position.set(-20.4, 0.14, 117.2);
    coil.castShadow = true;
    group.add(coil);

    // Engraved gilded quarry marker plaque
    const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.68, 2.5), this.goldMaterial);
    plaque.position.set(-21.25, 3.6, 122.0);
    group.add(plaque);

    this.quarryGroup = group;
    this.scene.add(group);
  }

  /**
   * Detailed Stonemason Carving Workbench with weathered cedar joinery,
   * bronze corner brackets, striped Egyptian linen awning, and sculpted mallet/chisel.
   */
  _buildCarvingBench() {
    const group = new THREE.Group();
    group.position.copy(this.stations.bench.position);

    // Thick cedar plank workbench top + bronze end-cap brackets
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.45, 0.24, 2.12), this.woodMaterial);
    top.position.y = 0.96;
    top.castShadow = true;
    top.receiveShadow = true;
    group.add(top);

    const endCapGeo = new THREE.BoxGeometry(0.12, 0.28, 2.18);
    for (const sx of [-1.72, 1.72]) {
      const cap = new THREE.Mesh(endCapGeo, this.bronzeMaterial);
      cap.position.set(sx, 0.96, 0);
      group.add(cap);
    }

    // Mortise-and-tenon legs + lower stretcher rail + diagonal braces
    const legGeo = new THREE.BoxGeometry(0.22, 0.96, 0.22);
    for (const lx of [-1.42, 1.42]) {
      for (const lz of [-0.78, 0.78]) {
        const leg = new THREE.Mesh(legGeo, this.woodMaterial);
        leg.position.set(lx, 0.48, lz);
        leg.castShadow = true;
        group.add(leg);

        const collar = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.14, 0.27), this.bronzeMaterial);
        collar.position.set(lx, 0.78, lz);
        group.add(collar);
      }
    }
    const stretcher = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.14, 0.16), this.woodMaterial);
    stretcher.position.set(0, 0.34, 0);
    group.add(stretcher);

    // Canopy cedar posts & striped Egyptian woven linen awning
    const poleGeo = new THREE.CylinderGeometry(0.075, 0.09, 3.35, 8);
    for (const lx of [-1.58, 1.58]) {
      for (const lz of [-0.92, 0.92]) {
        const pole = new THREE.Mesh(poleGeo, this.woodMaterial);
        pole.position.set(lx, 1.68, lz);
        pole.castShadow = true;
        group.add(pole);

        const finial = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), this.goldMaterial);
        finial.position.set(lx, 3.38, lz);
        group.add(finial);
      }
    }

    const canopyGeo = new THREE.PlaneGeometry(3.9, 2.65, 8, 4);
    canopyGeo.rotateX(-Math.PI * 0.5);
    const cPos = canopyGeo.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const cx = cPos.getX(i);
      const cz = cPos.getZ(i);
      // Gentle natural fabric sag between roof poles
      const sag = Math.cos((cx / 1.95) * Math.PI * 0.5) * Math.cos((cz / 1.32) * Math.PI * 0.5) * -0.18;
      cPos.setY(i, sag);
    }
    canopyGeo.computeVertexNormals();
    const canopy = new THREE.Mesh(canopyGeo, this.linenMaterial);
    canopy.position.set(0, 3.32, 0);
    canopy.rotation.x = 0.08;
    canopy.castShadow = true;
    group.add(canopy);

    // Sculpted carpenter's mallet & bronze chisel on benchtop
    const malletHead = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.28, 8), this.woodMaterial);
    malletHead.rotation.z = Math.PI * 0.5;
    malletHead.position.set(1.12, 1.18, 0.48);
    group.add(malletHead);

    const malletHandle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 0.34, 7), this.woodMaterial);
    malletHandle.rotation.x = Math.PI * 0.45;
    malletHandle.position.set(1.12, 1.14, 0.66);
    group.add(malletHandle);

    const chisel = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.44), this.copperMaterial);
    chisel.position.set(1.22, 1.11, -0.15);
    chisel.rotation.y = 0.38;
    group.add(chisel);

    // Active stone block resting on workbench
    const roughGeo = new THREE.DodecahedronGeometry(0.56, 0);
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
   * Wide timber construction ramps with wood-grain PBR, cross-cleats, and bolted bronze joinery.
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

      const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.24, length), this.woodMaterial);
      deck.position.set(cx, cy - 0.1, cz);
      deck.rotation.x = angle;
      deck.castShadow = true;
      deck.receiveShadow = true;
      group.add(deck);

      // Side curb guard beams + bronze strap brackets
      const railGeo = new THREE.BoxGeometry(0.24, 0.36, length);
      for (const side of [-1, 1]) {
        const rail = new THREE.Mesh(railGeo, this.woodMaterial);
        rail.position.set(cx + side * (width * 0.5 - 0.13), cy + 0.13, cz);
        rail.rotation.x = angle;
        rail.castShadow = true;
        group.add(rail);
      }

      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const frac = i / steps;
        const pz = r.zStart - run * frac;
        const ph = r.yStart + rise * frac;
        const postGeo = new THREE.BoxGeometry(0.28, ph, 0.28);
        for (const side of [-1, 1]) {
          const post = new THREE.Mesh(postGeo, this.woodMaterial);
          post.position.set(cx + side * (width * 0.44), ph * 0.5, pz);
          post.castShadow = true;
          group.add(post);

          const strap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.34), this.bronzeMaterial);
          strap.position.set(cx + side * (width * 0.44), ph - 0.12, pz);
          group.add(strap);
        }
      }
    });

    this.scene.add(group);
  }

  /**
   * Fortnite-style Egyptian Camp Props: Striped Linen Tents, Clay Amphora Clusters,
   * Wooden Tool Racks, Scaffolds with Woven Baskets, and Fluttering Hieroglyphic Banners.
   */
  _buildCampPropsAndBanners() {
    const group = new THREE.Group();
    const basketMat = new THREE.MeshStandardMaterial({
      color: 0xc28a46,
      normalMap: this.ropeMaterial.normalMap,
      roughness: 0.9
    });

    // 1. Striped Egyptian Linen Tents with guy-ropes & bronze finials
    const tents = [
      { x: 26, z: 126, rot: -0.35 },
      { x: 34, z: 117, rot: -0.75 },
      { x: -24, z: 138, rot: 0.45 }
    ];
    tents.forEach((t) => {
      const tent = new THREE.Group();
      tent.position.set(t.x, 0, t.z);
      tent.rotation.y = t.rot;

      const roof = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.35, 4), this.linenMaterial);
      roof.position.y = 3.1;
      roof.rotation.y = Math.PI * 0.25;
      roof.castShadow = true;
      tent.add(roof);

      const finial = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.45, 6), this.goldMaterial);
      finial.position.y = 4.42;
      tent.add(finial);

      const poleGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.1, 7);
      for (const sx of [-2.0, 2.0]) {
        for (const sz of [-2.0, 2.0]) {
          const p = new THREE.Mesh(poleGeo, this.woodMaterial);
          p.position.set(sx, 1.05, sz);
          p.castShadow = true;
          tent.add(p);
        }
      }
      group.add(tent);
    });

    // 2. Lathe-Turned Clay Amphora Clusters around camp tents & workbench
    const amphGeo = createAmphoraGeometry();
    const amphCoords = [
      [-9.0, 122.4, 1.0], [-9.6, 121.7, 0.84], [-8.8, 121.3, 0.78],
      [23.2, 124.2, 1.05], [24.0, 123.8, 0.85], [23.6, 125.0, 0.92],
      [10.8, 114.6, 0.9], [-11.4, 114.9, 0.95]
    ];
    amphCoords.forEach(([ax, az, sc]) => {
      const jar = new THREE.Mesh(amphGeo, this.terracottaMaterial);
      jar.position.set(ax, 0, az);
      jar.scale.setScalar(sc);
      jar.castShadow = true;
      jar.receiveShadow = true;
      group.add(jar);
    });

    // 3. Wooden Scaffolds with Woven Baskets & Bronze Brackets
    const scaffolds = [
      [10.2, 113.5], [-10.5, 114.2], [20.5, 114.0]
    ];
    scaffolds.forEach(([sx, sz]) => {
      const sc = new THREE.Group();
      sc.position.set(sx, 0, sz);

      const deck = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.14, 1.45), this.woodMaterial);
      deck.position.y = 1.35;
      deck.castShadow = true;
      sc.add(deck);

      const legGeo = new THREE.BoxGeometry(0.13, 1.35, 0.13);
      for (const lx of [-0.74, 0.74]) {
        for (const lz of [-0.58, 0.58]) {
          const l = new THREE.Mesh(legGeo, this.woodMaterial);
          l.position.set(lx, 0.675, lz);
          l.castShadow = true;
          sc.add(l);
        }
      }

      const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.37, 0.27, 0.42, 12), basketMat);
      basket.position.set(0.16, 1.62, 0.05);
      basket.castShadow = true;
      sc.add(basket);

      group.add(sc);
    });

    // 4. Wooden Tool Rack beside the Carving Bench
    const rack = new THREE.Group();
    rack.position.set(-2.5, 0, 123.6);
    rack.rotation.y = -0.3;
    for (const rx of [-0.85, 0.85]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.75, 0.12), this.woodMaterial);
      p.position.set(rx, 0.88, 0);
      p.castShadow = true;
      rack.add(p);
    }
    const crossBar = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.12, 0.12), this.woodMaterial);
    crossBar.position.set(0, 1.45, 0);
    rack.add(crossBar);
    // Leaning copper picks on tool rack
    for (const tx of [-0.45, 0.0, 0.45]) {
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.35, 6), this.woodMaterial);
      handle.position.set(tx, 0.72, 0.18);
      handle.rotation.x = -0.22;
      rack.add(handle);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.06), this.copperMaterial);
      blade.position.set(tx, 1.32, 0.05);
      rack.add(blade);
    }
    group.add(rack);

    // 5. Fluttering Hieroglyphic Royal Banners flanking the South Pyramid Plaza!
    const bannerSpots = [
      [-9.5, 109.5, 0.12],
      [9.5, 109.5, -0.12],
      [-19.5, 111.5, 0.35],
      [21.0, 111.5, -0.35]
    ];
    const bannerGeo = new THREE.PlaneGeometry(1.35, 3.1, 6, 12);
    bannerSpots.forEach(([bx, bz, rotY], idx) => {
      const bGroup = new THREE.Group();
      bGroup.position.set(bx, 0, bz);
      bGroup.rotation.y = rotY;

      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.10, 5.4, 8), this.woodMaterial);
      pole.position.y = 2.7;
      pole.castShadow = true;
      bGroup.add(pole);

      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), this.bronzeMaterial);
      arm.rotation.z = Math.PI * 0.5;
      arm.position.set(0, 5.05, 0);
      bGroup.add(arm);

      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), this.goldMaterial);
      orb.position.set(0, 5.5, 0);
      bGroup.add(orb);

      const uniforms = {
        uTime: { value: 0 },
        uPhase: { value: idx * 1.6 },
        uMap: { value: this.bannerTexture }
      };
      this.bannerUniforms.push(uniforms);

      const clothMat = new THREE.ShaderMaterial({
        uniforms,
        side: THREE.DoubleSide,
        vertexShader: `
          uniform float uTime;
          uniform float uPhase;
          varying vec2 vUv;
          varying float vShade;
          void main() {
            vUv = uv;
            vec3 p = position;
            float hang = 1.0 - uv.y; // 0 at top bar -> 1 at bottom hem
            float wave = sin(hang * 5.0 - uTime * 3.4 + uPhase) * 0.18 * hang
                       + cos(p.x * 3.2 - uTime * 2.2 + uPhase) * 0.06 * hang;
            p.z += wave;
            vShade = 0.88 + wave * 0.7;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: `
          uniform sampler2D uMap;
          varying vec2 vUv;
          varying float vShade;
          void main() {
            vec4 tex = texture2D(uMap, vUv);
            gl_FragColor = vec4(tex.rgb * vShade, 1.0);
          }
        `
      });
      const cloth = new THREE.Mesh(bannerGeo, clothMat);
      cloth.position.set(0, 3.45, 0.08);
      bGroup.add(cloth);

      group.add(bGroup);
    });

    // 6. Neatly stacked reserve beveled limestone blocks near camp perimeter
    const decoBlockGeo = createBeveledBlockGeometry(1.44, 0.13);
    const stacks = [
      [-15.5, 0.72, 130], [-14.0, 0.72, 130.2], [-14.7, 2.16, 130.1],
      [22.5, 0.72, 131], [24.0, 0.72, 131.1], [23.2, 2.16, 131.0]
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
   * Sculpted Egyptian Lotus Bronze & Stone Brazier Fire Bowls with glowing coals & flickering embers.
   */
  _buildBraziers() {
    const locations = [
      [19.5, 123.5],
      [-15.5, 124.5],
      [2.0, 128.5]
    ];

    const coalMat = new THREE.MeshBasicMaterial({ color: 0xff5a14 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa826 });
    const innerMat = new THREE.MeshBasicMaterial({ color: 0xfff3a3 });

    locations.forEach(([fx, fz], idx) => {
      const g = new THREE.Group();
      g.position.set(fx, 0, fz);

      // Pedestal + fluted bronze fire bowl
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 0.45, 8), this.carvedStoneMaterial);
      base.position.y = 0.22;
      base.castShadow = true;
      g.add(base);

      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.34, 0.42, 10), this.bronzeMaterial);
      bowl.position.y = 0.62;
      bowl.castShadow = true;
      g.add(bowl);

      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.055, 6, 14), this.goldMaterial);
      rim.rotation.x = Math.PI * 0.5;
      rim.position.y = 0.82;
      g.add(rim);

      const coals = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.35, 0.14, 8), coalMat);
      coals.position.y = 0.80;
      g.add(coals);

      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 6), flameMat);
      flame.position.y = 1.24;
      g.add(flame);

      const core = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.58, 6), innerMat);
      core.position.y = 1.12;
      g.add(core);

      let light = null;
      if (idx === 2) {
        light = new THREE.PointLight(0xff9430, 4.2, 22, 1.4);
        light.position.y = 1.65;
        g.add(light);
      }

      this.scene.add(g);
      this.campfires.push({ flame, core, light, pos: new THREE.Vector3(fx, 1.1, fz), phase: idx * 2.1 });
    });

    // Rising glowing ember sparks above braziers
    const emberCount = 36;
    const ePos = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      const cf = this.campfires[i % this.campfires.length];
      ePos[i * 3]     = cf.pos.x + (Math.random() - 0.5) * 0.5;
      ePos[i * 3 + 1] = cf.pos.y + Math.random() * 2.6;
      ePos[i * 3 + 2] = cf.pos.z + (Math.random() - 0.5) * 0.5;
    }
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3));
    const eMat = new THREE.PointsMaterial({
      color: 0xffd066,
      size: 0.14,
      transparent: true,
      opacity: 0.88,
      depthWrite: false
    });
    this.emberPoints = new THREE.Points(eGeo, eMat);
    this.scene.add(this.emberPoints);
  }

  /**
   * Atmospheric golden desert dust motes using soft radial dust sprites (zero harsh squares!).
   */
  _buildAtmosphericDust() {
    const count = 160;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 96;
      positions[i * 3 + 1] = 0.5 + Math.random() * 14;
      positions[i * 3 + 2] = 76 + Math.random() * 72;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.dustSpriteTexture,
      color: 0xffe8b5,
      size: 0.48,
      transparent: true,
      opacity: 0.38,
      depthWrite: false
    });
    this.dustPoints = new THREE.Points(geo, mat);
    this.scene.add(this.dustPoints);
  }

  /**
   * Updates animated desert world (Nile shimmer, swaying palms, fluttering banners,
   * flickering braziers + rising embers, soft dust motes, shadow tracking, menu camera).
   */
  update(dt, state, pyramidBuilder, playerPos) {
    this.elapsed += dt;

    // 1. Shimmering Nile water shader clock
    if (this.nileUniforms) {
      this.nileUniforms.uTime.value = this.elapsed;
    }

    // 2. Fluttering hieroglyphic royal banners
    for (const u of this.bannerUniforms) {
      u.uTime.value = this.elapsed;
    }

    // 3. GPU swaying instanced date-palm fronds
    if (this.frondUniforms) {
      this.frondUniforms.uTime.value = this.elapsed;
    }

    // 4. Flickering braziers & rising ember particles
    for (const cf of this.campfires) {
      const f = 0.86 + Math.sin(this.elapsed * 9.5 + cf.phase) * 0.14 + Math.cos(this.elapsed * 15.2 + cf.phase) * 0.08;
      cf.flame.scale.set(0.95 + (f - 0.85) * 0.5, f * 1.1, 0.95 + (f - 0.85) * 0.5);
      cf.core.scale.setScalar(0.9 + (f - 0.85) * 0.7);
      if (cf.light) cf.light.intensity = 3.2 + f * 1.6;
    }
    if (this.emberPoints) {
      const arr = this.emberPoints.geometry.attributes.position.array;
      for (let i = 0; i < arr.length / 3; i++) {
        const cf = this.campfires[i % this.campfires.length];
        arr[i * 3 + 1] += dt * (0.95 + (i % 4) * 0.25);
        arr[i * 3] += Math.sin(this.elapsed * 3.2 + i) * dt * 0.22;
        if (arr[i * 3 + 1] > cf.pos.y + 3.0) {
          arr[i * 3]     = cf.pos.x + (Math.random() - 0.5) * 0.45;
          arr[i * 3 + 1] = cf.pos.y;
          arr[i * 3 + 2] = cf.pos.z + (Math.random() - 0.5) * 0.45;
        }
      }
      this.emberPoints.geometry.attributes.position.needsUpdate = true;
    }

    // 5. Drifting sunlit dust motes
    if (this.dustPoints) {
      const arr = this.dustPoints.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i] += dt * 0.55;
        arr[i + 1] += Math.sin(this.elapsed * 0.7 + i) * dt * 0.12;
        if (arr[i] > 48) arr[i] = -48;
      }
      this.dustPoints.geometry.attributes.position.needsUpdate = true;
    }

    // 6. Keep directional shadow frustum tightly tracking the player
    if (state === 'PLAYING' && playerPos) {
      this.sunLight.target.position.set(playerPos.x, Math.max(0, playerPos.y), playerPos.z);
      this.sunLight.position.set(playerPos.x + 65, Math.max(40, playerPos.y + 70), playerPos.z + 52);
    }

    // 7. Scenic orbiting golden-hour camera on the Main Menu
    if (state === 'MENU') {
      this.menuOrbitAngle += dt * 0.12;
      const hasMajorPyramid = pyramidBuilder && pyramidBuilder.placedCount >= 25;
      if (hasMajorPyramid) {
        const radius = 54 + Math.min(90, pyramidBuilder.highestLayer * 1.4);
        const cx = Math.sin(this.menuOrbitAngle) * radius;
        const cz = 96 + Math.cos(this.menuOrbitAngle) * 38;
        const cy = 18 + Math.min(48, pyramidBuilder.highestLayer * 0.75);
        this.camera.position.set(cx, cy, cz);
        this.camera.lookAt(0, 6 + pyramidBuilder.highestLayer * 0.4, 92);
      } else {
        const sway = Math.sin(this.menuOrbitAngle * 1.1) * 18;
        this.camera.position.set(20 + sway, 14.5, 146);
        this.camera.lookAt(-15 + sway * 0.2, 7.5, 65);
      }
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
