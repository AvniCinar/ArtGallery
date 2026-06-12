import * as THREE from 'three';
import gsap from 'gsap';
import './style.css';
import { loadData } from './data.js';
import { TimelineScene } from './timeline.js';
import { GalleryScene } from './gallery.js';

const $ = (id) => document.getElementById(id);

class App {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    $('app').appendChild(this.renderer.domElement);

    this.veil = document.createElement('div');
    this.veil.id = 'veil';
    document.body.appendChild(this.veil);

    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.mode = 'timeline'; // 'timeline' | 'gallery'
    this.gallery = null;
    this.currentArtist = null;
    this.touch = matchMedia('(pointer: coarse)').matches;
  }

  async start() {
    const fill = $('loader-fill');
    fill.style.width = '30%';
    this.data = await loadData();
    fill.style.width = '70%';
    $('loader-status').textContent = 'Building the museum…';

    this.timeline = new TimelineScene(this.data, {
      onPeriodFocused: (period) => this.#onPeriodFocused(period),
      onArtistClicked: (artist, period) => this.#openPlacard(artist, period),
    });

    this.#buildEraStrip();
    this.#bindUI();
    this.#bindInput();
    this.#loop();

    fill.style.width = '100%';
    await new Promise((r) => setTimeout(r, 400));
    $('loader').classList.add('hidden');
    setTimeout(() => $('loader').remove(), 900);
    $('hud').classList.remove('hidden');
    $('era-strip').classList.remove('hidden');
  }

  // ---------------- UI ----------------

  #buildEraStrip() {
    const strip = $('era-strip');
    for (const p of this.data.periods) {
      const b = document.createElement('button');
      b.className = 'era-chip';
      b.textContent = p.name;
      b.dataset.period = p.id;
      b.onclick = () => {
        if (this.mode !== 'timeline') return;
        this.timeline.focusPeriod(p.id);
      };
      strip.appendChild(b);
    }
  }

  #onPeriodFocused(period) {
    $('hud-era').textContent = period ? `${period.name} · ${period.start}–${period.end}` : '';
    $('btn-back').classList.toggle('hidden', !period);
    document.querySelectorAll('.era-chip').forEach((c) =>
      c.classList.toggle('active', !!period && c.dataset.period === period.id));
  }

  #openPlacard(artist, period) {
    this.currentArtist = { artist, period };
    $('placard-portrait').src = artist.portrait || '';
    $('placard-portrait').style.display = artist.portrait ? '' : 'none';
    $('placard-name').textContent = artist.name;
    const dates = [artist.birth, artist.death].filter(Boolean).join(' – ');
    $('placard-dates').textContent = dates ? `(${dates})` : '';
    $('placard-desc').textContent = artist.description || period.name;
    $('placard-bio').textContent = artist.bio || '';
    $('placard-wiki').href = artist.wikiUrl || '#';
    $('placard').classList.remove('hidden');
  }

  #closePlacard() {
    $('placard').classList.add('hidden');
  }

  #bindUI() {
    $('placard-close').onclick = () => this.#closePlacard();
    $('btn-enter-gallery').onclick = () => {
      if (this.currentArtist) this.#enterGallery(this.currentArtist.artist, this.currentArtist.period);
    };
    $('btn-back').onclick = () => {
      if (this.mode === 'gallery') this.#exitGallery();
      else this.timeline.blur();
    };
    $('btn-help').onclick = () => $('help').classList.remove('hidden');
    $('help-close').onclick = () => $('help').classList.add('hidden');
    $('help').onclick = (e) => { if (e.target.id === 'help') $('help').classList.add('hidden'); };
  }

  // ---------------- scene switching ----------------

  async #enterGallery(artist, period) {
    this.#closePlacard();
    await this.#fade(1, 0.5);
    this.mode = 'gallery';
    $('era-strip').classList.add('hidden');
    $('hud-era').textContent = `${artist.name} · ${period.name}`;
    $('btn-back').classList.remove('hidden');

    this.gallery = new GalleryScene(artist, period, this.renderer, {
      onProgress: (done, total) => {
        $('gallery-hint').innerHTML = done < total
          ? `<p>Hanging the paintings… ${done}/${total}</p>`
          : this.touch
            ? '<p><b>Drag</b> to look around · hold <b>bottom half</b> to walk forward</p>'
            : '<p><b>Click</b> to look around · <b>W A S D</b> / arrows to walk · <b>Esc</b> to release</p>';
      },
      onCaption: (work) => {
        const cap = $('artwork-caption');
        if (!work) { cap.classList.add('hidden'); return; }
        cap.innerHTML = `<div class="cap-title">${work.title}</div>
          <div class="cap-meta">${artist.name}${work.year ? ' · ' + work.year : ''}</div>`;
        cap.classList.remove('hidden');
      },
    });

    $('gallery-hint').classList.remove('hidden');
    await this.#fade(0, 0.7);
    this.gallery.load(); // paintings pop in as the textures arrive
    if (!this.touch) $('crosshair').classList.remove('hidden');
  }

  async #exitGallery() {
    await this.#fade(1, 0.5);
    this.gallery?.dispose();
    this.gallery = null;
    this.mode = 'timeline';
    $('gallery-hint').classList.add('hidden');
    $('crosshair').classList.add('hidden');
    $('artwork-caption').classList.add('hidden');
    $('era-strip').classList.remove('hidden');
    const p = this.timeline.focused;
    $('hud-era').textContent = p ? `${p.name} · ${p.start}–${p.end}` : '';
    await this.#fade(0, 0.7);
  }

  #fade(to, duration) {
    return gsap.to(this.veil, { opacity: to, duration, ease: 'power2.inOut' }).then();
  }

  // ---------------- input ----------------

  #setPointer(e) {
    this.pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    const cam = this.mode === 'gallery' ? this.gallery.camera : this.timeline.camera;
    this.raycaster.setFromCamera(this.pointer, cam);
  }

  #bindInput() {
    const el = this.renderer.domElement;

    el.addEventListener('pointerdown', (e) => {
      if (this.mode === 'timeline') { this.#setPointer(e); this.timeline.pointerDown(e); }
      else if (!this.touch && !this.gallery.controls.isLocked) this.gallery.controls.lock();
    });
    el.addEventListener('pointermove', (e) => {
      if (this.mode === 'timeline') { this.#setPointer(e); this.timeline.pointerMove(e, this.raycaster); }
    });
    el.addEventListener('pointerup', (e) => {
      if (this.mode === 'timeline') { this.#setPointer(e); this.timeline.pointerUp(e, this.raycaster); }
    });
    el.addEventListener('wheel', (e) => {
      if (this.mode === 'timeline') this.timeline.wheel(e);
    }, { passive: true });

    addEventListener('keydown', (e) => {
      if (this.mode === 'gallery') this.gallery.keyDown(e.code);
      if (e.code === 'Escape' && this.mode === 'timeline') { this.#closePlacard(); }
    });
    addEventListener('keyup', (e) => {
      if (this.mode === 'gallery') this.gallery.keyUp(e.code);
    });

    // Touch walk/look for galleries (pointer lock is unavailable on touch)
    let lastTouch = null;
    el.addEventListener('touchstart', (e) => {
      if (this.mode !== 'gallery') return;
      const t = e.touches[0];
      lastTouch = { x: t.clientX, y: t.clientY };
      if (t.clientY > innerHeight * 0.55) this.gallery.keyDown('KeyW');
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (this.mode !== 'gallery' || !lastTouch) return;
      const t = e.touches[0];
      const dx = t.clientX - lastTouch.x, dy = t.clientY - lastTouch.y;
      lastTouch = { x: t.clientX, y: t.clientY };
      const cam = this.gallery.camera;
      const euler = new THREE.Euler(0, 0, 0, 'YXZ').setFromQuaternion(cam.quaternion);
      euler.y -= dx * 0.004;
      euler.x = THREE.MathUtils.clamp(euler.x - dy * 0.004, -1.2, 1.2);
      cam.quaternion.setFromEuler(euler);
    }, { passive: true });
    el.addEventListener('touchend', () => {
      if (this.mode === 'gallery') this.gallery.keyUp('KeyW');
      lastTouch = null;
    });

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.timeline.resize();
      this.gallery?.resize();
    });
  }

  // ---------------- render loop ----------------

  #loop() {
    this.renderer.setAnimationLoop(() => {
      const dt = Math.min(this.clock.getDelta(), 0.05);
      if (this.mode === 'gallery' && this.gallery) {
        this.gallery.update(dt);
        this.renderer.render(this.gallery.scene, this.gallery.camera);
      } else {
        this.timeline.update(dt);
        this.renderer.render(this.timeline.scene, this.timeline.camera);
      }
    });
  }
}

new App().start().catch((err) => {
  console.error(err);
  const s = $('loader-status');
  if (s) { s.textContent = 'Failed to open the museum — please refresh.'; s.style.color = '#e0589a'; }
});
