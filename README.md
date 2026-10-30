# BookLoop 📚 — Campus Textbook Marketplace (Pune MVP)

> A lightweight, student-to-student second-hand textbook marketplace designed specifically for schools and colleges across Pune. Built to make textbooks affordable, reduce paper waste, and safeguard student privacy with public campus daylight meetups.

---

## 🚀 Key Highlights & Architectural Guarantees

- **Privacy-First Handover:** Student phone numbers and emails are never exposed publicly. A seller's WhatsApp number is encrypted at rest and only revealed to a single buyer after the seller explicitly accepts their interest request.
- **Strict Row-Level Security (RLS):** Every database operation on profiles, listings, interest requests, and reports is strictly protected by PostgreSQL RLS policies.
- **Campus Daylight Meetups:** Designed exclusively for daytime campus handovers at recognized Pune schools, junior colleges, universities, and coaching hubs.
- **Admin & Safety Moderation:** Dedicated moderation suite (`/admin`) guarded by database-level roles (`admin_roles`), immutable audit logs (`admin_audit_logs`), and direct content takedown/user suspension capabilities.
- **Mobile First & Accessible:** Responsive down to 360px viewports with touch targets ≥ 44px, full keyboard navigation, high contrast, and reduced-motion support.

---

## 🛠 Tech Stack

- **Frontend:** React 19, Vite v6, React Router v7, Lucide Icons
- **Backend & Database:** Supabase (PostgreSQL 15+, PostgREST, Row-Level Security)
- **Authentication:** Supabase Auth (Strict Email Verification)
- **Storage:** Supabase Storage (`listing-photos` bucket with 5MB file caps and JPEG/PNG/WebP validation)
- **Deployment:** Vercel / Netlify with HTTPS and SPA routing rewrites

---

## 📦 Local Development Setup

### 1. Prerequisites
- Node.js 18+ and npm
- A free [Supabase](https://supabase.com) project

### 2. Clone and Install Dependencies
```bash
git clone <your-repo-url>
cd BookLoop
npm install
```

### 3. Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your project credentials from your Supabase Dashboard (`Project Settings` > `API`):
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

> **Security Note:** Never commit `.env` or `.env.local` to source control. The `.gitignore` file is configured to strictly exclude all environment secret files. Never put the Supabase `service_role` key in frontend code.

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🗄 Database Setup & Migrations

To initialize your Supabase database:

1. Open your **Supabase Dashboard** > **SQL Editor**.
2. Run **`supabase/migrations/20261030000000_initial_schema.sql`**:
   - Creates `institutions`, `profiles`, `listings`, `listing_images`, `interest_requests`, `reports`, `admin_roles`, and `admin_audit_logs`.
   - Sets up initial constraints, indexes, and triggers.
3. Run **`supabase/migrations/20261030000001_security_and_rls_lockdown.sql`**:
   - Enforces strict Row Level Security (RLS) policies.
   - Creates the `public_catalogue` view for sanitized public reading.
   - Installs controlled stored procedures: `accept_interest_request`, `revoke_interest_request_acceptance`, `decline_interest_request`, `cancel_interest_request`, `mark_listing_sold`, `get_seller_contact`, `admin_suspend_user`, `admin_reactivate_user`, `admin_hide_listing`, and `admin_update_report_status`.
4. Run **`supabase/seed.sql`**:
   - Seeds Pune institutions (COEP Tech, Fergusson College, PICT, VIT, Bishop's School, BMCC, Allen Pune, etc.).
   - Seeds pilot book listings with realistic Indian Rupee prices (stored as paise).

### Setting Up Storage Bucket
1. Go to **Storage** > **New Bucket**.
2. Name the bucket: **`listing-photos`**.
3. Toggle **Public bucket: ON** (read-only for images).
4. Storage policies configured in migration allow authenticated users to upload up to 3 photos per listing (max 5MB each).

---

## 🛡 Creating Your First Administrator

Administrative capabilities (`/admin`) are restricted to users listed in the `admin_roles` table:

1. Sign up for a normal student account through the BookLoop web interface.
2. Go to your **Supabase Dashboard** > **SQL Editor** and run:

```sql
-- Replace <YOUR_USER_UUID> with your auth.users ID
INSERT INTO public.admin_roles (user_id, role)
VALUES ('<YOUR_USER_UUID>', 'admin')
ON CONFLICT (user_id) DO NOTHING;
```

Once executed, sign in and navigate to `/admin` to access the Safety & Moderation Center.

---

## 🧪 Running Security & RLS Tests

Automated RLS test assertions are provided in `supabase/tests/rls_security_tests.sql`.

To run the verification suite:
1. Open **Supabase Dashboard** > **SQL Editor**.
2. Paste and run the contents of `supabase/tests/rls_security_tests.sql`.
3. The script verifies:
   - Anonymous readers can query active books via `public_catalogue` without exposing phone numbers.
   - Non-accepted buyers cannot query seller WhatsApp contact.
   - Users cannot edit listings owned by other students.
   - Non-admins cannot invoke moderation RPCs or access `admin_audit_logs`.

---

## 🚢 Production Deployment (Vercel & Netlify)

### Deploying to Vercel
1. Push your repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com).
3. In **Project Settings** > **Environment Variables**, add:
   - `VITE_SUPABASE_URL`: `https://your-project-id.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `your-anon-key`
4. The included `vercel.json` ensures all deep routes (`/search`, `/listings/123`, `/profile`, `/admin`) correctly rewrite to `index.html`.
5. Deploy.

### Deploying to Netlify
1. Connect your repository to [Netlify](https://netlify.com).
2. Set Build Command: `npm run build`
3. Set Publish directory: `dist`
4. In **Site Configuration** > **Environment variables**, set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
5. The included `public/_redirects` handles SPA client routing.

### Supabase Auth URL Configuration
After deploying your production domain (e.g. `https://bookloop.vercel.app`):
1. Go to **Supabase Dashboard** > **Authentication** > **URL Configuration**.
2. Set **Site URL** to: `https://your-domain.vercel.app`
3. Under **Redirect URLs**, add:
   - `https://your-domain.vercel.app/**`
   - `http://localhost:5173/**` (for local development)

---

## 📋 Acceptance Verification Matrix

| Area | Feature / Check | Status | Verification Method |
|---|---|---|---|
| **Auth** | Email confirmation notice | ✅ PASS | Verified humble tone alert on registration |
| **Auth** | Logged-out restrictions | ✅ PASS | Protected routes redirect to `/login` |
| **Auth** | Suspended accounts blocked | ✅ PASS | RLS + UI banner prevents listing / requesting |
| **Listings** | Create / Edit / Remove own | ✅ PASS | Verified on Profile and Create pages |
| **Listings** | Photo requirement (1-3 images) | ✅ PASS | Enforced on client and storage limits |
| **Listings** | Price validation in Rupees | ✅ PASS | Non-negative validation; stored in paise |
| **Listings** | Sold books hidden from search | ✅ PASS | Filtered `status = 'active'` in query view |
| **Requests** | Single active request per book | ✅ PASS | Unique constraint + switch buyer confirmation |
| **Requests** | Cannot request own book | ✅ PASS | Enforced in UI button and database constraint |
| **Requests** | Notification badge behavior | ✅ PASS | Persistent visit tracking removes dot upon viewing |
| **Privacy** | Phone hidden in public search | ✅ PASS | Enforced via `public_catalogue` view |
| **Privacy** | WhatsApp reveal to accepted buyer | ✅ PASS | Verified via `get_seller_contact` RPC |
| **Moderation**| Report listing & user | ✅ PASS | Tested submission to `public.reports` |
| **Moderation**| Admin dashboard & actions | ✅ PASS | Guarded by `admin_roles`; logs to audit table |
| **Usability** | 360px mobile viewports | ✅ PASS | Flexible grid, horizontal scroll, touch targets ≥ 44px |

---

## ⚖️ License & Campus Community Notice

BookLoop is built as a peer-to-peer student service. Commercial use, data scraping of student listings, and distribution of pirated copyright materials are strictly prohibited under platform terms.

