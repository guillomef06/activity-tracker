# Supabase Setup Instructions

## 1. Database Schema Setup

Execute the SQL schema in your Supabase project:

1. Go to Supabase Dashboard → SQL Editor
2. Copy and execute `schema.sql`
3. Verify tables are created in Table Editor

## 2. Activity Types

Activity types are defined directly in the `schema.sql` with default point values:

- **kvk prep**: 15 points
- **kvk cross border**: 10 points
- **legion**: 8 points
- **desolate desert**: 8 points
- **golden expedition**: 5 points

These default values are used by the `calculate_activity_points()` function when no custom point rules are configured for an alliance.

Admins can override these defaults by creating custom point rules via the `activity_point_rules` table (configurable per alliance and per position range).

## 3. Get Your Supabase Credentials

1. Go to Project Settings → API
2. Copy:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **anon/public key**

3. Add to your environment files:
   - `src/environments/environment.ts`
   - `src/environments/environment.production.ts`

## 4. Enable Authentication

1. Go to Authentication → Providers
2. Enable **Email** provider
3. Configure email templates (optional):
   - Confirm signup
   - Reset password
   - Invite user

## 5. Test RLS Policies

After creating your first user and alliance through the app:

1. Go to SQL Editor
2. Run test queries to verify RLS:

```sql
-- Should only return the current user's alliance
SELECT * FROM alliances;

-- Should only return users in the same alliance
SELECT * FROM user_profiles;

-- Should only return activities from the same alliance
SELECT * FROM activities;
```

## 6. Monitoring

- Dashboard → Database → Logs: View query logs
- Authentication → Users: Manage users
- Table Editor: View/edit data manually

## Notes

- **Row Level Security (RLS)** is enabled on all tables
- Users can only access data within their alliance
- Admins can create invitation tokens
- Tokens expire after 7 days (configurable in app)
