# Wave Tune deployment

Wave Tune is deployed as one repository with two services:

- **Cloudflare Pages** builds the React app and runs the Pages Function in `functions/` as a same-origin API proxy.
- **Render** runs the Express API and serves the built app as a fallback.

The Git checkout contains the app in the `Wave-tune/` subdirectory. Set `Wave-tune` as the project root on both hosts. The Pages `functions/` directory is inside that folder; using the checkout root or `frontend/` prevents Pages from discovering the proxy.

## Cloudflare Pages

In the Pages project build settings:

| Setting | Value |
| --- | --- |
| Root directory | `Wave-tune` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |

Add these variables in the Pages environment and build a new deployment after changing them:

| Variable | Value |
| --- | --- |
| `WAVE_TUNE_API_ORIGIN` | The Render service origin, for example `https://your-render-service.onrender.com` |
| `VITE_CLERK_PUBLISHABLE_KEY` | The Clerk publishable key for the environment being built |
| `VITE_CLERK_PROXY_URL` | `https://your-pages-domain.example/api/__clerk` |

Set the Clerk variables for both Production and Preview if both deployment types need sign-in. The publishable key and proxy URL are included in the browser build; do not put a Clerk secret, Spotify secret, or database URI in Cloudflare's browser-facing variables.

The Pages Function forwards `/api/*` requests to Render. `WAVE_TUNE_API_ORIGIN` must be only the Render origin, without `/api` at the end.

## Render

Use `Wave-tune` as the service root directory. The checked-in `render.yaml` sets this with `rootDir`, builds with `npm ci && npm run build`, starts with `npm run preview`, and checks `/api/health`.

Configure these service environment variables:

| Variable | Purpose |
| --- | --- |
| `FRONTEND_ORIGIN` | Exact Cloudflare Pages/custom-domain origin; comma-separate any additional allowed origins |
| `CLERK_SECRET_KEY` | Private Clerk server key |
| `CLERK_PUBLISHABLE_KEY` | Clerk key used by the server middleware |
| `VITE_CLERK_PUBLISHABLE_KEY` | Publishable key embedded when Render builds its fallback app |
| `VITE_CLERK_PROXY_URL` | The Pages URL followed by `/api/__clerk` |
| `SPOTIFY_CLIENT_ID` | Optional server-side Spotify catalog access |
| `SPOTIFY_CLIENT_SECRET` | Optional private Spotify catalog credential |
| `MONGODB_URI` | MongoDB connection string for account and playlist storage |
| `MONGODB_DB_NAME` | Database name; `wave_tune` is the default |

Render supplies `PORT`; do not set a fixed port. Spotify access is optional for catalog browsing: if Spotify denies or cannot serve a request, the API searches YouTube and returns a notice with the results. MongoDB is needed for persisted signed-in account features, but not for browsing the catalog.

## Verify a deployment

Check the Render service first:

1. Open `/api/health` on the Render service and confirm it returns JSON with `status: "ok"`.
2. Open `/api/youtube/search?q=radiohead` and confirm it returns JSON with a `results` array.
3. Open `/api/catalog/trending` and confirm it returns JSON with a `tracks` array. If Spotify is blocked, the response should also include a `notice`.

Then check the same API paths on the Pages domain. They should return the Render JSON through the Pages Function. If a Pages API URL returns the Wave Tune HTML page or a 404, check that the Pages root is `Wave-tune`, that `Wave-tune/functions/` was included in the deployment, and that `WAVE_TUNE_API_ORIGIN` points to the Render origin.

If the new site still shows the old Spotify-connect screen, verify that the latest commit was deployed from this repository and that Pages is building from `Wave-tune`, not the checkout root, `frontend/`, or an older branch. The current source does not require a Spotify user connection to browse or play catalog tracks.
