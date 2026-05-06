# Studyz

A Next.js application with Supabase authentication.

## Tech Stack

- **Next.js 14** - React framework
- **TypeScript** - Type safety
- **TailwindCSS** - Styling
- **Supabase** - Authentication & Database

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Set up environment variables

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

See `ENV_SETUP.md` for detailed instructions.

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
studyz/
├── app/
│   ├── dashboard/    # Protected dashboard
│   ├── login/        # Login page
│   ├── register/     # Register page
│   └── page.tsx      # Landing page
├── lib/
│   ├── auth.ts       # Auth helpers
│   └── supabase.ts   # Supabase client
└── supabase/
    └── migrations/   # Database migrations
```

## Features

- ✅ User authentication (login/register)
- ✅ Protected dashboard
- ✅ Clean landing page
- ✅ Modern UI with TailwindCSS
