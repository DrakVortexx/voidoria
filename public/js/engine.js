import * as THREE from "../vendor/three.module.js";

  const CHUNK = 16;
  const WORLD_H = 128;

  const COLORS = {
    1: 0x5fb04a, 2: 0x8a5a36, 3: 0x8a8a8a, 4: 0x6f6f6f, 5: 0x6b4a2a, 6: 0x3f9c35,
    7: 0xe8dba0, 8: 0x3d7ad6, 9: 0xb99666, 10: 0xbcd7e8, 11: 0x222222, 12: 0xf5f7fa,
    13: 0xa8d8f0, 14: 0xd8c699, 15: 0x7f7f7f, 16: 0x3a3a3a, 17: 0xd8b38a, 18: 0xf5cd42,
    19: 0x58e0c3, 20: 0x6b21a8, 21: 0x9d4ee6, 22: 0x2b2440, 23: 0x5b4ab0, 24: 0x3a8a32,
    25: 0xff7bd5, 26: 0x241a45, 27: 0x7b5cf6,
  };
  const OPAQUE = { 0: false, 6: false, 8: false, 10: false, 12: false, 13: false, 25: false };

  // voxel raycast (DDA)
  function raycast(origin, dir, getBlock, maxDist) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    let tMaxX = ((dir.x > 0 ? x + 1 - origin.x : origin.x - x) || 0) * tDeltaX;
    let tMaxY = ((dir.y > 0 ? y + 1 - origin.y : origin.y - y) || 0) * tDeltaY;
    let tMaxZ = ((dir.z > 0 ? z + 1 - origin.z : origin.z - z) || 0) * tDeltaZ;

    let t = 0;
    while (t < maxDist) {
      if (x < -5000 || x > 5000 || z < -5000 || z > 5000 || y < 0 || y >= WORLD_H) return null;
      const block = getBlock(x, y, z);
      if (block && OPAQUE[block] !== false) {
        return { x, y, z, prev: block };
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
      } else {
        if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; }
        else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; }
      }
    }
    return null;
  }

  class VoxelEngine {
    constructor(canvas) {
      this.canvas = canvas;
      this.scene = null; this.camera = null; this.renderer = null;
      this.chunkMeshes = new Map(); // "cx:cz" -> THREE.Mesh
      this.otherPlayers = new Map(); // id -> mesh
      this.blockCache = null; // dim + Map key->Uint8Array
      this.currentDimension = "overworld";
      this.position = { x: 8.5, y: 70, z: 8.5 };
      this.yaw = 0; this.pitch = 0;
      this.velocity = { x: 0, y: 0, z: 0 };
      this.keys = {};
      this.onGround = false;
      this.flying = false;
      this.socket = null;
      this.locked = false;
      this.raytLastPos = null;
    }

    init() {
      const canvas = this.canvas;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      this.renderer.setSize(window.innerWidth, window.innerHeight);
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x87ceeb);
      this.scene.fog = new THREE.Fog(0x87ceeb, 120, 500);

      this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      this.camera.rotation.order = "YXZ";

      const hemi = new THREE.HemisphereLight(0xffffff, 0x565658, 0.7);
      this.scene.add(hemi);
      const sun = new THREE.DirectionalLight(0xffffff, 0.9);
      sun.position.set(1, 2, 0.6);
      this.scene.add(sun);

      // simple sky grid reference
      this.highlightBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.001, 1.001, 1.001),
        new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.5 })
      );
      this.highlightBox.visible = false;
      this.scene.add(this.highlightBox);

      window.addEventListener("resize", () => this.onResize());
      this.setupControls();
    }

    onResize() {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    setupControls() {
      document.addEventListener("keydown", (e) => {
        this.keys[e.code] = true;
        if (e.code === "KeyF") this.flying = !this.flying;
        if (e.code === "Space" && !this.locked && !this.isMenuOpen()) { this.lock(); }
      });
      document.addEventListener("keyup", (e) => { this.keys[e.code] = false; });
      document.addEventListener("mousemove", (e) => {
        if (!this.locked) return;
        this.yaw -= e.movementX * 0.0022;
        this.pitch -= e.movementY * 0.0022;
        this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
      });
      document.addEventListener("mousedown", (e) => {
        if (!this.locked) return;
        if (e.button === 0) this.tryBreak();
        if (e.button === 2) this.tryPlace();
      });
      document.addEventListener("contextmenu", (e) => e.preventDefault());

      this.canvas.addEventListener("click", () => {
        if (!this.locked && !this.isMenuOpen()) this.lock();
      });
      document.addEventListener("pointerlockchange", () => {
        this.locked = document.pointerLockElement === this.canvas;
      });
    }

    isMenuOpen() {
      const m = document.getElementById("menu-overlay");
      return m && m.style.display !== "none";
    }

    lock() {
      if (document.pointerLockElement) return;
      this.canvas.requestPointerLock && this.canvas.requestPointerLock();
    }

    setSocket(socket) { this.socket = socket; }

    // ---------- world data ----------
    clearWorld() {
      for (const m of this.chunkMeshes.values()) this.scene.remove(m);
      this.chunkMeshes.clear();
      this.blockCache = null;
    }

    ensureCache(dim) {
      if (!this.blockCache) this.blockCache = new Map();
      return this.blockCache;
    }

    onChunk(data) {
      const k = `${data.cx}:${data.cz}`;
      const arr = typeof data.data === "string"
        ? new Uint8Array(atob(data.data).split("").map((c) => c.charCodeAt(0)))
        : data.data;
      this.ensureCache().set(k, arr);
      this.buildChunkMesh(data.cx, data.cz);
      this.ensureChunkNeighbors(data.cx, data.cz);
    }

    ensureChunkNeighbors(cx, cz) {
      for (const [dx, dz] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nk = `${cx+dx}:${cz+dz}`;
        if (this.chunkMeshes.has(nk)) this.rebuildChunkMesh(cx+dx, cz+dz);
      }
    }

    onUnloadChunk(data) {
      const k = `${data.cx}:${data.cz}`;
      const mesh = this.chunkMeshes.get(k);
      if (mesh) { this.scene.remove(mesh); mesh.geometry.dispose(); }
      this.chunkMeshes.delete(k);
      this.ensureCache().delete(k);
    }

    onBlockUpdate(data) {
      const cx = Math.floor(data.x / CHUNK); const cz = Math.floor(data.z / CHUNK);
      const lx = data.x - cx * CHUNK; const lz = data.z - cz * CHUNK;
      const cache = this.ensureCache();
      const k = `${cx}:${cz}`;
      const arr = cache.get(k);
      if (arr) {
        arr[(data.y * CHUNK + lz) * CHUNK + lx] = data.block;
        this.rebuildChunkMesh(cx, cz);
        this.ensureChunkNeighbors(cx, cz);
      }
    }

    getBlockAt(x, y, z) {
      if (y < 0 || y >= WORLD_H) return 0;
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
      const arr = this.ensureCache().get(`${cx}:${cz}`);
      if (!arr) return 0;
      return arr[(y * CHUNK + lz) * CHUNK + lx];
    }

    // ---------- meshing ----------
    rebuildChunkMesh(cx, cz) {
      const k = `${cx}:${cz}`;
      const old = this.chunkMeshes.get(k);
      if (old) { this.scene.remove(old); old.geometry.dispose(); old.material.dispose && old.material.dispose(); }
      this.chunkMeshes.delete(k);
      this.buildChunkMesh(cx, cz);
    }

    buildChunkMesh(cx, cz) {
      const cache = this.ensureCache();
      const k = `${cx}:${cz}`;
      const arr = cache.get(k);
      if (!arr) return;
      const mesher = new ChunkMesher();
      const baseX = cx * CHUNK, baseZ = cz * CHUNK;

      for (let y = 0; y < WORLD_H; y++) {
        for (let lz = 0; lz < CHUNK; lz++) {
          for (let lx = 0; lx < CHUNK; lx++) {
            const id = arr[(y * CHUNK + lz) * CHUNK + lx];
            if (id === 0 || OPAQUE[id] === false) continue;
            const wx = baseX + lx, wz = baseZ + lz;
            const color = COLORS[id] ?? 0xffffff;
            if (this.isTransparentAt(wx, y, wz, 1, 0, 0)) mesher.pushFace("pos", 1,0,0, wx+1,y,wz+1, color);
            if (this.isTransparentAt(wx, y, wz, -1, 0, 0)) mesher.pushFace("neg", -1,0,0, wx,y,wz+1, color);
            if (this.isTransparentAt(wx, y, wz, 0, 1, 0)) mesher.pushFace("top", 0,1,0, wx,y+1,wz, color);
            if (this.isTransparentAt(wx, y, wz, 0, -1, 0)) mesher.pushFace("bottom", 0,-1,0, wx,y,wz+1, color);
            if (this.isTransparentAt(wx, y, wz, 0, 0, 1)) mesher.pushFace("front", 0,0,1, wx,y,wz+1, color);
            if (this.isTransparentAt(wx, y, wz, 0, 0, -1)) mesher.pushFace("back", 0,0,-1, wx+1,y,wz, color);
          }
        }
      }

      const old = this.chunkMeshes.get(k);
      if (old) { this.scene.remove(old); old.geometry.dispose(); this.chunkMeshes.delete(k); }

      if (mesher.isEmpty()) return;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(mesher.positions, 3));
      geo.setAttribute("normal", new THREE.BufferAttribute(mesher.normals, 3));
      geo.setAttribute("color", new THREE.BufferAttribute(mesher.colors, 3));
      geo.setIndex(mesher.indices);
      const mat = new THREE.MeshLambertMaterial({ vertexColors: true });

      const mesh = new THREE.Mesh(geo, mat);
      this.scene.add(mesh);
      this.chunkMeshes.set(k, mesh);
    }

    isTransparentAt(wx, y, wz, dx, dy, dz) {
      const nx = wx + dx, ny = y + dy, nz = wz + dz;
      if (ny < 0 || ny >= WORLD_H) return true;
      const id = this.getBlockAt(nx, ny, nz);
      return id === 0 || OPAQUE[id] === false;
    }

    // ---------- game loop / movement ----------
    startLoop() {
      const loop = () => {
        requestAnimationFrame(loop);
        if (this.locked) this.updateMovement();
        this.updateCamera();
        this.updateOtherPlayersVisual();
        this.renderer.render(this.scene, this.camera);
      };
      loop();
    }

    updateCamera() {
      this.camera.position.set(this.position.x, this.position.y, this.position.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      // raycast highlight
      const dir = new THREE.Vector3(0,0,-1).applyEuler(this.camera.rotation);
      const hit = raycast(this.position, dir, (x,y,z) => this.getBlockAt(x,y,z), 6);
      const hl = document.getElementById("block-highlight");
      if (hit) {
        this.highlightBox.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);
        this.highlightBox.visible = true;
        // project to screen
        const v = new THREE.Vector3(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5).project(this.camera);
        const rect = this.canvas.getBoundingClientRect();
        hl.style.display = "block";
        hl.style.left = (v.x * 0.5 + 0.5) * window.innerWidth + "px";
        hl.style.top = (0.5 - v.y * 0.5) * window.innerHeight + "px";
      } else {
        this.highlightBox.visible = false;
        hl.style.display = "none";
      }
      this.highlightTarget = hit || null;
    }

    updateMovement() {
      const speed = this.flying ? 0.35 : 0.12;
      const dir = new THREE.Vector3();
      const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
      const right = new THREE.Vector3(-Math.sin(this.yaw + Math.PI/2), 0, -Math.cos(this.yaw + Math.PI/2));

      if (this.keys["KeyW"]) dir.add(forward);
      if (this.keys["KeyS"]) dir.sub(forward);
      if (this.keys["KeyA"]) dir.add(right);
      if (this.keys["KeyD"]) dir.sub(right);
      dir.normalize();

      const moveX = dir.x * speed, moveZ = dir.z * speed;
      // horizontal collision
      const nx = this.position.x + moveX, nz = this.position.z + moveZ;
      if (!this.collides(nx, this.position.y, this.position.z)) this.position.x = nx;
      if (!this.collides(this.position.x, this.position.y, nz)) this.position.z = nz;

      if (this.flying) {
        let vy = 0;
        if (this.keys["Space"]) vy = speed * 1.5;
        if (this.keys["ShiftLeft"]) vy = -speed * 1.5;
        this.position.y = Math.max(1, Math.min(WORLD_H - 1, this.position.y + vy));
        this.onGround = false;
      } else {
        // gravity
        this.velocity.y -= 0.018;
        const ny = this.position.y + this.velocity.y;
        if (this.collides(this.position.x, ny, this.position.z)) {
          this.velocity.y = 0;
          this.onGround = true;
        } else {
          this.position.y = ny;
          this.onGround = false;
        }
        if (this.keys["Space"] && this.onGround) {
          this.velocity.y = 0.32;
          this.onGround = false;
        }
        if (this.position.y < 1) { this.position.y = 1; this.velocity.y = 0; }
      }

      // send to server (throttled)
      const now = Date.now();
      if (!this._lastSend || now - this._lastSend > 70) {
        this._lastSend = now;
        if (this.socket && this.socket.connected) {
          this.socket.emit("move", { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.yaw, pitch: this.pitch, onGround: this.onGround });
        }
        // chunk streaming
        this.streamChunks();
      }

      // void death check (server authoritative, but Y floor for respawn UX)
      if (this.currentDimension === "void" && this.position.y < -10 && this.socket) {
        this.socket.emit("use", { itemType: "item:void_totem" }); // signal hazard fallback
      }
    }

    collides(x, y, z) {
      const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
      const feet = Math.floor(y - 0.4), head = Math.floor(y + 0.4);
      for (const yy of [feet, by, head]) {
        const b = this.getBlockAt(bx, yy, bz);
        if (b !== 0 && OPAQUE[b] !== false) return true;
      }
      return false;
    }

    streamChunks() {
      const dist = 3.5;
      const px = Math.floor(this.position.x / CHUNK);
      const pz = Math.floor(this.position.z / CHUNK);
      const want = new Set();
      for (let dx = -Math.ceil(dist); dx <= Math.ceil(dist); dx++) {
        for (let dz = -Math.ceil(dist); dz <= Math.ceil(dist); dz++) {
          const cx = px + dx, cz = pz + dz;
          want.add(`${cx}:${cz}`);
          if (!this.requested || !this.requested.has(`${cx}:${cz}`)) {
            if (!this.chunkMeshes.has(`${cx}:${cz}`)) {
              this.socket.emit("loadChunks", { dimension: this.currentDimension, cx, cz, viewDistance: 3.5 });
            }
          }
        }
      }
      // unload far
      if (this.chunkMeshes.size > 100) {
        for (const k of Array.from(this.chunkMeshes.keys())) {
          if (!want.has(k)) {
            const [cx, cz] = k.split(":").map(Number);
            this.socket.emit("unloadChunks", { cx, cz });
            const mesh = this.chunkMeshes.get(k);
            this.scene.remove(mesh); mesh.geometry.dispose(); this.chunkMeshes.delete(k);
          }
        }
      }
    }

    // ---------- actions ----------
    tryBreak() {
      const hit = this.highlightTarget;
      if (!hit || !this.socket) return;
      this.socket.emit("break", { x: hit.x, y: hit.y, z: hit.z });
    }

    tryPlace() {
      const hit = this.highlightTarget;
      if (!hit || !this.socket) return;
      const selected = window.VOIDORIA?.getSelectedHotbar();
      if (!selected) return;
      // place block adjacent to the face hit - approximate by placing next to hit using rough normal
      const dir = new THREE.Vector3(0,0,-1).applyEuler(this.camera.rotation);
      const hitPoint = new THREE.Vector3(hit.x + 0.5 + dir.x, hit.y + 0.5 + dir.y, hit.z + 0.5 + dir.z);
      const px = Math.floor(0.001 + hitPoint.x), py = Math.floor(0.001 + hitPoint.y), pz = Math.floor(0.001 + hitPoint.z);
      this.socket.emit("place", { x: px, y: py, z: pz, itemType: selected.itemType });
    }

    // ---------- other players ----------
    updateOtherPlayer(id, data) {
      let mesh = this.otherPlayers.get(id);
      if (!mesh) {
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.6, 0.8, 0.6),
          new THREE.MeshLambertMaterial({ color: 0x7b5cf6 })
        );
        const head = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.5, 0.5),
          new THREE.MeshLambertMaterial({ color: 0xe0ac69 })
        );
        head.position.y = 0.65;
        mesh = new THREE.Group();
        mesh.add(body); mesh.add(head);
        (mesh.userData = {}).head = head;
        this.scene.add(mesh);
        this.otherPlayers.set(id, mesh);
      }
      mesh.position.set(data.x, data.y, data.z);
      if (data.yaw !== undefined) mesh.rotation.y = data.yaw;
    }

    updateOtherPlayersVisual() {
      for (const p of this.otherPlayers.values()) {
        if (!p.userData.head) continue;
        p.userData.head.rotation.set(0,0,0);
      }
    }

    removeOtherPlayer(id) {
      const mesh = this.otherPlayers.get(id);
      if (mesh) { this.scene.remove(mesh); this.otherPlayers.delete(id); }
    }

    teleport(pos) {
      this.position.x = pos.x; this.position.y = pos.y; this.position.z = pos.z;
      if (pos.dimension) this.currentDimension = pos.dimension;
      if (pos.dimension === "void") this.scene.background = new THREE.Color(0x0a0616);
      else this.scene.background = new THREE.Color(0x87ceeb);
      this.velocity.y = 0;
      setTimeout(() => this.streamChunks(), 200);
    }

    resetDimension(dim) {
      this.currentDimension = dim;
    }

    dispose() {
      document.exitPointerLock && document.exitPointerLock();
    }
  }

  // face definitions: 6 quads each (4 verts, 2 tris)
  const FACES = {
    pos: { n: [1,0,0], v: [[1,1,1],[1,-1,1],[1,-1,-1],[1,1,-1]] },
    neg: { n: [-1,0,0], v: [[0,1,-1],[0,-1,-1],[0,-1,1],[0,1,1]] },
    top: { n: [0,1,0], v: [[0,1,1],[1,1,1],[1,1,0],[0,1,0]] },
    bottom: { n: [0,-1,0], v: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]] },
    front: { n: [0,0,1], v: [[0,1,1],[1,1,1],[1,-1,1],[0,-1,1]] },
    back: { n: [0,0,-1], v: [[1,1,0],[0,1,0],[0,-1,0],[1,-1,0]] },
  };

  class ChunkMesher {
    constructor() {
      this.positions = [];
      this.normals = [];
      this.colors = [];
      this.indices = [];
    }
    isEmpty() { return this.positions.length === 0; }
    pushFace(orient, nx, ny, nz, ox, oy, oz, color) {
      const f = FACES[orient];
      let shade = 1;
      if (nx === 1) shade = 0.7; else if (nx === -1) shade = 0.6;
      else if (ny === 1) shade = 1.0; else if (ny === -1) shade = 0.5;
      else if (nz === 1) shade = 0.85; else if (nz === -1) shade = 0.75;
      const r = ((color >> 16) & 255) / 255 * shade;
      const g = ((color >> 8) & 255) / 255 * shade;
      const b = (color & 255) / 255 * shade;
      const base = this.positions.length / 3;
      for (const v of f.v) {
        this.positions.push(ox + v[0], oy + v[1], oz + v[2]);
        this.normals.push(f.n[0], f.n[1], f.n[2]);
        this.colors.push(r, g, b);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  window.VoxelEngine = VoxelEngine;
  window.THREE = THREE;
