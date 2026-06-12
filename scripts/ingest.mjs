/**
 * Ingest pipeline: Wikipedia + Wikidata (Wikimedia Commons) -> public/data/artdata.json
 * Optionally mirrors the dataset into Neon Postgres with `--to-db` (requires DATABASE_URL).
 *
 *  - Period blurbs come from the Wikipedia REST summary API.
 *  - Artist bios + portraits come from the Wikipedia REST summary API.
 *  - Paintings (title, year, Commons image) come from the Wikidata SPARQL endpoint,
 *    ranked by sitelink count so the most famous works appear first.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = join(ROOT, 'public', 'data', 'artdata.json');
const UA = 'ArtGalleryMuseum/1.0 (https://github.com/AvniCinar/ArtGallery; educational project)';
const TO_DB = process.argv.includes('--to-db');

/** Curated canon: period -> Wikipedia movement page + artist Wikipedia titles. */
const PERIODS = [
  { id: 'medieval', name: 'Medieval & Gothic', start: 1280, end: 1450, wiki: 'Gothic art', color: '#7c5cbf',
    artists: ['Giotto', 'Duccio', 'Jan van Eyck', 'Hieronymus Bosch'] },
  { id: 'renaissance', name: 'Renaissance', start: 1450, end: 1600, wiki: 'Renaissance art', color: '#c9a227',
    artists: ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Sandro Botticelli', 'Titian', 'Albrecht Dürer'] },
  { id: 'baroque', name: 'Baroque', start: 1600, end: 1725, wiki: 'Baroque painting', color: '#a3402e',
    artists: ['Caravaggio', 'Rembrandt', 'Peter Paul Rubens', 'Johannes Vermeer', 'Diego Velázquez'] },
  { id: 'rococo', name: 'Rococo', start: 1725, end: 1780, wiki: 'Rococo', color: '#d98ca6',
    artists: ['Jean-Antoine Watteau', 'François Boucher', 'Jean-Honoré Fragonard', 'Thomas Gainsborough'] },
  { id: 'neoclassicism', name: 'Neoclassicism', start: 1780, end: 1820, wiki: 'Neoclassicism', color: '#8fa8bf',
    artists: ['Jacques-Louis David', 'Jean-Auguste-Dominique Ingres', 'Angelica Kauffman'] },
  { id: 'romanticism', name: 'Romanticism', start: 1820, end: 1850, wiki: 'Romanticism', color: '#5e7d54',
    artists: ['Francisco Goya', 'Caspar David Friedrich', 'Eugène Delacroix', 'J. M. W. Turner', 'Théodore Géricault'] },
  { id: 'realism', name: 'Realism', start: 1850, end: 1870, wiki: 'Realism (arts)', color: '#94704c',
    artists: ['Gustave Courbet', 'Jean-François Millet', 'Honoré Daumier', 'Ilya Repin'] },
  { id: 'impressionism', name: 'Impressionism', start: 1870, end: 1890, wiki: 'Impressionism', color: '#6db3c4',
    artists: ['Claude Monet', 'Édouard Manet', 'Pierre-Auguste Renoir', 'Edgar Degas', 'Camille Pissarro', 'Berthe Morisot'] },
  { id: 'post-impressionism', name: 'Post-Impressionism', start: 1890, end: 1905, wiki: 'Post-Impressionism', color: '#e0913d',
    artists: ['Vincent van Gogh', 'Paul Cézanne', 'Paul Gauguin', 'Georges Seurat', 'Henri de Toulouse-Lautrec'] },
  { id: 'expressionism', name: 'Expressionism', start: 1905, end: 1925, wiki: 'Expressionism', color: '#c4453a',
    artists: ['Edvard Munch', 'Egon Schiele', 'Ernst Ludwig Kirchner', 'Wassily Kandinsky'] },
  { id: 'cubism', name: 'Cubism & Modernism', start: 1907, end: 1940, wiki: 'Cubism', color: '#5a6e8c',
    artists: ['Pablo Picasso', 'Georges Braque', 'Juan Gris', 'Fernand Léger', 'Henri Matisse'] },
  { id: 'surrealism', name: 'Surrealism & Fantasy', start: 1924, end: 1955, wiki: 'Surrealism', color: '#9355a8',
    artists: ['Salvador Dalí', 'René Magritte', 'Joan Miró', 'Henri Rousseau', 'Odilon Redon', 'Giorgio de Chirico'] },
  { id: 'modern', name: 'Abstraction & Pop', start: 1910, end: 1990, wiki: 'Abstract art', color: '#e0589a',
    artists: ['Piet Mondrian', 'Kazimir Malevich', 'Paul Klee', 'Edward Hopper', 'Andy Warhol', 'Roy Lichtenstein'] },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, opts = {}, attempt = 1) {
  try {
    const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Accept: 'application/json', ...(opts.headers || {}) } });
    if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { fatal: true });
    return await res.json();
  } catch (err) {
    if (err.fatal || attempt >= 4) throw err;
    await sleep(1500 * attempt);
    return fetchJson(url, opts, attempt + 1);
  }
}

const wikiSummary = (title) =>
  fetchJson(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replaceAll(' ', '_'))}`);

/** Commons thumb URL straight from the canonical filename (md5 path scheme) — avoids per-image redirects. */
function commonsThumb(fileName, width) {
  const name = decodeURIComponent(fileName).replaceAll(' ', '_');
  const md5 = createHash('md5').update(name).digest('hex');
  const enc = encodeURIComponent(name);
  const lossy = /\.tiff?$/i.test(name) ? 'lossy-page1-' : '';
  const suffix = /\.(tiff?)$/i.test(name) ? '.jpg' : '';
  return `https://upload.wikimedia.org/wikipedia/commons/thumb/${md5[0]}/${md5.slice(0, 2)}/${enc}/${lossy}${width}px-${enc}${suffix}`;
}

function fileNameFromImageUrl(url) {
  // SPARQL returns http://commons.wikimedia.org/wiki/Special:FilePath/<encoded name>
  const m = url.match(/Special:FilePath\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function sparql(query) {
  const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(query)}`;
  return fetchJson(url);
}

async function worksForArtist(qid) {
  const q = `
    SELECT ?work ?workLabel ?image ?inception ?sitelinks WHERE {
      ?work wdt:P170 wd:${qid} ;
            wdt:P31 wd:Q3305213 ;
            wdt:P18 ?image ;
            wikibase:sitelinks ?sitelinks .
      OPTIONAL { ?work wdt:P571 ?inception . }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
    ORDER BY DESC(?sitelinks)
    LIMIT 12`;
  const data = await sparql(q);
  const seen = new Set();
  const works = [];
  for (const b of data.results.bindings) {
    const label = b.workLabel?.value || '';
    if (!label || /^Q\d+$/.test(label) || seen.has(label)) continue;
    const fileName = fileNameFromImageUrl(b.image.value);
    if (!fileName || !/\.(jpe?g|png|tiff?)$/i.test(fileName)) continue;
    seen.add(label);
    works.push({
      title: label,
      year: b.inception ? Number(b.inception.value.slice(0, b.inception.value.startsWith('-') ? 5 : 4)) : null,
      file: fileName,
      image: commonsThumb(fileName, 1280),
      thumb: commonsThumb(fileName, 480),
    });
    if (works.length >= 8) break;
  }
  return works;
}

async function lifeDates(qids) {
  const q = `
    SELECT ?artist ?birth ?death WHERE {
      VALUES ?artist { ${qids.map((q2) => `wd:${q2}`).join(' ')} }
      OPTIONAL { ?artist wdt:P569 ?birth . }
      OPTIONAL { ?artist wdt:P570 ?death . }
    }`;
  const data = await sparql(q);
  const map = {};
  for (const b of data.results.bindings) {
    const qid = b.artist.value.split('/').pop();
    if (!map[qid]) {
      map[qid] = {
        birth: b.birth ? Number(b.birth.value.slice(0, 4)) : null,
        death: b.death ? Number(b.death.value.slice(0, 4)) : null,
      };
    }
  }
  return map;
}

async function main() {
  const out = { generated: new Date().toISOString(), source: 'Wikipedia / Wikidata / Wikimedia Commons', periods: [] };
  const allQids = [];

  for (const p of PERIODS) {
    process.stdout.write(`\n== ${p.name} ==\n`);
    const periodSummary = await wikiSummary(p.wiki).catch(() => null);
    const period = {
      id: p.id, name: p.name, start: p.start, end: p.end, color: p.color,
      blurb: periodSummary?.extract || '',
      wikiUrl: periodSummary?.content_urls?.desktop?.page || '',
      artists: [],
    };

    for (const name of p.artists) {
      try {
        const s = await wikiSummary(name);
        const qid = s.wikibase_item;
        if (!qid) throw new Error('no wikidata item');
        const works = await worksForArtist(qid);
        if (!works.length) {
          process.stdout.write(`  -- ${name}: no paintings found, skipped\n`);
          continue;
        }
        allQids.push(qid);
        period.artists.push({
          name: s.title,
          qid,
          description: s.description || '',
          bio: s.extract || '',
          portrait: s.thumbnail?.source || null,
          wikiUrl: s.content_urls?.desktop?.page || '',
          works,
        });
        process.stdout.write(`  ok ${s.title}: ${works.length} works\n`);
        await sleep(250);
      } catch (err) {
        process.stdout.write(`  !! ${name}: ${err.message}\n`);
      }
    }
    out.periods.push(period);
  }

  process.stdout.write('\nFetching life dates...\n');
  for (let i = 0; i < allQids.length; i += 40) {
    const dates = await lifeDates(allQids.slice(i, i + 40));
    for (const period of out.periods) {
      for (const a of period.artists) {
        if (dates[a.qid]) Object.assign(a, dates[a.qid]);
      }
    }
  }

  await mkdir(dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, JSON.stringify(out, null, 1));
  const nArtists = out.periods.reduce((n, p) => n + p.artists.length, 0);
  const nWorks = out.periods.reduce((n, p) => n + p.artists.reduce((m, a) => m + a.works.length, 0), 0);
  process.stdout.write(`\nWrote ${OUT_FILE}\n${out.periods.length} periods, ${nArtists} artists, ${nWorks} artworks\n`);

  if (TO_DB) await pushToNeon(out);
}

async function pushToNeon(data) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    process.stderr.write('DATABASE_URL not set — skipping Neon upload.\n');
    process.exitCode = 1;
    return;
  }
  const { neon } = await import('@neondatabase/serverless');
  const sql = neon(url);
  process.stdout.write('Creating schema in Neon...\n');
  await sql`CREATE TABLE IF NOT EXISTS periods (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, start_year INT, end_year INT,
    color TEXT, blurb TEXT, wiki_url TEXT, sort INT)`;
  await sql`CREATE TABLE IF NOT EXISTS artists (
    qid TEXT PRIMARY KEY, period_id TEXT REFERENCES periods(id), name TEXT NOT NULL,
    description TEXT, bio TEXT, portrait TEXT, wiki_url TEXT, birth INT, death INT, sort INT)`;
  await sql`CREATE TABLE IF NOT EXISTS artworks (
    id SERIAL PRIMARY KEY, artist_qid TEXT REFERENCES artists(qid),
    title TEXT NOT NULL, year INT, file TEXT, image TEXT, thumb TEXT, sort INT,
    UNIQUE (artist_qid, title))`;

  for (const [pi, p] of data.periods.entries()) {
    await sql`INSERT INTO periods (id, name, start_year, end_year, color, blurb, wiki_url, sort)
      VALUES (${p.id}, ${p.name}, ${p.start}, ${p.end}, ${p.color}, ${p.blurb}, ${p.wikiUrl}, ${pi})
      ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, start_year=EXCLUDED.start_year,
        end_year=EXCLUDED.end_year, color=EXCLUDED.color, blurb=EXCLUDED.blurb,
        wiki_url=EXCLUDED.wiki_url, sort=EXCLUDED.sort`;
    for (const [ai, a] of p.artists.entries()) {
      await sql`INSERT INTO artists (qid, period_id, name, description, bio, portrait, wiki_url, birth, death, sort)
        VALUES (${a.qid}, ${p.id}, ${a.name}, ${a.description}, ${a.bio}, ${a.portrait}, ${a.wikiUrl}, ${a.birth}, ${a.death}, ${ai})
        ON CONFLICT (qid) DO UPDATE SET period_id=EXCLUDED.period_id, name=EXCLUDED.name,
          description=EXCLUDED.description, bio=EXCLUDED.bio, portrait=EXCLUDED.portrait,
          wiki_url=EXCLUDED.wiki_url, birth=EXCLUDED.birth, death=EXCLUDED.death, sort=EXCLUDED.sort`;
      for (const [wi, w] of a.works.entries()) {
        await sql`INSERT INTO artworks (artist_qid, title, year, file, image, thumb, sort)
          VALUES (${a.qid}, ${w.title}, ${w.year}, ${w.file}, ${w.image}, ${w.thumb}, ${wi})
          ON CONFLICT (artist_qid, title) DO UPDATE SET year=EXCLUDED.year, file=EXCLUDED.file,
            image=EXCLUDED.image, thumb=EXCLUDED.thumb, sort=EXCLUDED.sort`;
      }
    }
  }
  process.stdout.write('Neon upload complete.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
