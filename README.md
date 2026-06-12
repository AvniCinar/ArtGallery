# 🏛️ Musée Infini — A 3D Museum of Art History

An interactive 3D art museum that runs in the browser. Travel an **infinite, looping timeline** of art periods — from Gothic to Pop Art — zoom into a period to meet its famous artists, read their **museum placards**, and step inside a **walkable 3D gallery** of their actual paintings, hung with frames, spotlights and ACES tone mapping.

**Live:** https://avnicinar.github.io/ArtGallery/

All artworks, portraits and biographies are pulled from **Wikipedia / Wikidata / Wikimedia Commons** by an ingest pipeline and can be mirrored into a **Neon Postgres** database.

## Features

- **Infinite timeline hall** — 13 art periods (1280→1990) as glowing marble portals on a looping canvas; drag or scroll to travel, it wraps forever.
- **Period focus** — click a portal and the camera flies in (GSAP); the period's artists rise up as framed portrait cards.
- **Museum placards** — click an artist for a placard with portrait, life dates, and their Wikipedia biography.
- **Walkable galleries** — a procedurally built museum hall per artist: oak floors, plaster walls, a marble bench, per-painting spotlights with soft shadows, RoomEnvironment IBL, ACES filmic tone mapping. Walk with WASD (pointer lock), touch controls on mobile.
- **Real data** — 63 artists and 450+ paintings ranked by fame (Wikidata sitelinks), with titles, years and Commons images.

## Stack

| Layer | Tech |
| --- | --- |
| 3D | Three.js (WebGL2, ACES tone mapping, PCF soft shadows, PBR + IBL) |
| Animation | GSAP |
| Build | Vite |
| Data pipeline | Node script → Wikipedia REST + Wikidata SPARQL + Commons |
| Database | Neon Postgres (`@neondatabase/serverless`) |
| API | Vercel serverless function (`/api/data`) with static-JSON fallback |
| Hosting | GitHub Pages (static) or Vercel (static + API) |

## Run locally

```bash
npm install
npm run dev          # http://localhost:5173
```

The repo ships with a pre-generated dataset (`public/data/artdata.json`), so no keys are needed.

## Refresh the dataset

```bash
npm run ingest                 # re-fetch from Wikipedia/Wikidata → public/data/artdata.json
DATABASE_URL=... npm run ingest:db   # same, plus mirror into Neon Postgres
```

The ingest script creates the schema automatically (`periods`, `artists`, `artworks`) and upserts idempotently.

## Deploy

- **GitHub Pages** — pushed to `main`, the included workflow builds and deploys the static site (data served from the JSON snapshot).
- **Vercel + Neon** — import the repo in Vercel, set `DATABASE_URL` to your Neon connection string, run `npm run ingest:db` once; the site then serves data live from Postgres via `/api/data` (the frontend automatically prefers the API and falls back to the snapshot).

## Credits

All images and texts: [Wikipedia](https://www.wikipedia.org/), [Wikidata](https://www.wikidata.org/) and [Wikimedia Commons](https://commons.wikimedia.org/) — most works are public domain; some 20th-century works appear under their respective Commons licensing.
