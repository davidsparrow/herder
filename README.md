# 🐑 Herder

**Smart check-in for classes, camps, events — anything.**

Snap a photo of any paper roster. Herder uses Gemini AI to extract names, builds a live check-in list, and sends automated SMS/email notifications to guardians.

---

## Stack

| Layer         | Technology |
|---------------|------------|
| Framework     | Next.js 14 (App Router) |
| Auth + DB     | Supabase (magic link + Google OAuth) |
| AI Extraction | Google Gemini 1.5 Pro (vision) |
| Email         | Resend + React Email |
| Hosting       | Vercel |
| Styling       | Tailwind CSS |

---

## Setup

### 1. Clone & install

```bash
git clone <your-repo>
cd herder
npm install
```

### 2. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the migration file:
   ```
   supabase/migrations/0001_initial_schema.sql
   ```
3. In **Authentication → URL Configuration**, set:
   - Site URL: `http://localhost:3000` (dev) / `https://your-domain.com` (prod)
   - Redirect URLs: add `http://localhost:3000/auth/callback`

4. Enable **Google OAuth** if desired (Auth → Providers → Google)

### 3. Configure environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```bash
cp .env.local.example .env.local
```

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com) |
| `RESEND_API_KEY` | [Resend dashboard](https://resend.com) |
| `RESEND_FROM_EMAIL` | `no-reply@bendersaas.ai` (verify domain in Resend first) |

### 4. Run locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Vercel Deployment

1. Push to GitHub
2. Import into [Vercel](https://vercel.com)
3. Add all environment variables from `.env.local.example` in the Vercel dashboard
4. Deploy — Vercel auto-detects Next.js

---

## Plan Tiers

| Feature            | Free | Standard | Pro |
|-------------------|------|----------|-----|
| Max Lists         | 3    | ∞        | ∞   |
| Max Names / List  | 20   | ∞        | ∞   |
| Custom Columns    | ✗    | ✓        | ✓   |
| QR Code Check-in  | ✗    | ✓        | ✓   |
| Analytics         | ✗    | ✓        | ✓   |
| SMS/Email Alerts  | ✗    | ✗        | ✓   |
| Guardian Notifs   | ✗    | ✗        | ✓   |

**Admin can override any limit per-org** in the Admin → Plan Limits tab.

---

## Key Files

```
src/
  app/
    page.tsx                  # Landing page
    auth/
      login/page.tsx          # Magic link + Google OAuth
      callback/route.ts       # Auth callback → creates profile + org on first sign-in
    dashboard/
      layout.tsx              # Sidebar nav, topbar, auth guard
      page.tsx                # Dashboard home
      checkin/page.tsx        # Live check-in screen
      upload/page.tsx         # Upload → Gemini extract → map → schedule
      admin/page.tsx          # Plan limits, custom columns, notification rules
  lib/
    supabase/                 # Browser + server + middleware clients
    plans.ts                  # Plan definitions + gate helpers
    gemini.ts                 # Gemini vision extraction
    email.ts                  # Resend wrappers
    types.ts                  # TypeScript types
  emails/
    MagicLinkEmail.tsx        # Branded magic link email
    WelcomeEmail.tsx          # New user welcome
    ArrivalConfirmEmail.tsx   # Guardian: student arrived
    AbsentAlertEmail.tsx      # Guardian: student absent
  app/api/
    upload/route.ts           # POST: extract list from image/file
    lists/submit/route.ts     # POST: submit check-in + fire notifications
supabase/
  migrations/
    0001_initial_schema.sql   # Full schema + RLS policies
```

---

## Architecture Notes

### Auth flow
1. User enters email → Supabase sends magic link (or Google OAuth)
2. `/auth/callback` exchanges the code → checks if profile exists
3. **First sign-in**: creates Org + Profile (role: admin, plan: free) → redirects to `/onboard`
4. **Returning users**: redirect to `/dashboard`

### Plan gating
- `src/lib/plans.ts` defines all limits
- API routes call `canCreateList()` / `canAddName()` / `hasFeature()` before proceeding
- Admin can override per-org limits stored as `orgs.plan_overrides` JSONB
- Frontend shows upgrade prompts when limits are hit

### Gemini extraction
- `src/lib/gemini.ts` sends image as base64 to `gemini-1.5-pro`
- Returns structured JSON: `{ names[], detected_columns[], raw_text }`
- Upload page shows detected columns with confidence scores for user to confirm/remap
- Text/CSV input uses `gemini-1.5-flash` for speed

### Email via Resend
- All emails sent from `no-reply@bendersaas.ai`
- **Remember**: verify your domain in the Resend dashboard before sending
- React Email templates are in `src/emails/`
- Preview templates: `npx react-email dev`
