# PHARAOH'S MONOLITH 3D

A tactile, hands-on 3D mobile web game built with Vanilla ES6, Three.js, and Vite — construct the **1,005,840-block Great Pyramid** stone by stone (144×144 base, 144 stepped layers, 1.5m beveled limestone blocks, crowned with the Golden Pyramidion apex).

## Features
- **1,005,840 Walkable Blocks at 60 FPS**: Single `THREE.InstancedMesh` with compacted active slot updates, flat `Uint8Array(144×144×144)` O(1) collision with 1-block auto-step stair climbing, and compact RLE `localStorage` persistence.
- **Tactile 4-Step Historical Loop (100% Hands-On)**:
  1. **Quarry Cliff Mining** — Copper pickaxe strikes break loose physical rigid-body tumbling sandstone blocks.
  2. **Stonemason Carving Bench** — Chisel rough limestone into smooth beveled sand-yellow blocks.
  3. **Wet-Sand Wooden Sled** — Spring-damped medieval-cart towing physics with front clay water jar pouring a glistening wet-sand glide trail.
  4. **Inside-the-Pyramid Placement** — 3D DDA voxel raycasting, glowing golden wireframe preview, Master Architect multi-block brushes (`1×1` → `5×5`), and smooth 0.3s cubic ease-out arcs.
- **Egyptian Papyrus UI & FTB-Quests-Style Codex**: 5 progressive chapters + Ultimate Trials (*The Eternal Sled*, *Skyward Ascent*, *The One Million Monolith*).
- **Zero-External-Audio Web Audio Synthesizer** & iPhone 16e PWA Home Screen support (`icon-512.png`, `manifest.json`).

## Development & Build
```bash
npm install
npm run dev
npm run build
```