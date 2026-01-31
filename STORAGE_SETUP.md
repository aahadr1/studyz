# 🗄️ Storage Setup for Podcast Documents

## ⚠️ Important: Storage policies must be configured via Supabase Dashboard

The storage policies cannot be created via SQL migrations due to permissions.
Follow these steps in your Supabase Dashboard:

---

## 📝 Step-by-Step Setup

### 1. Go to Supabase Dashboard
- Navigate to: https://app.supabase.com
- Select your project
- Go to **Storage** in the left sidebar

### 2. Create Bucket
- Click **"New bucket"**
- **Name**: `podcast-documents`
- **Public**: ✅ Check this box (so files are publicly accessible)
- Click **"Create bucket"**

### 3. Add Storage Policies

Click on the `podcast-documents` bucket, then go to **"Policies"** tab.

#### Policy 1: Allow Upload
```
Policy name: Allow authenticated users to upload
Allowed operation: INSERT
Target roles: authenticated

Policy definition:
bucket_id = 'podcast-documents'
```

#### Policy 2: Allow Read
```
Policy name: Allow users to read files
Allowed operation: SELECT
Target roles: authenticated

Policy definition:
bucket_id = 'podcast-documents'
```

#### Policy 3: Allow Update
```
Policy name: Allow users to update files
Allowed operation: UPDATE
Target roles: authenticated

Policy definition:
bucket_id = 'podcast-documents'
```

#### Policy 4: Allow Delete
```
Policy name: Allow users to delete files
Allowed operation: DELETE
Target roles: authenticated

Policy definition:
bucket_id = 'podcast-documents'
```

---

## 🎯 Quick Setup (Alternative)

If you want to allow **public access** without authentication:

### Option 1: Public bucket with no policies
- Create bucket as **Public**
- No policies needed
- Anyone can read files via public URL
- Only authenticated users can upload (default)

### Option 2: Allow anonymous uploads (NOT RECOMMENDED for production)
Add this policy:
```
Policy name: Allow public uploads
Allowed operation: INSERT
Target roles: anon

Policy definition:
true
```

---

## ✅ Verify Setup

After creating the bucket and policies, test with:

1. Go to your app: `/intelligent-podcast/new`
2. Try uploading a PDF
3. You should see status change: pending → uploading → uploaded ✅

---

## 🔧 Alternative: Use existing 'documents' bucket

If you already have a `documents` bucket configured, update the frontend code:

In `app/intelligent-podcast/new/page.tsx`, line ~85:
```typescript
// Change from:
.from('documents')

// To use your existing bucket:
.from('your-existing-bucket-name')
```

---

## 📚 More Info

Supabase Storage Documentation:
https://supabase.com/docs/guides/storage

Storage Policies Guide:
https://supabase.com/docs/guides/storage/security/access-control
