/**
 * A walkable museum hall for one artist: PBR materials, per-painting spotlights
 * with soft shadows, ACES tone mapping (set on the renderer in main.js) and a
 * RoomEnvironment IBL so frames and floors pick up believable reflections.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { woodFloorTexture, plasterWallTexture, marbleTexture, labelTexture } from './textures.js';

const WALL_H = 6.4;
const ROOM_W = 15;
const EYE = 1.7;
const PAINT_GAP = 7.2;

export class GalleryScene {
  constructor(artist, period, renderer, callbacks) {
    this.artist = artist;
    this.period = period;
    this.renderer = renderer;
    this.cb = callbacks; // { onProgress(loaded,total), onCaption(text|null) }

    const n = artist.works.length;
    this.roomL = Math.max(20, Math.ceil(n / 2) * PAINT_GAP + 10);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x161310);
    this.scene.fog = new THREE.Fog(0x161310, this.roomL * 0.8, this.roomL * 2);

    this.camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.1, 200);
    this.camera.position.set(0, EYE, this.roomL / 2 - 2.5);
    this.camera.lookAt(0, EYE, 0);

    this.controls = new PointerLockControls(this.camera, renderer.domElement);
    this.keys = {};
    this.moveSpeed = 4.2;
    this.paintings = []; // { mesh, work, center }
    this.captionFor = null;
    this.disposed = false;

    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.scene.environment = this.pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.#buildRoom();
    this.#buildLights();
  }

  // ---------------- construction ----------------

  #buildRoom() {
    const L = this.roomL;
    const floorMat = new THREE.MeshStandardMaterial({
      map: woodFloorTexture([ROOM_W / 4, L / 4]), roughness: 0.32, metalness: 0.06,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_W, L), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const wallMat = new THREE.MeshStandardMaterial({
      map: plasterWallTexture('#3c3a45', [6, 2]), roughness: 0.95, metalness: 0.0,
    });
    const mkWall = (w, h, x, y, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
      m.position.set(x, y, z);
      m.rotation.y = ry;
      m.receiveShadow = true;
      this.scene.add(m);
    };
    mkWall(L, WALL_H, -ROOM_W / 2, WALL_H / 2, 0, Math.PI / 2);   // left
    mkWall(L, WALL_H, ROOM_W / 2, WALL_H / 2, 0, -Math.PI / 2);   // right
    mkWall(ROOM_W, WALL_H, 0, WALL_H / 2, -L / 2, 0);             // far
    mkWall(ROOM_W, WALL_H, 0, WALL_H / 2, L / 2, Math.PI);        // near

    const ceil = new THREE.Mesh(
      new THREE.PlaneGeometry(ROOM_W, L),
      new THREE.MeshStandardMaterial({ color: 0x1c1a20, roughness: 0.9 })
    );
    ceil.rotation.x = Math.PI / 2;
    ceil.position.y = WALL_H;
    this.scene.add(ceil);

    // Gold baseboards
    const goldMat = new THREE.MeshStandardMaterial({ color: 0x8a6d1f, roughness: 0.4, metalness: 0.8 });
    for (const side of [-1, 1]) {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.22, L), goldMat);
      base.position.set(side * (ROOM_W / 2 - 0.06), 0.11, 0);
      this.scene.add(base);
    }

    // Marble bench in the middle of the hall
    const benchMat = new THREE.MeshStandardMaterial({ map: marbleTexture(), roughness: 0.2, metalness: 0.1 });
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 3.2), benchMat);
    bench.position.set(0, 0.45, 0);
    bench.castShadow = bench.receiveShadow = true;
    this.scene.add(bench);
    const benchBase = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.25, 2.8), benchMat);
    benchBase.position.set(0, 0.125, 0);
    this.scene.add(benchBase);

    // Far wall: artist name in museum lettering
    const dates = [this.artist.birth, this.artist.death].filter(Boolean).join(' — ');
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 2.5),
      new THREE.MeshBasicMaterial({
        map: labelTexture([
          { text: this.artist.name, size: 92, smallCaps: true, color: '#d9c89a' },
          { text: `${this.period.name}${dates ? ' · ' + dates : ''}`, size: 44, italic: true, color: '#9d8f6c' },
        ], { width: 1536, height: 384 }),
        transparent: true,
      })
    );
    sign.position.set(0, 3.9, -L / 2 + 0.06);
    this.scene.add(sign);
  }

  #buildLights() {
    this.scene.add(new THREE.AmbientLight(0x554d3f, 0.55));
    const L = this.roomL;
    // Warm ceiling glow every ~8m
    for (let z = -L / 2 + 5; z < L / 2; z += 8) {
      const p = new THREE.PointLight(0xffe3b3, 14, 16, 1.8);
      p.position.set(0, WALL_H - 0.4, z);
      this.scene.add(p);
      const fixture = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 12, 8),
        new THREE.MeshBasicMaterial({ color: 0xffe9c4 })
      );
      fixture.position.copy(p.position);
      this.scene.add(fixture);
    }
  }

  /** Load all paintings; resolves when every texture has arrived (or failed). */
  async load() {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    const works = this.artist.works;
    let done = 0;
    this.cb.onProgress(0, works.length);

    await Promise.all(works.map((work, i) => new Promise((resolve) => {
      loader.load(
        work.image,
        (tex) => { this.#hangPainting(work, i, tex); done++; this.cb.onProgress(done, works.length); resolve(); },
        undefined,
        () => {
          // fall back to the smaller thumb before giving up
          loader.load(
            work.thumb,
            (tex) => { this.#hangPainting(work, i, tex); done++; this.cb.onProgress(done, works.length); resolve(); },
            undefined,
            () => { done++; this.cb.onProgress(done, works.length); resolve(); }
          );
        }
      );
    })));
  }

  #hangPainting(work, i, tex) {
    if (this.disposed) { tex.dispose(); return; }
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;

    const side = i % 2 === 0 ? -1 : 1; // alternate walls
    const slot = Math.floor(i / 2);
    const nSlots = Math.ceil(this.artist.works.length / 2);
    const z = -this.roomL / 2 + 6 + slot * ((this.roomL - 12) / Math.max(nSlots - 1, 1));

    const aspect = tex.image.width / tex.image.height;
    let w = 3.1, h = w / aspect;
    if (h > 2.7) { h = 2.7; w = h * aspect; }
    if (w > 3.6) { w = 3.6; h = w / aspect; }

    const g = new THREE.Group();

    const frameDepth = 0.09;
    const frameBorder = 0.16;
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xb08d2a, roughness: 0.32, metalness: 0.78 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + frameBorder * 2, h + frameBorder * 2, frameDepth), frameMat);
    frame.castShadow = true;
    g.add(frame);

    const canvas = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, metalness: 0 })
    );
    canvas.position.z = frameDepth / 2 + 0.006;
    g.add(canvas);

    // Little brass label plate under the painting
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 0.34),
      new THREE.MeshBasicMaterial({
        map: labelTexture([
          { text: work.title, size: 54, italic: true, color: '#241f16' },
          { text: work.year ? String(work.year) : this.artist.name, size: 38, color: '#4d4434' },
        ], { width: 768, height: 176, bg: '#cfc1a0' }),
      })
    );
    plate.position.set(0, -(h / 2) - 0.45, frameDepth / 2);
    g.add(plate);

    const hangY = 2.45;
    g.position.set(side * (ROOM_W / 2 - 0.12 - frameDepth / 2), hangY, z);
    g.rotation.y = side * -Math.PI / 2;
    this.scene.add(g);

    // Dedicated spotlight, slightly above and in front of the painting
    const spot = new THREE.SpotLight(0xfff1d6, 36, 13, 0.5, 0.55, 1.6);
    spot.position.set(side * (ROOM_W / 2 - 2.6), WALL_H - 0.45, z);
    spot.target = canvas;
    spot.castShadow = true;
    spot.shadow.mapSize.set(512, 512);
    spot.shadow.bias = -0.0004;
    this.scene.add(spot);

    g.scale.setScalar(0.001);
    gsap.to(g.scale, { x: 1, y: 1, z: 1, duration: 0.7, ease: 'power2.out', delay: 0.05 * i });

    this.paintings.push({ work, center: new THREE.Vector3(side * (ROOM_W / 2), hangY, z) });
  }

  // ---------------- runtime ----------------

  keyDown(code) { this.keys[code] = true; }
  keyUp(code) { this.keys[code] = false; }

  update(dt) {
    const k = this.keys;
    const f = (k['KeyW'] || k['ArrowUp'] ? 1 : 0) - (k['KeyS'] || k['ArrowDown'] ? 1 : 0);
    const r = (k['KeyD'] || k['ArrowRight'] ? 1 : 0) - (k['KeyA'] || k['ArrowLeft'] ? 1 : 0);
    if (f || r) {
      const len = Math.hypot(f, r);
      this.controls.moveForward((f / len) * this.moveSpeed * dt);
      this.controls.moveRight((r / len) * this.moveSpeed * dt);
    }
    // keep the visitor inside the room
    const p = this.camera.position;
    p.x = THREE.MathUtils.clamp(p.x, -ROOM_W / 2 + 0.7, ROOM_W / 2 - 0.7);
    p.z = THREE.MathUtils.clamp(p.z, -this.roomL / 2 + 0.7, this.roomL / 2 - 0.7);
    p.y = EYE;

    // proximity captions
    let best = null, bestD = 5.2;
    for (const pt of this.paintings) {
      const d = pt.center.distanceTo(p);
      if (d < bestD) { bestD = d; best = pt; }
    }
    if (best !== this.captionFor) {
      this.captionFor = best;
      this.cb.onCaption(best ? best.work : null);
    }
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    this.disposed = true;
    this.controls.unlock();
    this.controls.disconnect();
    this.pmrem.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      }
    });
  }
}
