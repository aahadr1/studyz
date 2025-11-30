# Environment Variables Setup Guide

## Required Environment Variables

You need **3 environment variables** to run Studyz:

1. `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key
3. `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)

## Setup

### 1. Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Create a new project

### 2. Get Your Credentials

In Supabase dashboard → Settings → API:
- Copy the Project URL
- Copy the anon/public key
- Copy the service_role key (click "Reveal")

### 3. Create .env.local

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 4. Run the app

```bash
npm run dev
```

## Security

- Never commit `.env.local` to git
- Never expose the service_role key in client code
