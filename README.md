# Wave Tune

Wave Tune is a music discovery and playback web app. The React client is built with Vite; an Express service provides catalog, YouTube search, and account APIs.

## Hosting layout

```text
Listener
  └─ Cloudflare Pages: React app + functions/api/[[path]].ts
        └─ forwards /api/* to Render
            └─ Render: Express API, account routes, and production app fallback
```

The app lives in the `Wave-tune/` subdirectory of the Git checkout. Set that as the project root on both hosts. The Pages Function keeps browser API requests on the Cloudflare site’s origin; Render remains the API source of truth.

## Run locally in VS Code

See [SETUP.md](SETUP.md) for prerequisites, environment setup, and the local commands. The usual development command starts Express and Vite together:

```sh
cd Wave-tune
npm ci
npm run dev
```

Open `http://localhost:5000`. There is one local process because Express hosts Vite in middleware mode; no second frontend terminal is needed.

## Publish

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for the Cloudflare Pages and Render build settings, environment variables, and live endpoint checks.

## Useful scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Local full-stack development server on port 5000 |
| `npm run build` | Type-check client and server, then build the Vite app into `dist/` |
| `npm run preview` | Run the built app and API in production mode on port 5000 |

Spotify catalog access is optional. When Spotify denies a catalog request, Wave Tune searches YouTube and displays a notice with the fallback results. The YouTube iframe is used for playback; the app does not download or extract YouTube audio.
