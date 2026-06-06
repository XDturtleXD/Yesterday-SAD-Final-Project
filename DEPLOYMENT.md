# Deployment

This repo can be deployed as three services:

```text
Vercel: React/Vite frontend
Railway: Express backend
Railway: FastAPI OMR service with Audiveris
```

## Railway OMR Service

Create a Railway service from this repo.

```text
Root Directory: .
Dockerfile Path: services/omr/Dockerfile
Healthcheck Path: /health
```

Variables:

```env
AUDIVERIS_BIN=/opt/audiveris/bin/Audiveris
OMR_TEST_MAX_PAGES=all
```

Generate a public domain, then verify:

```text
https://your-omr.up.railway.app/health
```

Add a Railway volume to preserve conversion jobs:

```text
Mount Path: /app/jobs
```

The OMR Dockerfile builds Audiveris from the official Audiveris repository at
the `5.10.2` tag, then copies the generated command into `/opt/audiveris`.

## Railway Backend Service

Create a second Railway service from this repo.

```text
Root Directory: backend
Dockerfile Path: Dockerfile
Healthcheck Path: /api/health
```

Variables:

```env
NODE_ENV=production
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
JWT_SECRET=replace-with-a-long-random-string
JWT_EXPIRES_IN=7d
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
OMR_SERVICE_URL=https://your-omr.up.railway.app
```

Generate a public domain, then verify:

```text
https://your-backend.up.railway.app/api/health
```

## Vercel Frontend

Import this repo into Vercel.

```text
Framework Preset: Vite
Root Directory: .
Build Command: npm run build
Output Directory: dist
```

Variables:

```env
VITE_API_URL=https://your-backend.up.railway.app/api
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

Redeploy after changing `VITE_*` variables because Vite reads them at build time.
