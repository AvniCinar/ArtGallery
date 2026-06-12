/**
 * Vercel serverless function: serves the full museum dataset from Neon Postgres.
 * Requires the DATABASE_URL env var (Neon connection string) and a database
 * populated via `npm run ingest:db`.
 */
import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  const url = process.env.DATABASE_URL;
  if (!url) return res.status(503).json({ error: 'DATABASE_URL not configured' });

  try {
    const sql = neon(url);
    const [periods, artists, artworks] = await Promise.all([
      sql`SELECT * FROM periods ORDER BY sort`,
      sql`SELECT * FROM artists ORDER BY sort`,
      sql`SELECT * FROM artworks ORDER BY sort`,
    ]);

    const byArtist = {};
    for (const w of artworks) {
      (byArtist[w.artist_qid] ||= []).push({
        title: w.title, year: w.year, file: w.file, image: w.image, thumb: w.thumb,
      });
    }
    const byPeriod = {};
    for (const a of artists) {
      (byPeriod[a.period_id] ||= []).push({
        name: a.name, qid: a.qid, description: a.description, bio: a.bio,
        portrait: a.portrait, wikiUrl: a.wiki_url, birth: a.birth, death: a.death,
        works: byArtist[a.qid] || [],
      });
    }

    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json({
      source: 'neon',
      periods: periods.map((p) => ({
        id: p.id, name: p.name, start: p.start_year, end: p.end_year,
        color: p.color, blurb: p.blurb, wikiUrl: p.wiki_url,
        artists: byPeriod[p.id] || [],
      })),
    });
  } catch (err) {
    return res.status(500).json({ error: String(err.message || err) });
  }
}
