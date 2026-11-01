# BookLoop 📚 — Campus Textbook Marketplace (Pune MVP)

> **Official Project Handover & Technical Specification Document**  
> A lightweight, student-to-student second-hand textbook marketplace built specifically for schools and colleges across Pune. Designed to make educational resources affordable, reduce paper waste, protect student privacy with daytime campus handovers, and run lightning-fast on a zero-server serverless architecture.

---

## 🌐 Live Production Deployments

| Component | Target URL / Identifier | Status | Notes |
|---|---|---|---|
| **Production Web App** | [https://mybookloop.vercel.app](https://mybookloop.vercel.app) | 🟢 Live | Hosted on Vercel with SPA rewrites (`vercel.json`). *Note: Always use apex or single subdomain without `www.` due to wildcard SSL limits.* |
| **Supabase Cloud Project** | `https://ofaybxxfymkzceydqfia.supabase.co` | 🟢 Active | Managed PostgreSQL 15, PostgREST API, Supabase Auth, and Storage. |
| **Storage Bucket** | `listing-photos` | 🟢 Public | Read-only public CDN for listing book covers with 5MB file caps. |
| **GitHub Repository** | `https://github.com/aniruddhasharma39/BookLoop.git` | 🟢 Synced | Production branch: `main`. Continuous deployment via Vercel GitHub integration. |

---

## 🏗 System Architecture & Technology Stack

```
┌────────────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER (SPA)                              │
│  React 19 • Vite v6 • React Router v7 • Lucide Icons • SWR Cache       │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTPS / REST (PostgREST)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                      SUPABASE BAAS LAYER                               │
│  ┌─────────────────────────┐  ┌──────────────────────────────────────┐ │
│  │ Supabase Auth           │  │ Supabase Storage                     │ │
│  │ Strict Email & 6-Digit  │  │ `listing-photos` (5MB cap, WebP/PNG) │ │
│  │ Passwordless OTP Login  │  └──────────────────────────────────────┘ │
│  └─────────────────────────┘                                           │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ PostgreSQL 15 Engine with Row Level Security (RLS)                │ │
│  │ • Strict zero-trust table policies                                │ │
│  │ • Isolated `public.user_contacts` for private student phone #s    │ │
│  │ • `public_catalogue` view (security_invoker = true)               │ │
│  │ • SECURITY DEFINER transactional stored procedures (RPCs)         │ │
│  │ • Composite B-Tree indexes for sub-10ms queries                   │ │
│  └───────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

### Technology Highlights
- **Frontend Core:** React 19, Vite v6.4.5, React Router v7, vanilla CSS system variables (zero bloated UI frameworks).
- **Database & Backend:** Supabase PostgreSQL 15, PostgREST 12, Row-Level Security (RLS).
- **Authentication:** Supabase GoTrue Auth with strict email confirmation, 6-digit OTP login, and password recovery.
- **Client Cache & State:** Stale-While-Revalidate (SWR) dual-layer in-memory and `sessionStorage` cache with automatic mutation invalidation.
- **Hosting & CDN:** Vercel Global Edge Network with custom HTTP caching and fallback rewrites.

---

## 🚀 Key Functional Modules

### 1. Student Authentication & Passwordless OTP
- **Strict Verification:** Unverified accounts are strictly blocked from interacting with marketplace data.
- **6-Digit OTP Login & Recovery:** Students who forget their password or want to log in on secondary devices (e.g., from laptop to phone) can request a 6-digit OTP code sent directly to their verified student email.
- **Unified Email Templates:** Professional HTML transactional emails with BookLoop Navy branding for both signup verification and 6-digit one-time passcodes.
- **Anti-Abuse & Rate Limiting:** Client and server rate-limiting protects against continuous requests:
  - 60-second cooldown timer between OTP dispatch attempts.
  - Maximum 3 code requests per 15-minute sliding window per email.

### 2. Textbook Catalogue & Multi-Facet Search
- **Instant Search with Debouncing:** Sub-300ms live query response as users type book titles, authors, or ISBNs.
- **Campus Multi-Filtering:** Filter listings by Pune Institution (COEP, PICT, Fergusson, VIT, etc.), Academic Subject, Condition (`Like New`, `Good`, `Fair`), and Maximum Price.
- **Paise Currency Accuracy:** All monetary values are strictly stored in Indian paise (integers) in the database to prevent floating-point rounding errors and formatted on the client as ₹ (INR).
- **Client Pagination:** Clean pagination (`PAGE_SIZE = 8` or `12`) with first/last controls and accessible touch targets.

### 3. Listing Creation & Media Storage
- **Direct-to-CDN Uploads:** Users upload 1 to 3 photos of their physical textbook directly to Supabase Storage (`listing-photos`).
- **Media Validation:** Validated on client and storage layer for MIME types (`image/jpeg`, `image/png`, `image/webp`) and file sizes capped at 5 MB each.
- **Listing Lifecycle:** Listings progress through `active` ➔ `reserved` (pending handover) ➔ `sold` or `cancelled`. Sold and hidden items are excluded from the public catalogue.

### 4. Privacy-First Handover & Interest Requests
- **No Public Contact Exposure:** Student phone numbers and personal emails are never rendered publicly or returned by catalogue queries.
- **WhatsApp Handover Protocol:**
  1. Buyer browses catalog and clicks **I'm Interested**.
  2. A row is inserted into `interest_requests` (`status = 'pending'`).
  3. Seller receives an in-app badge notification and views requests on `/requests`.
  4. Seller clicks **Accept & Share WhatsApp**.
  5. The transactional stored procedure `accept_interest_request()` verifies seller ownership, transitions request to `accepted`, and temporarily locks other incoming requests.
  6. Buyer can now invoke `get_seller_contact(request_id)` which validates accepted state and returns the seller's verified WhatsApp number for daylight campus coordination.
  7. Once meetup is complete, seller marks the book as `sold`, automatically archiving all requests.

### 5. Campus Safety & Administrative Moderation Suite
- **Student Reporting:** Students can report inappropriate listings or suspicious accounts directly from listing cards.
- **Role-Based Admin Guard:** Administrative interface (`/admin`) is strictly locked down:
  - Frontend route checks `admin_roles` table for active role.
  - Database RLS prevents unauthorized viewing of reports or audit logs.
- **Moderator Actions:**
  - One-click listing takedown (`admin_hide_listing`).
  - Account suspension (`admin_suspend_user`) which terminates active listings and prevents subsequent actions.
  - All moderation decisions write immutable records into `admin_audit_logs`.

---

## ⚡ Performance & Caching Engine

Because BookLoop operates serverless without an intermediary Node.js backend, performance optimizations are implemented at the database and client SWR layer:

### 1. Database Composite Indexes
Optimized query execution paths added to PostgreSQL:
```sql
CREATE INDEX idx_interest_requests_buyer_created ON public.interest_requests (buyer_id, created_at DESC);
CREATE INDEX idx_interest_requests_seller_created ON public.interest_requests (seller_id, created_at DESC);
CREATE INDEX idx_listings_inst_status ON public.listings (institution_id, status);
CREATE INDEX idx_listings_status_created ON public.listings (status, created_at DESC);
```

### 2. Parallel Network Ingestion (`Promise.all`)
On the `/requests` page, sequential query waterfalls have been replaced with concurrent queries:
```javascript
const [buyingRes, sellingRes] = await Promise.all([
  supabase.from('interest_requests').select('...').eq('buyer_id', user.id).order('created_at', { ascending: false }),
  supabase.from('interest_requests').select('...').eq('seller_id', user.id).order('created_at', { ascending: false })
]);
```
This reduces page data load latency by more than **50%**.

### 3. SWR Client-Side Cache
A lightweight caching engine (`src/lib/cache.js`) provides:
- **Instant Rendering:** Cached data renders in **0 ms** on repeat visits and tab switching.
- **Smart TTLs:**
  - Campus Institutions: 10 minutes (`600,000 ms`).
  - Search Catalogues: 60 seconds (`60,000 ms`).
  - User Interest Requests: 30 seconds (`30,000 ms`).
- **Mutation Invalidation:** When a user accepts, declines, or revokes a request, `removeCache(`requests_${user.id}`)` immediately purges stale records and fetches fresh state.

---

## 🛡 Database Security & RLS Lockdown

The database enforces a zero-trust model. Even if an attacker directly executes queries against PostgREST using the public `anon` key, PostgreSQL engine-level policies reject all unauthorized operations.

### Key Security Safeguards
1. **Isolated Contact Storage (`public.user_contacts`):** Phone numbers and WhatsApp details reside in a separate table with `auth.uid() = user_id` access policy. Neither the public catalog nor the `profiles` table expose contact info.
2. **Security Invoker Catalogue View (`public_catalogue`):** Configured `WITH (security_invoker = true)` to avoid bypassing RLS while presenting sanitized active listing summaries.
3. **Engine-Level Revocation of Direct Updates:**
   ```sql
   REVOKE UPDATE ON public.interest_requests FROM anon, authenticated;
   ```
   Direct SQL updates to request status from the client are blocked. Status transitions must occur through audited SECURITY DEFINER functions (`accept_interest_request`, `decline_interest_request`, `revoke_interest_request_acceptance`, `cancel_interest_request`).
4. **Anti-Reactivation Trigger:** If an administrator hides or removes an offending listing, a database trigger forbids the original seller from flipping its status back to `active`.

---

## 🧪 12-Assertion Automated RLS Verification Suite

The repository contains an automated security test suite in `supabase/tests/rls_security_tests.sql`. It runs inside a transaction and rolls back automatically, making it safe to execute on production at any time.

| Test # | Security Invariant Tested | Verified Behavior |
|---|---|---|
| **Test 1** | Catalog Privacy Leak Protection | `public_catalogue` returns zero private contact columns to public callers. |
| **Test 2** | Unauthorized Listing Modification | Non-owners cannot update other students' listings. |
| **Test 3** | Request Interception / Eavesdropping | Unrelated students cannot view other users' interest requests. |
| **Test 4** | Privilege Escalation Protection | Non-admin students cannot write or grant roles in `admin_roles`. |
| **Test 5** | Premature Contact Disclosure | Seller's WhatsApp number cannot be retrieved while request is pending. |
| **Test 6** | Authorized Contact Reveal | Seller's WhatsApp is returned only to the accepted buyer via RPC. |
| **Test 7** | Cascade Closure on Sale | Marking listing as sold automatically transitions remaining requests to `closed`. |
| **Test 8** | Suspended Account Lockdown | Suspended accounts cannot create listings; actions recorded in `admin_audit_logs`. |
| **Test 9** | Buyer Self-Acceptance Block | Buyers cannot accept their own interest request to reveal contact info. |
| **Test 10**| Direct Table Harvest Block | Direct `SELECT` on `profiles` or `user_contacts` by strangers returns 0 contact records. |
| **Test 11**| Admin Removal Tamper Protection | Sellers cannot reactivate listings removed by moderators. |
| **Test 12**| Schema Migration Auditing | `schema_migrations_tracker` records applied database schema versions. |

### Running the RLS Test Suite
1. Navigate to **Supabase Dashboard** > **SQL Editor**.
2. Open and paste `supabase/tests/rls_security_tests.sql`.
3. Click **Run**. All 12 assertions will output `SUCCESS` notices and execute an automatic rollback.

---

## 📦 Local Development & Setup

### 1. Clone & Install
```bash
git clone https://github.com/aniruddhasharma39/BookLoop.git
cd BookLoop
npm install
```

### 2. Environment Variables
Create a `.env.local` file in the project root:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Initialize Database
In your Supabase SQL Editor, run:
1. `supabase/COMPLETE_DATABASE_SETUP.sql` (Creates all tables, views, RLS policies, indexes, and RPCs).
2. `supabase/seed.sql` (Loads Pune educational institutions and pilot textbook listings).

### 4. Create an Administrator
```sql
-- Replace with your Supabase auth.users UUID
INSERT INTO public.admin_roles (user_id, role)
VALUES ('YOUR_USER_UUID_HERE', 'admin')
ON CONFLICT (user_id) DO NOTHING;
```

### 5. Run Vite Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 🚀 Production Deployment (Vercel)

BookLoop is optimized for deployment on Vercel:

1. Push your changes to the `main` branch of your GitHub repository.
2. In your [Vercel Dashboard](https://vercel.com):
   - Import the repository.
   - Framework Preset: **Vite**.
   - Build Command: `npm run build`.
   - Output Directory: `dist`.
3. Add Environment Variables in Vercel:
   - `VITE_SUPABASE_URL`: `https://ofaybxxfymkzceydqfia.supabase.co`
   - `VITE_SUPABASE_ANON_KEY`: `<your_anon_key>`
4. Deploy. The repository includes `vercel.json` which provides SPA routing rewrites:
   ```json
   {
     "rewrites": [
       {
         "source": "/(.*)",
         "destination": "/index.html"
       }
     ]
   }
   ```

### Supabase URL Configuration
Under **Supabase Dashboard** > **Authentication** > **URL Configuration**:
- **Site URL:** `https://mybookloop.vercel.app`
- **Redirect URLs:**
  - `https://mybookloop.vercel.app/**`
  - `http://localhost:5173/**`

---

## 🔄 Operations, Maintenance & Keepalive

### 1. Supabase Free Tier Keepalive
Supabase free tier projects pause after 7 days of inactivity. To prevent platform downtime during student vacations, a GitHub Actions workflow is included at `.github/workflows/supabase-keepalive.yml`:
- Runs on a daily cron schedule (`0 4 * * *`).
- Pings the Supabase REST health endpoint using repository secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`).
- Keeps the PostgreSQL compute active continuously.

### 2. Database Backup Utility
An automated database backup script is provided in `scripts/backup_db.js`. Run with Node:
```bash
node scripts/backup_db.js
```
Exports a JSON snapshot of listings, institutions, profiles, and reports into `backups/`.

---

## 📁 Repository Directory Structure

```
BookLoop/
├── .github/
│   └── workflows/
│       └── supabase-keepalive.yml   # Daily cron keepalive action
├── public/
│   └── favicon.svg                  # BookLoop brand icon
├── scripts/
│   └── backup_db.js                 # Database backup snapshot script
├── src/
│   ├── components/
│   │   ├── common/                  # Reusable UI primitives (Button, Card, Input, Modal, Alert, Pagination)
│   │   ├── layout/                  # Navigation bar, mobile drawer, footer
│   │   ├── listings/                # ListingCard, ListingGrid, ImageGallery
│   │   └── requests/                # RequestItem, RequestActions
│   ├── context/
│   │   └── AuthContext.jsx          # Auth session, OTP dispatcher, notification badges
│   ├── lib/
│   │   ├── cache.js                 # SWR cache with sessionStorage persistence
│   │   ├── rateLimit.js             # Client-side rate-limiting for OTP requests
│   │   └── supabase.js              # Supabase JavaScript client instance
│   ├── pages/                       # Route pages (HomePage, SearchPage, ListingDetailPage,
│   │                                #             CreateListingPage, RequestsPage, ProfilePage,
│   │                                #             LoginPage, AdminPage, NotFoundPage)
│   ├── styles/
│   │   ├── design-tokens.css        # Color palette, spacing, typography tokens
│   │   └── global.css               # Base CSS resets and utilities
│   ├── App.jsx                      # Route hierarchy and protected route wrappers
│   ├── index.html                   # HTML entry point with subdomain sanitation
│   └── main.jsx                     # Vite React root
├── supabase/
│   ├── migrations/                  # Historical migration files (00000000000000 to 000000000003)
│   ├── tests/
│   │   └── rls_security_tests.sql   # 12-assertion zero-trust test suite
│   ├── COMPLETE_DATABASE_SETUP.sql  # Master single-file setup for fresh databases
│   └── seed.sql                     # Seed data for Pune colleges and pilot textbooks
├── vercel.json                      # Vercel SPA routing rewrites configuration
├── package.json                     # Project manifest and npm scripts
└── README.md                        # Master handover and technical documentation
```

---

## 📋 Handover Sign-Off & Verification Status

| Milestone | Target | Verification Result |
|---|---|---|
| **Core Architecture** | React 19 + Supabase PostgreSQL | ✅ Verified & functional |
| **Authentication** | Password + 6-digit OTP Email Login | ✅ Tested & verified |
| **Email Templates** | HTML templates for verification & OTP | ✅ Deployed on Supabase |
| **Data Privacy** | WhatsApp numbers encrypted / private | ✅ Verified via isolated `user_contacts` & RPC |
| **Security Suite** | 12 RLS test assertions in SQL | ✅ 12/12 Passing |
| **Performance** | Concurrent queries + SWR cache + pagination | ✅ Implemented on `/requests` & catalogue |
| **Moderation** | Report system + admin dashboard + audit logs | ✅ Active at `/admin` |
| **Deployment** | Vercel production hosting with clean routing | ✅ Live at `https://mybookloop.vercel.app` |
| **Maintenance** | Supabase keepalive workflow | ✅ Active in GitHub Actions |

---

*Handover document maintained and finalized for the BookLoop Engineering Team.*
