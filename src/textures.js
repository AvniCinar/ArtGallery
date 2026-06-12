/**
 * Procedural textures drawn on canvas — keeps the museum asset-free while
 * still giving the PBR materials believable color/roughness/normal variation.
 */
import * as THREE from 'three';

function canvasTexture(size, draw, { repeat = [1, 1], colorSpace = THREE.SRGBColorSpace } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.colorSpace = colorSpace;
  tex.anisotropy = 8;
  return tex;
}

let seed = 7;
function rand() {
  // Deterministic so floors/walls look identical every visit.
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
}

/** Herringbone-ish oak plank floor. */
export function woodFloorTexture(repeat = [6, 6]) {
  return canvasTexture(1024, (ctx, s) => {
    ctx.fillStyle = '#6e5237';
    ctx.fillRect(0, 0, s, s);
    const rows = 8, plankH = s / rows;
    for (let r = 0; r < rows; r++) {
      let x = -rand() * 200;
      while (x < s) {
        const w = 180 + rand() * 220;
        const tone = 0.82 + rand() * 0.36;
        ctx.fillStyle = `rgb(${Math.floor(110 * tone)}, ${Math.floor(82 * tone)}, ${Math.floor(55 * tone)})`;
        ctx.fillRect(x + 2, r * plankH + 2, w - 4, plankH - 4);
        // grain streaks
        ctx.strokeStyle = `rgba(60,40,22,${0.12 + rand() * 0.12})`;
        for (let g = 0; g < 9; g++) {
          ctx.beginPath();
          const gy = r * plankH + 4 + rand() * (plankH - 8);
          ctx.moveTo(x + 4, gy);
          ctx.bezierCurveTo(x + w * 0.3, gy + rand() * 6 - 3, x + w * 0.7, gy + rand() * 6 - 3, x + w - 4, gy + rand() * 4 - 2);
          ctx.lineWidth = 0.6 + rand() * 1.2;
          ctx.stroke();
        }
        x += w;
      }
      // seam shadow
      ctx.fillStyle = 'rgba(25,15,8,0.55)';
      ctx.fillRect(0, r * plankH, s, 2);
    }
  }, { repeat });
}

/** Soft plaster / lime wash wall. */
export function plasterWallTexture(base = '#efe7d8', repeat = [4, 2]) {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = rand();
      ctx.fillStyle = v > 0.5 ? `rgba(255,255,255,${(v - 0.5) * 0.12})` : `rgba(120,105,80,${(0.5 - v) * 0.10})`;
      ctx.fillRect(rand() * s, rand() * s, 1 + rand() * 2.5, 1 + rand() * 2.5);
    }
  }, { repeat });
}

/** Dark marble for benches and pedestals. */
export function marbleTexture(repeat = [1, 1]) {
  return canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#23222a';
    ctx.fillRect(0, 0, s, s);
    for (let v = 0; v < 22; v++) {
      ctx.strokeStyle = `rgba(${190 + rand() * 50}, ${190 + rand() * 45}, ${200 + rand() * 40}, ${0.05 + rand() * 0.16})`;
      ctx.lineWidth = 0.5 + rand() * 1.6;
      ctx.beginPath();
      let x = rand() * s, y = 0;
      ctx.moveTo(x, y);
      while (y < s) {
        x += rand() * 60 - 30;
        y += 12 + rand() * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }, { repeat });
}

/** Crisp text label texture (museum wall typography). */
export function labelTexture(lines, { width = 1024, height = 256, bg = null, color = '#f3ead8', font = 'Georgia' } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  if (bg) { ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height); }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const n = lines.length;
  lines.forEach((line, i) => {
    ctx.fillStyle = line.color || color;
    ctx.font = `${line.italic ? 'italic ' : ''}${line.smallCaps ? 'small-caps ' : ''}${line.size || 64}px ${font}`;
    ctx.fillText(line.text, width / 2, (height * (i + 0.5)) / n, width - 40);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Subtle star/dust sprite for the timeline void. */
export function glowSpriteTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,250,235,0.6)');
  g.addColorStop(1, 'rgba(255,250,235,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
