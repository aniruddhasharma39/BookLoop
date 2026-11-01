# BookLoop Operational & Security Remediation Guide

This document details the resolution of the security, privacy, and operational findings discovered during codebase review, along with a complete verification guide using two live student accounts.

---

## 1. Summary of Issues & Remediations

| # | Issue Identified | Risk Level | Root Cause | Implemented Resolution |
|---|---|---|---|---|
| **1** | **Buyers able to accept their own request** | **High** | Initial migration included `"Participants can update request status"` with no column constraints, permitting direct PostgREST status updates. | Dropped policy, revoked direct `UPDATE` on `interest_requests` from `anon, authenticated`, added trigger guard, and enforced status transitions strictly via `SECURITY DEFINER` RPCs (`accept_interest_request`, `decline_interest_request`, etc.). |
| **2** | **WhatsApp number readable from profiles table** | **High** | RLS policy allowed buyers to read the seller's entire `profiles` row upon submitting a request, exposing `whatsapp_number` before acceptance. | Migrated contact info to private `public.user_contacts` with strict owner-only RLS (`auth.uid() = user_id`). Stripped phone from `profiles`. WhatsApp is accessible exclusively through `get_seller_contact(request_id)` when status is `accepted`. |
| **3** | **Supabase critical warning: `public_catalogue` is a "Security Definer View"** | **Medium** | Postgres 15+ views without `WITH (security_invoker = true)` default to security definer mode, bypassing table RLS. | Recreated `public_catalogue` `WITH (security_invoker = true)`. Since underlying tables (`listings`, `institutions`, `profiles`) now have safe public SELECT policies, the view respects RLS and satisfies Supabase linter. |
| **4** | **Sellers could reactivate admin-hidden listings** | **Medium** | `listings` UPDATE RLS permitted sellers to update any listing they owned regardless of current status. | Locked `listings` UPDATE RLS to `(seller_id = auth.uid() AND status <> 'removed')`. Added database trigger `trg_protect_listing_status` raising an exception if non-admins attempt to change status out of `'removed'`. |
| **5** | **Admin screen fallback skipped audit logging** | **Medium** | `AdminPage.jsx` had fallback `supabase.from(...).update(...)` calls if RPC failed, which bypassed the `admin_audit_logs` table. | Removed all fallback direct writes from `AdminPage.jsx`. All actions strictly require the audited RPCs (`admin_hide_listing`, `admin_suspend_user`, `admin_reactivate_user`, `admin_update_report_status`). |
| **6** | **Operational: Backups, migration tracking, free-plan pauses, test proof, secrets** | **Low-Med** | No migration tracking table, no backup scripts, unmitigated 7-day inactivity pause, no `.env.example`. | Added `public.schema_migrations_tracker`, wrote automated backup scripts (`scripts/backup-db.ps1`, `scripts/backup-db.sh`), added `.github/workflows/keepalive.yml` keepalive workflow, created `.env.example`, scanned all 15 Git commits for secrets (0 leaks), and expanded automated tests to 12 checks. |

---

## 2. Applying the Security Migration

Open your **Supabase Dashboard** -> **SQL Editor**, and run the contents of:
`supabase/migrations/20261030000003_security_remediation_and_hardening.sql`

This script is fully idempotent:
1. Creates `public.schema_migrations_tracker` and registers migrations.
2. Creates `public.user_contacts` and migrates any existing WhatsApp numbers.
3. Sets `whatsapp_number = NULL` on `public.profiles`.
4. Drops vulnerable RLS update policies and revokes direct `UPDATE` on `interest_requests`.
5. Rebuilds `public_catalogue` `WITH (security_invoker = true)`.
6. Enforces listing status lockdown triggers.
7. Reloads the PostgREST schema cache.

---

## 3. Two-Account Live Verification Walkthrough

To verify the protections against the live database, prepare two accounts:
- **Account A (Seller):** `seller.student@example.com`
- **Account B (Buyer):** `buyer.student@example.com`

### Test 1: Verify Buyer Cannot Accept Their Own Request
1. Log in as **Seller (A)**, publish a textbook listing (e.g., *Engineering Mathematics Vol 1*).
2. Log out and log in as **Buyer (B)**. Submit an interest request for that listing.
3. Open browser DevTools (`F12` -> Console) as **Buyer (B)** and attempt to bypass the backend:
   ```javascript
   const { data, error } = await supabase
     .from('interest_requests')
     .update({ status: 'accepted' })
     .eq('buyer_id', (await supabase.auth.getUser()).data.user.id);
   console.log('Update result:', { data, error });
   ```
4. **Expected Result:** The operation fails with `403 Permission Denied` (or 0 rows updated), and the request remains in `pending` status. Only Seller A can accept via `accept_interest_request`.

---

### Test 2: Verify WhatsApp Privacy (No Pre-Acceptance Leak)
1. With the request still in `pending` status, open browser DevTools as **Buyer (B)** and query Seller A's profile and contacts:
   ```javascript
   // Query 1: Profiles table
   const { data: prof } = await supabase
     .from('profiles')
     .select('whatsapp_number')
     .eq('id', '<SELLER_USER_ID>');
   console.log('Profile WhatsApp:', prof);

   // Query 2: Direct user_contacts table
   const { data: contacts } = await supabase
     .from('user_contacts')
     .select('whatsapp_number')
     .eq('user_id', '<SELLER_USER_ID>');
   console.log('Contacts WhatsApp:', contacts);

   // Query 3: Protected RPC
   const { data: rpcData, error: rpcError } = await supabase
     .rpc('get_seller_contact', { p_request_id: '<PENDING_REQUEST_ID>' });
   console.log('RPC result:', { rpcData, rpcError });
   ```
2. **Expected Result:**
   - Query 1: `prof[0].whatsapp_number` is `null` (data moved to private table).
   - Query 2: `contacts` returns `[]` (empty array due to owner-only RLS).
   - Query 3: Returns an error: `"Contact reveal unavailable: Request is not accepted"`.
3. Now log in as **Seller (A)** and click **Accept**.
4. Log back in as **Buyer (B)** and click **Reveal WhatsApp Number**:
   - The number unlocks and is presented cleanly.

---

### Test 3: Verify Seller Cannot Reactivate an Admin-Removed Listing
1. Log in as an **Admin** and navigate to `/admin`.
2. Find Seller A's listing and click **Hide Listing** (select reason: *Prohibited edition*).
3. Confirm the listing status is now `removed` and an audit log entry is created.
4. Log in as **Seller (A)**, open browser DevTools, and attempt to reactivate:
   ```javascript
   const { error } = await supabase
     .from('listings')
     .update({ status: 'active' })
     .eq('id', '<REMOVED_LISTING_ID>');
   console.log('Reactivate error:', error);
   ```
5. **Expected Result:** Update fails with error:
   `"Unauthorized: A removed listing cannot be reactivated by the seller"`.

---

### Test 4: Verify Admin Moderation Creates Audit Trail (No Silent Fallback)
1. From `/admin`, suspend a test user or hide a listing.
2. In Supabase SQL Editor, verify:
   ```sql
   SELECT * FROM public.admin_audit_logs ORDER BY created_at DESC LIMIT 5;
   ```
3. **Expected Result:** Every moderation action contains `admin_id`, `action`, `target_type`, `target_id`, and `reason`.

---

## 4. Operational Maintenance & Safeguards

### A. Database Backups
Automated scripts are available in `/scripts`:
- **PowerShell (Windows):**
  ```powershell
  $env:DATABASE_URL = "postgresql://postgres:[PASSWORD]@db.ofaybxxfymkzceydqfia.supabase.co:5432/postgres"
  .\scripts\backup-db.ps1
  ```
- **Bash (Linux / macOS):**
  ```bash
  export DATABASE_URL="postgresql://postgres:[PASSWORD]@db.ofaybxxfymkzceydqfia.supabase.co:5432/postgres"
  ./scripts/backup-db.sh
  ```

### B. Free-Plan Inactivity Protection
Supabase free tier pauses projects after 7 days of zero requests.
- Workflow: [`.github/workflows/keepalive.yml`](file:///c:/Users/PC/Desktop/Internship/BookLoop/.github/workflows/keepalive.yml)
- Automatically triggers twice weekly (Mondays & Thursdays at 06:00 UTC) to execute a lightweight health query and ensure the database stays active.

### C. Git Secret Scan Verification
A full audit of the Git log across all commits was conducted:
- Zero `.env` or `.env.local` files have ever been committed.
- No Supabase `service_role` keys or SMTP master keys exist in repository history.
- `.gitignore` strictly ignores `.env*`, `.local`, and `backups/`.
- Safe template provided in [`.env.example`](file:///c:/Users/PC/Desktop/Internship/BookLoop/.env.example).
