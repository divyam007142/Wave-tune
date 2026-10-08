# Wave Tune deployment

The Git repository root contains the React app, the Cloudflare Pages `functions/` proxy, and the Render blueprint. Deploy the app as two services:

- **Cloudflare Pages** builds the frontend and forwards same-origin `/api/*` requests through `functions/api/[[path]].ts`.
- **Render** runs the Express API and can also serve the built frontend as a fallback.

Use `.` (the repository root) as the root directory on both services. Do not use `Wave-tune`, `frontend/`, or another subdirectory for this checkout.

## 1. Deploy the API on Render

Create a Render Web Service from this repository and use the checked-in `render.yaml` blueprint. It sets the root directory to `.`, builds with `npm ci && npm run build`, starts with `npm run preview`, and checks `/api/health`.

Set these service environment variables:

| Variable | Purpose |
| --- | --- |
| `FRONTEND_ORIGIN` | `https://wave-tune-music.pages.dev`; comma-separate any additional allowed site origins |
| `MONGODB_URI` | MongoDB connection string for accounts, sessions, and saved music |
| `MONGODB_DB_NAME` | Database name; `wave_tune` is the default |
| `GOOGLE_CLIENT_ID` | Optional public Web client ID when enabling Google sign-in |

Email/password accounts and saved data need a working MongoDB connection. Google sign-in additionally needs `GOOGLE_CLIENT_ID`; browsing and music playback can still work without account storage. Spotify credentials are not used by the active catalog.

Render supplies the port; do not set a fixed `PORT`. Configure the MongoDB network access list to permit connections from the Render service. If enabling Google sign-in, create a **Web application** client in Google Cloud Console under **Google Auth Platform → Clients** and add `https://wave-tune-music.pages.dev` (and any custom site origins) to **Authorized JavaScript origins**. This popup sign-in flow needs no redirect URI or client secret.

After the first deploy, copy the Render service's origin, such as `https://your-render-service.onrender.com`. Use only the origin—not a trailing `/api` path.

## 2. Deploy the app on Cloudflare Pages

Connect the same repository as a Pages project and use:

| Setting | Value |
| --- | --- |
| Root directory | `.` |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |

In the Pages project's **Settings → Variables and Secrets**, add `WAVE_TUNE_API_ORIGIN` for the Functions runtime. Set the value to the Render service origin from step 1. Add it to Production and Preview environments if both should reach the API, then redeploy.

Do not place the MongoDB URI or other private server credentials in Cloudflare build variables. The Pages Function forwards `/api/*` to Render while keeping the browser request on the Pages site's origin.

Once Pages is live, confirm `FRONTEND_ORIGIN` in Render matches the actual Pages site origin. Add custom domains as comma-separated origins if needed.

## 3. Deploy the standalone landing page (optional)

`landing-page/` is static HTML, CSS, JavaScript, and local image assets. It needs no build command or Node runtime. To host it as its own Cloudflare Pages site, use `landing-page` as that project's root directory, leave the build command empty, and use `.` as the output directory. The buttons link to `https://wave-tune-music.pages.dev/`.

## Verify

Check the Render service first:

1. Open `/api/health` on the Render service and confirm it returns JSON with `status: "ok"`.
2. Open `/api/youtube/search?q=radiohead` and confirm it returns JSON with a `results` array.
3. Open `/api/catalog/trending` and confirm it returns JSON with a `tracks` array.

Then open those paths on the Pages domain; the Pages Function should return the same API responses. If an API URL returns the app HTML or a 404, check that Pages is rooted at `.`, that its `functions/` directory was deployed, and that `WAVE_TUNE_API_ORIGIN` points to the Render origin.

For a Git repository that nests this entire app in a subdirectory, use that subdirectory as both host roots and update the `rootDir` in `render.yaml` to match.
