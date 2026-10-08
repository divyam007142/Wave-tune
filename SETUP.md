# Local setup (VS Code)

## Prerequisites

- Node.js 22.12 or newer and npm
- VS Code
- The repository checked out locally

Open the repository root in VS Code—the folder containing `package.json`, `render.yaml`, and `functions/`—then open **Terminal → New Terminal**. If this app is nested inside a larger Git checkout, `cd` into the app folder before running commands.

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
| `GOOGLE_CLIENT_ID` | Only for Google sign-in | Public Google Identity Services client ID; the server uses it to verify sign-in tokens |
| `FRONTEND_ORIGIN` | Usually no | Set to `http://localhost:5000` if testing a cross-origin request |

The active catalog uses YouTube search and discovery. Spotify credentials are not needed. Tracks play through Wave Tune's YouTube-based playback service.

Wave Tune uses Google Identity Services for account selection and verifies each signed identity token on the server. Configure Google once:

1. In [Google Cloud Console](https://console.cloud.google.com/), select or create a project and open **Google Auth Platform → Branding** to set the app name and support email.
2. Open **Google Auth Platform → Clients → Create client**. Choose **Web application**.
3. Add each site origin under **Authorized JavaScript origins**. For local development, add `http://localhost:5000`. For the hosted site, add its exact origin (scheme and host only, with no path). Add the origin users open to sign in from; do not put the API service URL here unless users visit that origin.
4. Copy the Web application's **Client ID** (ending in `.apps.googleusercontent.com`) to `GOOGLE_CLIENT_ID` in `.env`. For a hosted deployment, set the same variable in the API server's environment settings instead.
5. Use the default `openid`, `email`, and `profile` identity scopes. This sign-in flow uses Google's popup credential callback, so it does **not** need a client secret or an authorized redirect URI. Do not create or add `GOOGLE_CLIENT_SECRET`.

Only the Google ID, verified email, name, and HTTPS profile image are stored for the Google identity. Wave Tune stores user accounts and persistent sessions in MongoDB, matches returning users by Google account ID or verified email, and never receives or stores Google passwords. A MongoDB connection error does not stop catalog search or YouTube playback.

Email/password accounts use a salted scrypt password hash; raw passwords are never stored. Passwords must be 12–128 characters. Email/password registration does not currently verify the email address or provide password-reset email, and accounts cannot yet link Google and password sign-in methods. Users should continue signing in with the method they used to register.

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
- **Account storage fails:** check the MongoDB URI, DNS resolution, and network/IP access list.
- **Google sign-in fails:** confirm `GOOGLE_CLIENT_ID` is set on the server and the app origin is authorized in Google Cloud.
- **API URLs return HTML instead of JSON in production:** check that Pages is rooted at `.`, that its `functions/` directory was deployed, and that the Render origin is correct. See [DEPLOYMENT.md](DEPLOYMENT.md).
