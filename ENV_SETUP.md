# Environment Variables Setup Guide

This guide will help you configure all necessary environment variables for Studyz.

## Required Environment Variables

You need **4 environment variables** to run Studyz:

1. `NEXT_PUBLIC_SUPABASE_URL` - Your Supabase project URL
2. `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous/public key
3. `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (server-side only)
4. `OPENAI_API_KEY` - OpenAI API key

## Step-by-Step Setup

### 1. Get Supabase Credentials

#### a) Create Supabase Project

1. Go to [https://supabase.com](https://supabase.com)
2. Sign up or log in
3. Click "New Project"
4. Fill in:
   - **Name**: studyz (or any name)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to you
5. Click "Create new project"
6. Wait 1-2 minutes for provisioning

#### b) Find Your Credentials

1. In your Supabase dashboard, click **Settings** (gear icon)
2. Click **API** in the sidebar
3. You'll see:

**Project URL:**
```
https://xxxxxxxxxxxxx.supabase.co
```
Copy this → This is your `NEXT_PUBLIC_SUPABASE_URL`

**API Keys section:**

**anon/public key:**
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
Copy this → This is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**service_role key:** (click "Reveal" to see it)
```
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
Copy this → This is your `SUPABASE_SERVICE_ROLE_KEY`

⚠️ **IMPORTANT**: Never expose the service_role key in your frontend code or commit it to git!

### 2. Get OpenAI API Key

#### a) Create OpenAI Account

1. Go to [https://platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. You may need to add payment information

#### b) Create API Key

1. Click your profile icon (top right)
2. Select **API keys** or go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. Click **+ Create new secret key**
4. Give it a name (e.g., "Studyz App")
5. Click **Create secret key**
6. Copy the key immediately (you won't see it again!)
```
sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```
This is your `OPENAI_API_KEY`

⚠️ **IMPORTANT**: Save this key! You can't view it again after creation.

### 3. Create .env.local File

In the root of your project (same folder as package.json):

#### On Mac/Linux:
```bash
touch .env.local
```

#### On Windows:
Create a new file called `.env.local`

### 4. Fill in Environment Variables

Open `.env.local` in your text editor and paste:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# OpenAI Configuration
OPENAI_API_KEY=sk-your-openai-api-key-here
```

**Replace the placeholder values** with your actual keys!

### 5. Example .env.local

Here's what it should look like (with fake keys):

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTYzNjYwMDAwMCwiZXhwIjoxOTUyMTc2MDAwfQ.abc123def456ghi789jkl012mno345pqr678stu901vwx234yz
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjM2NjAwMDAwLCJleHAiOjE5NTIxNzYwMDB9.xyz789abc123def456ghi789jkl012mno345pqr678stu901

# OpenAI Configuration
OPENAI_API_KEY=sk-proj-abc123def456ghi789jkl012mno345pqr678stu901vwx234yz567
```

## Verification Checklist

✅ **File Location**: `.env.local` is in the project root (same folder as `package.json`)

✅ **File Name**: Exactly `.env.local` (note the dot at the start)

✅ **No Quotes**: Don't put quotes around the values

✅ **No Spaces**: No spaces around the `=` sign

✅ **All 4 Variables**: All four variables are set

✅ **Correct Values**: 
- Supabase URL starts with `https://`
- Keys are long strings (100+ characters)
- OpenAI key starts with `sk-`

## Common Issues

### Issue: "Missing environment variables"

**Solution**: 
- Check file is named exactly `.env.local`
- Check file is in project root
- Restart your dev server: `npm run dev`

### Issue: "Authentication failed"

**Solution**:
- Verify your Supabase URL is correct
- Check anon key is copied completely
- Make sure you ran the SQL migration

### Issue: "OpenAI API error"

**Solution**:
- Verify API key is correct
- Check you have credits in OpenAI account
- Make sure key starts with `sk-`

### Issue: "Cannot read environment variables"

**Solution**:
- Restart your Next.js dev server
- `NEXT_PUBLIC_` variables are for client-side
- Variables without prefix are server-side only

## Security Best Practices

### ✅ DO:
- Keep `.env.local` file secret
- Add `.env.local` to `.gitignore` (already done)
- Use different keys for development and production
- Rotate keys periodically
- Only share keys through secure channels

### ❌ DON'T:
- Commit `.env.local` to git
- Share your service role key publicly
- Use production keys in development
- Hardcode keys in your code
- Share keys in screenshots or videos

## For Production Deployment

### Vercel

1. Go to your project settings
2. Navigate to **Environment Variables**
3. Add each variable:
   - Key: `NEXT_PUBLIC_SUPABASE_URL`
   - Value: your URL
4. Repeat for all 4 variables
5. Redeploy

### Other Platforms

Most platforms have similar environment variable settings:
- Netlify: Site settings → Environment variables
- Railway: Project → Variables
- DigitalOcean: App settings → Environment

## Testing Your Setup

### 1. Start the dev server:
```bash
npm run dev
```

### 2. No errors? ✅ Environment is configured!

### 3. See errors? Check:
- Variable names are spelled correctly
- No extra spaces
- All 4 variables are set
- File is named `.env.local`

## Quick Copy Template

Create `.env.local` and paste this template:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# OpenAI Configuration
OPENAI_API_KEY=
```

Then fill in your values after the `=` signs!

## What Each Variable Does

### `NEXT_PUBLIC_SUPABASE_URL`
- Where your Supabase database is hosted
- Used by client and server
- Safe to expose (public)

### `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Allows read access to your database
- Protected by Row Level Security
- Safe to expose (public)

### `SUPABASE_SERVICE_ROLE_KEY`
- Full database access
- Used for admin operations
- **Never expose in client code**
- Only used in API routes

### `OPENAI_API_KEY`
- Access to OpenAI's APIs
- Used for chat completions
- **Never expose in client code**
- Only used in API routes

## Need Help?

### Still having issues?

1. Check file location: `ls -la .env.local` (Mac/Linux) or `dir .env.local` (Windows)
2. Check file contents: `cat .env.local` (Mac/Linux) or `type .env.local` (Windows)
3. Verify no trailing spaces or hidden characters
4. Try creating a new `.env.local` from scratch
5. Restart your terminal and dev server

### Getting Keys Again

**Supabase Keys:**
- Go to Project Settings → API
- Keys are always visible there

**OpenAI Key:**
- If lost, create a new one
- Old keys can be revoked

## Example Setup Flow

```bash
# 1. Create the file
touch .env.local

# 2. Open in your editor
code .env.local  # VS Code
# or
nano .env.local  # Terminal editor

# 3. Paste template and fill values

# 4. Save and close

# 5. Verify it exists
ls -la .env.local

# 6. Start the app
npm run dev

# 7. Check for errors in terminal
```

## Success! ✅

When everything is configured correctly, you'll see:
```
✓ Ready in XXXms
○ Compiling / ...
✓ Compiled / in XXXms
```

No environment variable errors = Success! 🎉

Now you can use the app!

---

**Remember**: Never commit `.env.local` to git. It's already in `.gitignore`!

