# Project architecture notes

- Face verification is client-side using `@vladmandic/face-api` and local descriptor generation; the server stores only encrypted face templates and compares the Euclidean distance against the configured threshold.
- Attendance and profile writes must be authorized before they touch the database, and role checks should rely on the stored role metadata rather than any client-supplied values.
- The app uses Supabase for authentication, storage, and secured access patterns. Keep service-role operations server-only and protect routes and RPC endpoints with appropriate checks.
- The first administrator should be provisioned through the bootstrap flow only when no admin role exists.
- The app preserves a navy-and-gold institutional theme and should stay aligned with the Digital Sign-In Auditor branding rather than generated template styling.
