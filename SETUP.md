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
| `VITE_CLERK_PUBLISHABLE_KEY` | Only for real sign-in | Clerk browser key |
| `VITE_CLERK_PROXY_URL` | No | Leave blank locally; the Pages deployment sets its production proxy URL |
| `CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` | Only for account features | Server-side Clerk verification |
| `MONGODB_URI` | No for browsing | Persistent profiles, likes, listening history, and playlists |
| `SPOTIFY_CLIENT_ID` and `SPOTIFY_CLIENT_SECRET` | No | Optional Spotify catalog access; YouTube search is the fallback |
| `FRONTEND_ORIGIN` | Usually no | Set to `http://localhost:5000` if testing a cross-origin request |

Without Clerk configured, public catalog and guest playback still run; sign-in and saved account features are unavailable. Without Spotify credentials, the catalog uses YouTube search and shows a notice. YouTube playback runs in its embedded player.

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
- **Catalog works but sign-in/account pages do not:** configure both Clerk browser and server variables; MongoDB is also needed for saved account data.
- **API URLs return HTML instead of JSON in production:** check that Pages is rooted at `Wave-tune`, that its `functions/` directory was deployed, and that the Render origin is correct. See [DEPLOYMENT.md](DEPLOYMENT.md).
