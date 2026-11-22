import * as THREE from 'three';

/**
 * ProceduralPBR — High-definition 512x512 procedural Canvas PBR texture generator
 * (Albedo + Sobel Tangent-Space Normal Map + Roughness Map) + stylized PMREM sky envMap
 * + custom sand micro-sparkle shader injection. Zero external image dependencies.
 */

function createRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Smooth tileable 2D value noise in [0, 1] */
function makeTileableNoise(gridSize, seed) {
  const rand = createRng(seed);
  const g = new Float32Array(gridSize * gridSize);
  for (let i = 0; i < g.length; i++) g[i] = rand();

  return (u, v) => {
    const x = ((u % 1) + 1) % 1 * gridSize;
    const y = ((v % 1) + 1) % 1 * gridSize;
    const x0 = Math.floor(x) % gridSize;
    const y0 = Math.floor(y) % gridSize;
    const x1 = (x0 + 1) % gridSize;
    const y1 = (y0 + 1) % gridSize;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);

    const n00 = g[y0 * gridSize + x0];
    const n10 = g[y0 * gridSize + x1];
    const n01 = g[y1 * gridSize + x0];
    const n11 = g[y1 * gridSize + x1];
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
  };
}

/**
 * Bakes a tileable Sobel tangent-space Normal Map CanvasTexture from a Float32Array heightfield.
 */
function heightToNormalTexture(height, size, strength = 2.5, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const mask = size - 1;

  for (let y = 0; y < size; y++) {
    const ym = (y - 1) & mask;
    const yp = (y + 1) & mask;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1) & mask;
      const xp = (x + 1) & mask;

      const tl = height[ym * size + xm];
      const t  = height[ym * size + x];
      const tr = height[ym * size + xp];
      const l  = height[y * size + xm];
      const r  = height[y * size + xp];
      const bl = height[yp * size + xm];
      const b  = height[yp * size + x];
      const br = height[yp * size + xp];

      const dx = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dy = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * size + x) * 4;
      d[idx]     = Math.round((-dx * invLen * 0.5 + 0.5) * 255);
      d[idx + 1] = Math.round((-dy * invLen * 0.5 + 0.5) * 255);
      d[idx + 2] = Math.round(( dz * invLen * 0.5 + 0.5) * 255);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Converts a Float32Array [0..1] roughness field into a grayscale CanvasTexture */
function fieldToGrayTexture(field, size, repeat = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let i = 0; i < size * size; i++) {
    const v = Math.max(0, Math.min(255, Math.round(field[i] * 255)));
    const idx = i * 4;
    d[idx] = v;
    d[idx + 1] = v;
    d[idx + 2] = v;
    d[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

function finalizeColorTexture(canvas, repeat = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeat !== 1) tex.repeat.set(repeat, repeat);
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates a lightweight stylized Golden-Hour Desert PMREM Environment Map
 * so metallic copper tools, bronze brackets, and the golden Pyramidion gleam naturally.
 */
export function createDesertEnvMap(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();

  const envScene = new THREE.Scene();
  const skyGeo = new THREE.SphereGeometry(50, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `
      varying vec3 vPos;
      void main() {
        vPos = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      void main() {
        float y = vPos.y;
        vec3 zenith = vec3(0.32, 0.62, 0.92);
        vec3 horizon = vec3(1.0, 0.84, 0.56);
        vec3 ground = vec3(0.76, 0.55, 0.30);
        vec3 col = y >= 0.0
          ? mix(horizon, zenith, pow(clamp(y, 0.0, 1.0), 0.55))
          : mix(horizon * 0.92, ground, pow(clamp(-y, 0.0, 1.0), 0.45));
        vec3 sunDir = normalize(vec3(0.58, 0.34, 0.65));
        float sun = max(dot(vPos, sunDir), 0.0);
        col += vec3(1.0, 0.94, 0.72) * pow(sun, 22.0) * 2.4;
        gl_FragColor = vec4(col, 1.0);
      }
    `
  });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  const envRT = pmrem.fromScene(envScene, 0.04);
  skyGeo.dispose();
  skyMat.dispose();
  pmrem.dispose();
  return envRT.texture;
}

/**
 * 1. STYLIZED DESERT SAND PBR (512x512 Albedo + Wind-Ripple Normal + Roughness + Micro-Sparkle Shader)
 */
export function createDesertSandMaterial(repeat = 46) {
  const size = 512;
  const nLow = makeTileableNoise(8, 101);
  const nMid = makeTileableNoise(24, 202);
  const nFine = makeTileableNoise(64, 303);

  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const twoPi = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const warp = nLow(u, v) * 0.45 + nMid(u, v) * 0.12;
      // Asymmetric wind-swept desert sand ripples
      const phase = (v * 14 + u * 2 + warp * 2.6) * twoPi;
      const ripple = Math.sin(phase) * 0.5 + 0.5;
      const sharpCrest = Math.pow(ripple, 1.45);
      const grain = nFine(u, v);

      const h = sharpCrest * 0.72 + nMid(u, v) * 0.18 + grain * 0.10;
      height[i] = h;
      rough[i] = 0.76 + (1 - sharpCrest) * 0.16 + (grain - 0.5) * 0.06;

      // Stylized warm golden-ochre palette (Fortnite desert warmth)
      const tone = nLow(u + 0.3, v + 0.2);
      const baseR = 224 + tone * 20 + (sharpCrest - 0.5) * 24 + (grain - 0.5) * 10;
      const baseG = 178 + tone * 18 + (sharpCrest - 0.5) * 20 + (grain - 0.5) * 9;
      const baseB = 109 + tone * 14 + (sharpCrest - 0.5) * 16 + (grain - 0.5) * 8;

      const idx = i * 4;
      d[idx]     = Math.max(0, Math.min(255, baseR));
      d[idx + 1] = Math.max(0, Math.min(255, baseG));
      d[idx + 2] = Math.max(0, Math.min(255, baseB));
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  const map = finalizeColorTexture(canvas, repeat);
  const normalMap = heightToNormalTexture(height, size, 2.8, repeat);
  const roughnessMap = fieldToGrayTexture(rough, size, repeat);

  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap,
    roughness: 1.0,
    metalness: 0.03,
    vertexColors: true
  });

  // Custom micro-sparkle sand glint shader as the camera moves across sunlit desert grains
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vSandWorldPos;`
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
         vSandWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vSandWorldPos;
         float sandHash(vec2 p) {
           p = fract(p * vec2(234.34, 435.345));
           p += dot(p, p + 34.23);
           return fract(p.x * p.y);
         }`
      )
      .replace(
        '#include <dithering_fragment>',
        `vec3 viewDirW = normalize(cameraPosition - vSandWorldPos);
         vec3 sunDirW = normalize(vec3(0.60, 0.55, 0.58));
         vec2 grainCell = floor(vSandWorldPos.xz * 11.5);
         float h1 = sandHash(grainCell);
         float h2 = sandHash(grainCell + 19.7);
         vec3 microN = normalize(vec3((h1 - 0.5) * 0.75, 1.0, (h2 - 0.5) * 0.75));
         vec3 halfV = normalize(viewDirW + sunDirW);
         float spec = pow(max(dot(microN, halfV), 0.0), 42.0);
         float distFade = 1.0 - smoothstep(10.0, 58.0, length(cameraPosition - vSandWorldPos));
         float sparkle = step(0.955, h1) * spec * distFade;
         gl_FragColor.rgb += vec3(1.0, 0.93, 0.72) * sparkle * 0.85;
         #include <dithering_fragment>`
      );
  };

  return mat;
}

/**
 * 2. TACTILE BEVELED SAND-YELLOW LIMESTONE BLOCK PBR (512x512 Albedo + Pore Normal + Roughness)
 * Preserves the exact warm sand-yellow palette (#EED296 to #E5C17B) with fine matte limestone
 * pores, gentle burnished bevel edges, and warm handcrafted contact shading.
 */
export function createLimestoneBlockPBR() {
  const size = 512;
  const nLow = makeTileableNoise(8, 404);
  const nMid = makeTileableNoise(24, 505);
  const nPore = makeTileableNoise(96, 606);

  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    const edgeY = Math.min(v, 1 - v);
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const edgeX = Math.min(u, 1 - u);
      const edgeDist = Math.min(edgeX, edgeY);
      const i = y * size + x;

      // Soft limestone sedimentary warmth + delicate micro-pores (no harsh cracks)
      const band = Math.sin((v * 5 + nLow(u, v) * 0.45) * Math.PI * 2) * 0.5 + 0.5;
      const low = nLow(u, v);
      const mid = nMid(u, v);
      const poreRaw = nPore(u, v);
      const porePit = poreRaw < 0.14 ? (0.14 - poreRaw) * 2.1 : 0;

      // Subtle bevel edge wear highlight + warm mortar contact shadow at outermost 3% rim
      const wearBand = Math.exp(-Math.pow((edgeDist - 0.055) / 0.025, 2));
      const contactRim = edgeDist < 0.024 ? (1 - edgeDist / 0.024) : 0;

      height[i] = 0.65 + band * 0.08 + mid * 0.12 - porePit * 0.35 - contactRim * 0.22;
      rough[i] = 0.80 + (1 - wearBand) * 0.09 + porePit * 0.12;

      // Clean warm sand-yellow (#F2D89E to #E4BF78)
      let r = 236 + (low - 0.5) * 14 + (band - 0.5) * 8 + wearBand * 13 - contactRim * 28 - porePit * 22;
      let g = 207 + (low - 0.5) * 13 + (band - 0.5) * 7 + wearBand * 11 - contactRim * 26 - porePit * 20;
      let b = 144 + (low - 0.5) * 11 + (band - 0.5) * 6 + wearBand * 9  - contactRim * 22 - porePit * 16;

      const idx = i * 4;
      d[idx]     = Math.max(0, Math.min(255, r));
      d[idx + 1] = Math.max(0, Math.min(255, g));
      d[idx + 2] = Math.max(0, Math.min(255, b));
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return {
    map: finalizeColorTexture(canvas, 1),
    normalMap: heightToNormalTexture(height, size, 1.9, 1),
    roughnessMap: fieldToGrayTexture(rough, size, 1)
  };
}

/**
 * 3. SCULPTED STRATIFIED QUARRY CLIFF PBR (512x512 Albedo + Deep Strata Normal + Roughness)
 * Horizontal sedimentary strata layers, diagonal chisel tool marks, and rich AO crevices.
 */
export function createQuarryCliffMaterial() {
  const size = 512;
  const nLow = makeTileableNoise(8, 707);
  const nMid = makeTileableNoise(24, 808);
  const nFine = makeTileableNoise(64, 909);

  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      // Stepped horizontal sedimentary strata + organic rock warping
      const warp = nLow(u, v) * 0.14 + nMid(u, v) * 0.04;
      const sv = (v + warp) * 9.0;
      const strataFract = sv - Math.floor(sv);
      const strataCrevice = Math.exp(-Math.pow(Math.min(strataFract, 1 - strataFract) / 0.055, 2));
      const strataStep = Math.sin(sv * Math.PI * 2) * 0.5 + 0.5;

      // Hand-chiseled diagonal quarry pick grooves
      const chisel = Math.sin((u * 38 + v * 22 + nMid(u, v) * 1.4) * Math.PI * 2) * 0.5 + 0.5;
      const chiselCut = Math.pow(chisel, 3.0) * 0.16;

      // Subtle vertical rock joint seams
      const crackNoise = Math.abs(nMid(u * 2, v * 0.5) - 0.5);
      const crack = crackNoise < 0.018 ? (1 - crackNoise / 0.018) * 0.55 : 0;

      const grain = nFine(u, v);
      const ao = 1.0 - strataCrevice * 0.30 - crack * 0.28;
      const h = strataStep * 0.52 + grain * 0.14 - strataCrevice * 0.36 - crack * 0.25 - chiselCut;

      height[i] = h;
      rough[i] = Math.min(1, 0.78 + strataCrevice * 0.18 + grain * 0.10);

      // Stylized Fortnite desert canyon strata palette (warm ochre, amber, sunlit terracotta ledges)
      const layerTint = Math.sin(Math.floor(sv) * 2.3) * 0.5 + 0.5;
      let r = (220 + layerTint * 22 + (grain - 0.5) * 14) * ao;
      let g = (172 + layerTint * 20 + (grain - 0.5) * 12) * ao;
      let b = (106 + layerTint * 15 + (grain - 0.5) * 10) * ao;

      // Crisp sunlit lip highlight just above each strata shelf
      if (strataFract > 0.06 && strataFract < 0.15) {
        r += 18; g += 15; b += 10;
      }

      const idx = i * 4;
      d[idx]     = Math.max(0, Math.min(255, r));
      d[idx + 1] = Math.max(0, Math.min(255, g));
      d[idx + 2] = Math.max(0, Math.min(255, b));
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return new THREE.MeshStandardMaterial({
    map: finalizeColorTexture(canvas, 2),
    normalMap: heightToNormalTexture(height, size, 2.4, 2),
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: fieldToGrayTexture(rough, size, 2),
    roughness: 1.0,
    metalness: 0.04,
    vertexColors: true
  });
}

/**
 * 4. WEATHERED STYLIZED CEDAR TIMBER PBR (512x512 Plank Albedo + Wood-Grain Normal + Roughness)
 */
export function createCedarWoodPBR() {
  const size = 512;
  const nLow = makeTileableNoise(8, 1111);
  const nGrain = makeTileableNoise(32, 1212);

  const height = new Float32Array(size * size);
  const rough = new Float32Array(size * size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  const planks = 6;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    const pPos = v * planks;
    const plankId = Math.floor(pPos);
    const pf = pPos - plankId;
    const seam = Math.min(pf, 1 - pf) < 0.032 ? 1.0 - Math.min(pf, 1 - pf) / 0.032 : 0;

    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const uOff = (u + plankId * 0.37) % 1;
      const ring = Math.sin((pf * 11 + nLow(uOff, v) * 3.2) * Math.PI * 2) * 0.5 + 0.5;
      const fiber = nGrain(uOff * 0.5, v * 4.0);
      const pVar = ((plankId * 73) % 10) / 10 - 0.5;

      const h = 0.65 + ring * 0.16 + fiber * 0.14 - seam * 0.65;
      height[i] = h;
      rough[i] = Math.min(1, 0.72 + (1 - ring) * 0.16 + seam * 0.2);

      const shade = (1 - seam * 0.58);
      const r = (164 + pVar * 22 + (ring - 0.5) * 26 + (fiber - 0.5) * 14) * shade;
      const g = (103 + pVar * 16 + (ring - 0.5) * 18 + (fiber - 0.5) * 10) * shade;
      const b = (54  + pVar * 10 + (ring - 0.5) * 12 + (fiber - 0.5) * 7) * shade;

      const idx = i * 4;
      d[idx]     = Math.max(0, Math.min(255, r));
      d[idx + 1] = Math.max(0, Math.min(255, g));
      d[idx + 2] = Math.max(0, Math.min(255, b));
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return new THREE.MeshStandardMaterial({
    map: finalizeColorTexture(canvas, 1),
    normalMap: heightToNormalTexture(height, size, 2.8, 1),
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap: fieldToGrayTexture(rough, size, 1),
    roughness: 1.0,
    metalness: 0.04
  });
}

/**
 * 5. BRAIDED HEMP ROPE PBR (256x256 diagonal twisted strand albedo + normal)
 */
export function createHempRopeMaterial() {
  const size = 256;
  const height = new Float32Array(size * size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;
      const braid = Math.sin((u * 8 + v * 16) * Math.PI * 2) * 0.5 + 0.5;
      const sub = Math.sin((u * 24 - v * 8) * Math.PI * 2) * 0.5 + 0.5;
      const h = braid * 0.78 + sub * 0.22;
      height[i] = h;
      const idx = i * 4;
      d[idx]     = Math.round(176 + h * 46);
      d[idx + 1] = Math.round(138 + h * 42);
      d[idx + 2] = Math.round(82  + h * 30);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return new THREE.MeshStandardMaterial({
    map: finalizeColorTexture(canvas, 4),
    normalMap: heightToNormalTexture(height, size, 3.2, 4),
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 0.92,
    metalness: 0.02
  });
}

/**
 * 6. STRIPED EGYPTIAN LINEN TENT CANOPY PBR (512x512 woven fabric + terracotta/lapis stripes)
 */
export function createStripedLinenMaterial() {
  const size = 512;
  const height = new Float32Array(size * size);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const i = y * size + x;

      const weave = (Math.sin(u * 140 * Math.PI) * 0.5 + 0.5) * 0.5 +
                    (Math.sin(v * 140 * Math.PI) * 0.5 + 0.5) * 0.5;
      const fold = Math.sin(u * 8 * Math.PI) * 0.25 + 0.5;
      height[i] = weave * 0.35 + fold * 0.65;

      // Warm cream linen with terracotta and lapis royal accent stripes
      const stripe = Math.floor(u * 8) % 4;
      let r = 244, g = 229, b = 194;
      if (stripe === 1) { r = 182; g = 74; b = 45; }
      else if (stripe === 3 && Math.abs((u * 8 % 1) - 0.5) < 0.16) { r = 42; g = 88; b = 148; }

      const wShade = 0.9 + weave * 0.12 - (1 - fold) * 0.08;
      const idx = i * 4;
      d[idx]     = Math.min(255, r * wShade);
      d[idx + 1] = Math.min(255, g * wShade);
      d[idx + 2] = Math.min(255, b * wShade);
      d[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  return new THREE.MeshStandardMaterial({
    map: finalizeColorTexture(canvas, 1),
    normalMap: heightToNormalTexture(height, size, 1.5, 1),
    roughness: 0.88,
    metalness: 0.02,
    side: THREE.DoubleSide
  });
}

/**
 * 7. SOFT VOLUMETRIC DUST CLOUD SPRITE TEXTURE (radial soft billow for block thuds & rock impacts)
 */
export function createSoftDustSpriteTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.clearRect(0, 0, size, size);
  // Layered soft organic puffs
  const blobs = [
    [64, 64, 54, 0.72],
    [48, 56, 36, 0.45],
    [80, 60, 34, 0.42],
    [62, 78, 36, 0.38]
  ];
  for (const [bx, by, br, alpha] of blobs) {
    const g = ctx.createRadialGradient(bx, by, 4, bx, by, br);
    g.addColorStop(0, `rgba(255, 245, 220, ${alpha})`);
    g.addColorStop(0.55, `rgba(240, 212, 160, ${alpha * 0.55})`);
    g.addColorStop(1, 'rgba(230, 195, 138, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(bx, by, br, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/**
 * 8. ROYAL HIEROGLYPHIC BANNER TEXTURE (gold, lapis, terracotta Eye-of-Horus banner)
 */
export function createRoyalBannerTexture() {
  const w = 256, h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');

  // Deep lapis-lazuli royal cloth
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#1D4684');
  bg.addColorStop(0.65, '#25569C');
  bg.addColorStop(1, '#183769');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Gold & terracotta border frame
  ctx.strokeStyle = '#F2C14B';
  ctx.lineWidth = 14;
  ctx.strokeRect(14, 14, w - 28, h - 54);
  ctx.strokeStyle = '#B84426';
  ctx.lineWidth = 5;
  ctx.strokeRect(28, 28, w - 56, h - 82);

  // Golden sun disc & stylized stepped pyramid emblem
  ctx.fillStyle = '#FFE07A';
  ctx.beginPath();
  ctx.arc(w / 2, 125, 38, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#E5AA34';
  ctx.beginPath();
  ctx.moveTo(w / 2, 195);
  ctx.lineTo(w - 58, 330);
  ctx.lineTo(58, 330);
  ctx.closePath();
  ctx.fill();

  // Horizontal stepped bands on pyramid emblem
  ctx.strokeStyle = '#8C5210';
  ctx.lineWidth = 4;
  for (let y = 230; y <= 315; y += 22) {
    ctx.beginPath();
    ctx.moveTo(64, y);
    ctx.lineTo(w - 64, y);
    ctx.stroke();
  }

  // Golden Eye of Horus line work at bottom
  ctx.strokeStyle = '#FFE48C';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(68, 385);
  ctx.quadraticCurveTo(w / 2, 350, w - 68, 385);
  ctx.quadraticCurveTo(w / 2, 415, 68, 385);
  ctx.stroke();
  ctx.fillStyle = '#FFE48C';
  ctx.beginPath();
  ctx.arc(w / 2, 385, 11, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
