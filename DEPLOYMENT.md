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

Keep the Spotify client secret and MongoDB URI on the server. The Google client ID is public and is returned by the server to initialize Google Identity Services; do not add private credentials to Cloudflare's browser-facing build variables.

The Pages Function forwards `/api/*` requests to Render. `WAVE_TUNE_API_ORIGIN` must be only the Render origin, without `/api` at the end.

## Render

Use `Wave-tune` as the service root directory. The checked-in `render.yaml` sets this with `rootDir`, builds with `npm ci && npm run build`, starts with `npm run preview`, and checks `/api/health`.

Configure these service environment variables:

| Variable | Purpose |
| --- | --- |
| `FRONTEND_ORIGIN` | Exact Cloudflare Pages/custom-domain origin; comma-separate any additional allowed origins |
| `GOOGLE_CLIENT_ID` | Public Web application client ID for Google Identity Services |
| `SPOTIFY_CLIENT_ID` | Optional server-side Spotify catalog access |
| `SPOTIFY_CLIENT_SECRET` | Optional private Spotify catalog credential |
| `MONGODB_URI` | MongoDB connection string for account and playlist storage |
| `MONGODB_DB_NAME` | Database name; `wave_tune` is the default |

Render supplies `PORT`; do not set a fixed port. Create a **Web application** client in Google Cloud Console under **Google Auth Platform → Clients**, and add the user-facing Pages/custom-domain origins to **Authorized JavaScript origins**. Set that client's **Client ID** as `GOOGLE_CLIENT_ID` in Render's environment settings. The popup sign-in flow needs no redirect URI or client secret. MongoDB stores the Wave Tune accounts and sessions.

## Verify a deployment

Check the Render service first:

1. Open `/api/health` on the Render service and confirm it returns JSON with `status: "ok"`.
2. Open `/api/youtube/search?q=radiohead` and confirm it returns JSON with a `results` array.
3. Open `/api/catalog/trending` and confirm it returns JSON with a `tracks` array. If Spotify is blocked, the response should also include a `notice`.

Then check the same API paths on the Pages domain. They should return the Render JSON through the Pages Function. If a Pages API URL returns the Wave Tune HTML page or a 404, check that the Pages root is `Wave-tune`, that `Wave-tune/functions/` was included in the deployment, and that `WAVE_TUNE_API_ORIGIN` points to the Render origin.

If the new site still shows the old Spotify-connect screen, verify that the latest commit was deployed from this repository and that Pages is building from `Wave-tune`, not the checkout root, `frontend/`, or an older branch. The current source does not require a Spotify user connection to browse or play catalog tracks.
