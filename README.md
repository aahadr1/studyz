# 🎓 Studyz - AI-Powered Study Assistant

Transform your study experience with an AI that can **see** and understand your documents.

![Next.js](https://img.shields.io/badge/Next.js-14-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)
![Supabase](https://img.shields.io/badge/Supabase-Backend-green)
![OpenAI](https://img.shields.io/badge/OpenAI-GPT--4%20Vision-purple)

## 🚀 What is Studyz?

Studyz is a complete web application that revolutionizes how you study. Upload your PDFs, presentations, or documents, and chat with an AI assistant that can literally **see the pages** you're viewing. Ask questions, get explanations, and understand your materials better.

### ✨ Key Highlights

- 📚 **Upload & Organize** - Create lessons and upload multiple documents
- 🖼️ **Smart Processing** - Automatic conversion of document pages to images
- 🤖 **AI Vision** - GPT-4 powered assistant that sees what you see
- 💬 **Contextual Chat** - Ask questions about the current page
- 🎙️ **Voice Mode** - UI ready for conversational AI (backend setup required)
- 🔒 **Secure & Private** - Your data is protected with enterprise-grade security

## 📸 Screenshots

### Dashboard
View your study statistics and quick actions at a glance.

### Lessons Management
Organize documents into themed lessons.

### Study Session
Split-screen interface: Document viewer + AI assistant.

### AI Chat
Ask questions about the current page and get intelligent answers.

## 🎯 Perfect For

- 📖 **Students** studying from textbooks and lecture slides
- 👨‍🏫 **Teachers** preparing materials and explanations
- 📊 **Professionals** learning from technical documents
- 🔬 **Researchers** analyzing papers and reports
- 💼 **Anyone** who learns from documents

## 🏃 Quick Start

Get up and running in 5 minutes! See **[QUICK_START.md](QUICK_START.md)**

```bash
# 1. Clone and install
git clone <repository>
cd studyz
npm install

# 2. Set up Supabase (see QUICK_START.md)

# 3. Configure environment
cp .env.local.example .env.local
# Edit .env.local with your keys

# 4. Run!
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and start studying!

## 📚 Documentation

- **[QUICK_START.md](QUICK_START.md)** - Get running in 5 minutes
- **[SETUP.md](SETUP.md)** - Detailed setup and configuration
- **[FEATURES.md](FEATURES.md)** - Complete features documentation
- **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - Technical overview

## 🎨 Features

### ✅ Fully Implemented

| Feature | Description |
|---------|-------------|
| 🔐 **Authentication** | Secure login/register with Supabase |
| 📊 **Dashboard** | Overview of lessons and documents |
| 📚 **Lessons** | Create and organize study lessons |
| 📄 **PDF Upload** | Upload and process PDF documents |
| 🖼️ **Page Images** | Automatic page-to-image conversion |
| 👁️ **Document Viewer** | Beautiful page-by-page viewer |
| 🤖 **AI Chat** | GPT-4 Vision powered assistance |
| 💬 **Smart Responses** | Context-aware answers |
| 🎯 **Page Navigation** | Easy page and document navigation |
| 🔒 **Security** | RLS policies and secure storage |

### 🚧 Additional Setup Required

| Feature | Status |
|---------|--------|
| 🎙️ **Voice Assistant** | UI ready, needs WebSocket backend |
| 📊 **PPTX Processing** | Placeholder, needs LibreOffice/service |
| 📝 **DOCX Processing** | Placeholder, needs LibreOffice/service |

## 🛠️ Tech Stack

### Frontend
- **Next.js 14** - React framework with App Router
- **TypeScript** - Type safety and better DX
- **TailwindCSS** - Beautiful, responsive styling
- **React Icons** - Comprehensive icon library

### Backend
- **Supabase** - Backend as a Service
  - PostgreSQL database
  - Authentication & user management
  - File storage
  - Row Level Security (RLS)

### AI & Processing
- **OpenAI GPT-4 Vision** - AI that can see images
- **PDF.js** - PDF parsing and rendering
- **node-canvas** - Server-side image generation

## 🎬 How It Works

### The Magic Behind the Scenes

1. **Upload a Document** 📤
   - You upload a PDF to your lesson
   - File is securely stored in Supabase Storage

2. **Automatic Processing** ⚙️
   - Backend extracts each page of the PDF
   - Each page is rendered to a high-quality PNG image
   - Images are stored in a separate bucket
   - Database links each page to its image

3. **Study with AI** 🧠
   - You view pages in the document viewer
   - You ask questions in the chat
   - Your question + current page image → sent to GPT-4 Vision
   - AI analyzes the image and understands the content
   - Returns intelligent, contextual answer

4. **Context-Aware Learning** 💡
   - AI remembers conversation history
   - Knows what page you're viewing
   - Can explain diagrams, formulas, charts
   - Provides examples and clarifications

## 🚀 Deployment

### Deploy to Vercel (Recommended)

1. Push code to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy!

Your Supabase database and storage are already in the cloud. You just need to deploy the Next.js frontend.

### Environment Variables

Required for production:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_key
```

## 💰 Costs

### Hobby/Student Use (Free/Low Cost)
- **Supabase:** Free tier (500 MB storage)
- **Vercel:** Free tier
- **OpenAI:** ~$10-30/month (pay per use)

### Total: ~$10-30/month for active use

All platforms have generous free tiers. You mainly pay for OpenAI API usage.

## 📖 Usage Examples

### Example Study Session

```
You: "What is this diagram showing?"
AI: "This diagram illustrates the Krebs cycle, also known as 
     the citric acid cycle. It shows how acetyl-CoA enters 
     the cycle and goes through 8 main steps..."

You: "Can you explain step 3 in more detail?"
AI: "In step 3, isocitrate is oxidized to α-ketoglutarate. 
     This step produces NADH and releases CO2..."

You: "What's the significance of NADH here?"
AI: "NADH is crucial because it carries high-energy electrons 
     to the electron transport chain..."
```

The AI can see the actual diagram and explain it based on what's visible!

## 🔒 Security & Privacy

- ✅ **Authentication** - Secure JWT-based sessions
- ✅ **Row Level Security** - Database-level access control
- ✅ **Private Storage** - Your files are not publicly accessible
- ✅ **Environment Secrets** - API keys never exposed to client
- ✅ **Data Isolation** - Users can only access their own data

## 🤝 Contributing

This is an educational project. Feel free to:
- Fork and experiment
- Add new features
- Improve existing functionality
- Share your modifications

## 📝 License

This project is for educational purposes.

## 🙏 Acknowledgments

- **OpenAI** - For GPT-4 Vision API
- **Supabase** - For amazing backend infrastructure
- **Vercel** - For Next.js and hosting
- **The open source community** - For incredible tools

## 📞 Support

### Need Help?

1. **Quick Start Issues** → See [QUICK_START.md](QUICK_START.md)
2. **Setup Questions** → See [SETUP.md](SETUP.md)
3. **Feature Documentation** → See [FEATURES.md](FEATURES.md)
4. **Technical Details** → See [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)

### Common Issues

**"Page not found"** → Document is still processing, wait a few seconds

**"Authentication error"** → Check your Supabase keys in `.env.local`

**"Upload failed"** → Check file size and Supabase storage quota

## 🎯 Roadmap

### ✅ Phase 1 (Complete)
- Core functionality
- PDF support
- AI chat with vision
- Authentication
- Document management

### 🚧 Phase 2 (Planned)
- Voice assistant backend
- PPTX/DOCX processing
- Document annotations
- Progress tracking

### 💡 Phase 3 (Future)
- Flashcard generation
- Quiz creation
- Collaborative study
- Mobile apps

## 🌟 Why Studyz?

Traditional study tools just store documents. **Studyz understands them.**

- ❌ **Regular PDF readers**: Can't answer questions
- ❌ **Text-based AI**: Misses visual information
- ✅ **Studyz**: AI that sees AND understands your documents

## 📊 Statistics

- **Lines of Code**: ~3,000+
- **Components**: 10+
- **API Routes**: 2
- **Database Tables**: 3
- **Setup Time**: 5-10 minutes
- **Time to First Study Session**: < 1 minute

## 🎓 Perfect Use Cases

1. **Medical Students** - Study anatomy diagrams with AI explanations
2. **Engineering Students** - Understand complex formulas and circuits
3. **History Students** - Analyze documents and timelines
4. **Language Learners** - Get help with written materials
5. **Professional Development** - Learn from technical documentation

## 💻 Development

### Prerequisites
- Node.js 18+
- npm or yarn
- Supabase account
- OpenAI API key

### Development Commands

```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run start    # Start production server
npm run lint     # Run linter
```

### Code Structure

```
studyz/
├── app/              # Next.js pages and API routes
├── components/       # React components
├── lib/             # Utilities and helpers
├── supabase/        # Database migrations
└── public/          # Static assets
```

## 🏆 What Makes This Special

1. **Actually Works** - Not a demo, real functionality
2. **Production Ready** - Proper error handling, security
3. **Modern Stack** - Latest technologies and best practices
4. **Well Documented** - Clear docs and code comments
5. **Beautiful UI** - Professional, polished interface
6. **Smart AI** - Vision-enabled understanding

## 📈 Performance

- **Fast Page Loads** - Next.js optimization
- **Efficient Processing** - Async document conversion
- **Smart Caching** - Optimized image delivery
- **Responsive Design** - Works on all screen sizes

## 🎉 Get Started Now!

```bash
# One command to get started
git clone <repo> && cd studyz && npm install && npm run dev
```

Then follow the setup in [QUICK_START.md](QUICK_START.md)!

---

**Made with ❤️ for better learning through AI**

**Start studying smarter today! 🚀**
# studyz
