# Local setup (VS Code)

## Prerequisites

- Node.js 22.12 or newer and npm
- VS Code
- The repository checked out locally

Open the `Wave-tune` app folder in VS Code, then open **Terminal → New Terminal**. If you opened the Git checkout root instead, first run `cd Wave-tune`. Run the commands from the folder containing `package.json`.

## Install and configure

```sh
npm ci
```

Copy `.env.example` to `.env`:

- macOS/Linux: `cp .env.example .env`
- Windows PowerShell: `Copy-Item .env.example .env`

Edit `.env` on your machine. Do not commit it or paste private values into chat.

| Variable | Required for local use? | Purpose |
| --- | --- | --- |
| `MONGODB_URI` | For accounts and saved data | User accounts, sessions, profiles, likes, listening history, and playlists |
| `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` | Only for Google sign-in | Server-side Google OAuth credentials |
| `GOOGLE_REDIRECT_URI` | Usually no in development | Override the callback URL if the public app is behind a proxy |
| `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` | Yes for live music catalog | Spotify search, charts, track metadata, artwork, and album/artist/playlist data |
| `FRONTEND_ORIGIN` | Usually no | Set to `http://localhost:5000` if testing a cross-origin request |

Spotify credentials are used by the server only; never put `SPOTIFY_CLIENT_SECRET` in a `VITE_` variable or browser code. Spotify supplies the catalog and music metadata. YouTube search is used only to resolve a playable video after a track is selected, and audio plays in YouTube's embedded player. If the Spotify API is unavailable or credentials are missing, the catalog shows an error instead of substituting YouTube search results.

Wave Tune manages email/password accounts and sessions itself. Passwords are stored as scrypt hashes; account records, sessions, and saved music are stored in MongoDB. Email/password sign-in works without Google OAuth. To enable Google, add the Google OAuth client ID and secret, then register `https://<your-Replit-dev-domain>/api/auth/google/callback` as an authorized redirect URI in Google Cloud. No forgot-password flow is provided. A MongoDB connection error does not stop catalog search or YouTube playback.

## Start the local app

```sh
npm run dev
```

Open `http://localhost:5000` in a browser. This starts one process: Express serves API routes and mounts Vite’s development server for the frontend. Vite handles hot updates, so edit a file and refresh only if the browser does not update automatically. Stop the server with **Ctrl+C**.

## Check a production build locally

```sh
npm run build
npm run preview
```

The build checks both client and server TypeScript before writing the frontend to `dist/`. The preview command serves that built frontend and the Express API in production mode. Stop it with **Ctrl+C**.

## Common problems

- **Port 5000 is busy:** stop the other process using it, then run `npm run dev` again.
- **The app shows an old screen:** make sure VS Code opened this repository’s root, then stop and restart the server.
- **Email sign-in or account storage fails:** check the MongoDB URI, DNS resolution, and network/IP access list.
- **Google sign-in fails:** confirm both Google OAuth credentials are set and the exact callback URI is authorized in Google Cloud.
- **API URLs return HTML instead of JSON in production:** check that Pages is rooted at `Wave-tune`, that its `functions/` directory was deployed, and that the Render origin is correct. See [DEPLOYMENT.md](DEPLOYMENT.md).
