/**
 * The infinite timeline hall: a luminous spine of time floating in a dark void,
 * one glowing portal per art period. Drag / scroll to travel (it wraps forever),
 * click a portal to zoom in and meet the period's artists.
 */
import * as THREE from 'three';
import gsap from 'gsap';
import { labelTexture, glowSpriteTexture, marbleTexture } from './textures.js';

const SPACING = 70;

export class TimelineScene {
  constructor(data, callbacks) {
    this.data = data;
    this.cb = callbacks; // { onPeriodFocused(period|null), onArtistClicked(artist, period) }
    this.periods = data.periods;
    this.W = this.periods.length * SPACING;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0a12, 0.0055);
    this.scene.background = new THREE.Color(0x0b0a12);

    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 600);
    this.camera.position.set(SPACING / 2, 7.5, 40); // open on the first period
    this.targetX = SPACING / 2; // where the camera wants to be on the spine
    this.velocity = 0;
    this.focused = null;       // period currently zoomed into
    this.artistGroup = null;
    this.pickables = [];       // portal meshes (all 3 copies)
    this.artistCards = [];
    this.hovered = null;
    this.dragging = false;
    this.elapsed = 0;

    this.texLoader = new THREE.TextureLoader();
    this.texLoader.setCrossOrigin('anonymous');
    this.portraitCache = new Map();

    this.#buildLights();
    this.#buildStars();
    this.#buildSpine();
    this.#buildPortals();
  }

  #buildLights() {
    this.scene.add(new THREE.AmbientLight(0x8888aa, 0.5));
    const key = new THREE.DirectionalLight(0xfff2dd, 1.4);
    key.position.set(20, 40, 30);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6677ff, 0.6);
    rim.position.set(-30, 10, -40);
    this.scene.add(rim);
  }

  #buildStars() {
    const N = 1400;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() - 0.5) * this.W * 3;
      pos[i * 3 + 1] = Math.random() * 120 - 30;
      pos[i * 3 + 2] = -20 - Math.random() * 220;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      map: glowSpriteTexture(), size: 1.6, transparent: true, opacity: 0.7,
      depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcdd5ff,
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);
  }

  #buildSpine() {
    // The "river of time" — a softly glowing band running under the portals.
    const geo = new THREE.PlaneGeometry(this.W * 3, 5.2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xc9a227, transparent: true, opacity: 0.16, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const band = new THREE.Mesh(geo, mat);
    band.rotation.x = -Math.PI / 2;
    band.position.set(this.W / 2, -1.2, 0);
    this.scene.add(band);

    const floorGeo = new THREE.PlaneGeometry(this.W * 3, 240);
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x12101c, roughness: 0.9, metalness: 0.1 });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(this.W / 2, -1.6, -40);
    this.scene.add(floor);
  }

  #portalGroup(period, index) {
    const g = new THREE.Group();
    const color = new THREE.Color(period.color);

    const marble = marbleTexture();
    const colMat = new THREE.MeshStandardMaterial({ map: marble, roughness: 0.35, metalness: 0.25 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.3, metalness: 0.85 });

    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.78, 13, 18), colMat);
      col.position.set(side * 5.2, 5.2, 0);
      g.add(col);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(2, 0.55, 2), goldMat);
      cap.position.set(side * 5.2, 11.9, 0);
      g.add(cap);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.25, 2.2), colMat);
    lintel.position.y = 12.9;
    g.add(lintel);
    const pediment = new THREE.Mesh(new THREE.ConeGeometry(7.6, 2.6, 4), goldMat);
    pediment.rotation.y = Math.PI / 4;
    pediment.scale.z = 0.32;
    pediment.position.y = 14.7;
    g.add(pediment);

    // Glowing veil between the columns — this is what you click.
    const veil = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 12.4),
      new THREE.MeshBasicMaterial({
        color, transparent: true, opacity: 0.34, side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    veil.position.y = 5.6;
    veil.userData = { periodId: period.id, kind: 'portal' };
    g.add(veil);

    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowSpriteTexture(), color, transparent: true, opacity: 0.5,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    halo.scale.set(26, 26, 1);
    halo.position.set(0, 6, -1.5);
    g.add(halo);

    // Floating title
    const title = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 4),
      new THREE.MeshBasicMaterial({
        map: labelTexture([
          { text: period.name, size: 86, smallCaps: true },
          { text: `${period.start} — ${period.end}`, size: 46, italic: true, color: '#c9a227' },
        ]),
        transparent: true, depthWrite: false,
      })
    );
    title.position.y = 18.4;
    g.add(title);

    // Plinth
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(14.5, 0.8, 4.4), colMat);
    plinth.position.y = -1.0;
    g.add(plinth);

    g.position.x = index * SPACING + SPACING / 2;
    return { group: g, veil };
  }

  #buildPortals() {
    // Three copies of the whole strip so the loop never shows an edge.
    this.copies = [];
    for (const offset of [-1, 0, 1]) {
      const strip = new THREE.Group();
      strip.position.x = offset * this.W;
      this.periods.forEach((p, i) => {
        const { group, veil } = this.#portalGroup(p, i);
        strip.add(group);
        this.pickables.push(veil);
      });
      this.scene.add(strip);
      this.copies.push(strip);
    }
  }

  periodCenterX(periodId) {
    const i = this.periods.findIndex((p) => p.id === periodId);
    return i * SPACING + SPACING / 2;
  }

  /** Nearest wrapped instance of `x` relative to camera. */
  #nearestWrapped(x) {
    const cam = this.camera.position.x;
    let best = x, bestD = Infinity;
    for (const k of [-1, 0, 1]) {
      const cand = x + k * this.W + Math.round((cam - (x + k * this.W)) / (this.W * 3)) * this.W * 3;
      const d = Math.abs(cand - cam);
      if (d < bestD) { bestD = d; best = cand; }
    }
    return best;
  }

  // ------------- interaction (driven by main.js) -------------

  pointerDown(e) {
    if (this.focused) return;
    this.dragging = true;
    this.dragStartX = e.clientX;
    this.dragStartTarget = this.targetX;
    this.moved = 0;
  }

  pointerMove(e, raycaster) {
    if (this.dragging) {
      const dx = e.clientX - this.dragStartX;
      this.moved = Math.max(this.moved, Math.abs(dx));
      this.targetX = this.dragStartTarget - dx * 0.085;
      return;
    }
    const hits = raycaster.intersectObjects(this.focused ? this.artistCards : this.pickables, false);
    const hit = hits[0]?.object || null;
    if (hit !== this.hovered) {
      if (this.hovered) gsap.to(this.hovered.scale, { x: 1, y: 1, z: 1, duration: 0.3 });
      this.hovered = hit;
      if (hit) gsap.to(hit.scale, { x: 1.07, y: 1.07, z: 1.07, duration: 0.3 });
      document.body.style.cursor = hit ? 'pointer' : 'default';
    }
  }

  pointerUp(e, raycaster) {
    const wasDrag = this.dragging && this.moved > 6;
    this.dragging = false;
    if (wasDrag) return;
    const hits = raycaster.intersectObjects(this.focused ? this.artistCards : this.pickables, false);
    const hit = hits[0]?.object;
    if (!hit) return;
    if (hit.userData.kind === 'portal') this.focusPeriod(hit.userData.periodId);
    else if (hit.userData.kind === 'artist') this.cb.onArtistClicked(hit.userData.artist, this.focused);
  }

  wheel(e) {
    if (this.focused) return;
    this.velocity += e.deltaY * 0.012;
  }

  // ------------- focus / blur -------------

  focusPeriod(periodId) {
    const period = this.periods.find((p) => p.id === periodId);
    if (!period || this.focused?.id === periodId) return;
    if (this.focused) this.#clearArtists(true);
    this.focused = period;

    const cx = this.#nearestWrapped(this.periodCenterX(periodId));
    this.targetX = cx;
    this.velocity = 0;

    gsap.to(this.camera.position, { x: cx, y: 5.4, z: 24, duration: 1.6, ease: 'power3.inOut' });
    this.#spawnArtists(period, cx);
    this.cb.onPeriodFocused(period);
  }

  blur() {
    if (!this.focused) return;
    this.focused = null;
    this.#clearArtists(true);
    gsap.to(this.camera.position, { y: 7.5, z: 40, duration: 1.2, ease: 'power3.inOut' });
    this.cb.onPeriodFocused(null);
  }

  #portraitMaterial(artist) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x2a2433, roughness: 0.85 });
    if (artist.portrait) {
      const url = artist.portrait.replace(/\/(\d+)px-/, '/512px-');
      if (this.portraitCache.has(url)) {
        mat.map = this.portraitCache.get(url);
        mat.color.set(0xffffff);
        mat.needsUpdate = true;
      } else {
        this.texLoader.load(url, (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          this.portraitCache.set(url, tex);
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
        });
      }
    }
    return mat;
  }

  #spawnArtists(period, cx) {
    const g = new THREE.Group();
    const n = period.artists.length;
    const arcR = 13.5;
    period.artists.forEach((artist, i) => {
      const card = new THREE.Group();
      const angle = ((i - (n - 1) / 2) / Math.max(n - 1, 1)) * Math.PI * 0.62;
      card.position.set(cx + Math.sin(angle) * arcR, 3.6, 6 + Math.cos(angle) * 6.5);
      card.lookAt(cx, 4.2, 26);

      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(3.5, 4.4, 0.18),
        new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.35, metalness: 0.8 })
      );
      card.add(frame);

      const portrait = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 3.5), this.#portraitMaterial(artist));
      portrait.position.set(0, 0.28, 0.1);
      portrait.userData = { kind: 'artist', artist };
      card.add(portrait);
      this.artistCards.push(portrait);

      const name = new THREE.Mesh(
        new THREE.PlaneGeometry(3.0, 0.62),
        new THREE.MeshBasicMaterial({
          map: labelTexture([{ text: artist.name, size: 78, smallCaps: true, color: '#14110c' }],
            { width: 1024, height: 192, bg: '#e9dfc8' }),
          transparent: false,
        })
      );
      name.position.set(0, -1.72, 0.1);
      card.add(name);

      card.userData.baseY = card.position.y;
      card.userData.phase = i * 1.31;
      card.scale.setScalar(0.001);
      gsap.to(card.scale, { x: 1, y: 1, z: 1, duration: 0.9, delay: 0.5 + i * 0.1, ease: 'back.out(1.6)' });
      g.add(card);
    });
    this.artistGroup = g;
    this.scene.add(g);
  }

  #clearArtists(animate) {
    const g = this.artistGroup;
    if (!g) return;
    this.artistGroup = null;
    this.artistCards = [];
    this.hovered = null;
    if (animate) {
      g.children.forEach((card, i) =>
        gsap.to(card.scale, { x: 0.001, y: 0.001, z: 0.001, duration: 0.35, delay: i * 0.03 })
      );
      gsap.delayedCall(0.9, () => this.#dispose(g));
    } else this.#dispose(g);
  }

  #dispose(obj) {
    this.scene.remove(obj);
    obj.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    });
  }

  update(dt) {
    this.elapsed += dt;

    if (!this.focused) {
      this.targetX += this.velocity;
      this.velocity *= Math.pow(0.0025, dt); // exponential friction
      this.camera.position.x += (this.targetX - this.camera.position.x) * Math.min(1, dt * 5);

      // wrap into the middle copy so travel is endless
      if (this.camera.position.x > this.W * 1.5) { this.camera.position.x -= this.W; this.targetX -= this.W; }
      if (this.camera.position.x < -this.W * 0.5) { this.camera.position.x += this.W; this.targetX += this.W; }
      this.camera.lookAt(this.camera.position.x, 5.5, 0);
    } else {
      this.camera.lookAt(this.camera.position.x, 4.6, 4);
    }

    // gentle bob for artist cards
    if (this.artistGroup) {
      for (const card of this.artistGroup.children) {
        card.position.y = card.userData.baseY + Math.sin(this.elapsed * 1.3 + card.userData.phase) * 0.14;
      }
    }
    this.stars.rotation.z = Math.sin(this.elapsed * 0.02) * 0.02;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
}
