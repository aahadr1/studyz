# Déploiement sur Vercel

## ⚠️ Limitation Importante: Traitement PDF

Le traitement PDF (conversion pages → images) nécessite la bibliothèque `canvas` qui requiert des dépendances natives (Cairo, Pango, etc.) **non disponibles sur Vercel**.

### État Actuel

✅ **Ce qui fonctionne sur Vercel:**
- Authentification
- Dashboard
- Gestion des lessons
- Upload de documents
- Interface utilisateur complète
- Chat AI (quand les images sont disponibles)

❌ **Ce qui ne fonctionne PAS sur Vercel:**
- Conversion automatique PDF → images
- Les documents uploadés ne seront pas convertis en images

### Solutions pour le Traitement PDF

#### Option 1: Service Externe (Recommandé)

Utilise un service cloud pour convertir les PDF:

**Cloudinary** (Gratuit jusqu'à 25 crédits/mois)
```typescript
// Exemple avec Cloudinary
const cloudinary = require('cloudinary').v2

cloudinary.uploader.upload(pdfPath, {
  resource_type: 'image',
  format: 'png',
  pages: true
})
```

**PDF.co** ou **ConvertAPI**
- Services spécialisés dans la conversion PDF
- API simple à intégrer

#### Option 2: Serverless Function Séparée

Déploie la fonction de traitement sur:
- **AWS Lambda** avec layer Cairo
- **Railway** (supporte canvas)
- **DigitalOcean Functions**
- **Google Cloud Functions**

#### Option 3: Traitement Côté Client

Utilise `pdfjs-dist` dans le navigateur:
```typescript
// Dans le navigateur
import * as pdfjsLib from 'pdfjs-dist'

// Convertir PDF en images côté client
const pdf = await pdfjsLib.getDocument(pdfUrl).promise
// Puis upload les images vers Supabase
```

### Déploiement Actuel

L'application se déploiera avec succès sur Vercel **sans** la fonctionnalité de conversion PDF.

### Configuration Vercel

1. **Variables d'environnement:**
```
NEXT_PUBLIC_SUPABASE_URL=votre_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=votre_cle
SUPABASE_SERVICE_ROLE_KEY=votre_service_role_key
OPENAI_API_KEY=votre_openai_key
```

2. **Build Settings:**
- Framework: Next.js
- Build Command: `npm run build`
- Output Directory: `.next`
- Node Version: 18.x

### Alternative: Railway (Supporte Canvas)

Railway supporte les dépendances natives. Pour déployer sur Railway:

1. Va sur [railway.app](https://railway.app)
2. Connecte ton repo GitHub
3. Configure les variables d'environnement
4. Railway installera canvas automatiquement!

### Pour le Développement Local

Le traitement PDF fonctionne en local si vous installez:

**Mac:**
```bash
brew install pkg-config cairo pango libpng jpeg giflib librsvg pixman
npm install
```

**Linux:**
```bash
sudo apt-get install build-essential libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev
npm install
```

### Recommandation

Pour une solution rapide et fonctionnelle:
1. **Déploie sur Vercel** (pour tout sauf le traitement PDF)
2. **Ajoute Cloudinary** ou **PDF.co** pour la conversion PDF
3. Ou **utilise Railway** à la place de Vercel (supporte canvas nativement)

---

**L'application fonctionne parfaitement, seule la conversion PDF automatique nécessite une solution externe pour la production!**

