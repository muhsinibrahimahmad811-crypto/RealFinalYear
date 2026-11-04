# Digital Sign-In Auditor

A secure attendance and verification workflow for staff and administrators. The app supports sign-in, face verification, role-aware access, and admin auditing.

## Features

- Staff sign-in and sign-out flows
- Face verification and enrollment for identity checks
- Admin and staff role-based access controls
- Attendance review and management dashboards
- Supabase-backed authentication and storage

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Deploy to Vercel

This TanStack Start app uses Nitro for Vercel deployment. Import the Git repository into Vercel and let it detect the TanStack Start framework; no custom output directory is needed.

Set the following environment variables in the Vercel project settings:

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for the browser client. These values are public.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` for server-side Supabase operations. Keep the service role key secret.
- `FACE_TEMPLATE_KEY` for face-template encryption.
- `CRON_SECRET` if using the cron endpoint.
- `DATABASE_URL` when running Drizzle migrations or database tooling.

Never use the `VITE_` prefix for secrets. Add environment variables for Production, Preview, and Development as appropriate, then redeploy after changing them.

## Environment variables

Create a local environment file with the required Supabase and app configuration values before running the app.

```bash
SUPABASE_URL=your-project-url
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
FACE_TEMPLATE_KEY=your-random-secret
DATABASE_URL=your-postgres-connection-string
```

Keep `.env` files out of version control. The `.env.example` file may be committed with placeholder values.

## Project structure

- `src/routes` — route-based app screens
- `src/components` — reusable UI and attendance features
- `src/integrations/supabase` — auth and database client setup
- `src/lib` — business logic and verification helpers
- `drizzle` — schema and migrations
