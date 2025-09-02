# Email Assistant

An AI-powered email assistant application that lets you upload documents, chat with AI about their content, and draft professional emails using context from your documents.

## What This Project Does

**Email Assistant** is a full-stack application that combines document processing, AI chat, and email drafting capabilities:

- **📄 Document Upload & Processing**: Upload PDFs and text files that get automatically chunked and embedded for semantic search
- **🤖 AI Chat Interface**: Chat with GPT about your documents with intelligent context retrieval 
- **✉️ Smart Email Drafting**: Generate professional email drafts based on your conversation context and document content
- **📧 Email Integration**: Send emails directly through Nylas email service integration
- **🔒 Secure Authentication**: User authentication and session management via Clerk
- **💾 Vector Memory**: Persistent document embeddings stored in memory with HNSW vector search

## How It Works

### Architecture Overview

The application uses a modern microservices architecture:

**Frontend (React + Vite)**
- Authentication via Clerk
- Real-time chat interface with streaming responses
- Document upload with drag-and-drop
- Email drafting modal with customizable templates
- Responsive design with Tailwind CSS

**Backend (Node.js + Express)**
- JWT-based authentication middleware
- Document processing pipeline (PDF parsing, text chunking, embedding generation)
- Vector storage using HNSW (Hierarchical Navigable Small World) for fast similarity search
- LangChain integration for LLM orchestration
- Nylas API for email sending

### AI & Document Processing Flow

1. **Document Upload**: Files are uploaded and processed through a multi-stage pipeline
2. **Text Extraction**: PDF content is extracted using `pdf-parse`
3. **Chunking**: Documents are split into semantically meaningful chunks
4. **Embedding**: Text chunks are converted to vector embeddings using OpenAI's embedding model
5. **Storage**: Vectors are stored in memory with HNSW indexing for fast retrieval
6. **Chat Query**: User messages trigger semantic search across document vectors
7. **Context Retrieval**: Most relevant document chunks are retrieved based on similarity
8. **AI Response**: GPT-3.5-turbo generates responses using retrieved context
9. **Email Drafting**: AI creates structured email drafts based on conversation context

## Setup Instructions

### Prerequisites

- **Docker & Docker Compose** (recommended for quick setup)
- **Node.js 18+** (for local development)
- **pnpm** (package manager)

### Required API Keys

You'll need accounts and API keys for:
- **Clerk** (authentication) - Free tier available
- **OpenAI** (AI models) - API key required  
- **Nylas** (email sending) - Free tier available

### Quick Start with Docker

1. **Clone and navigate to project**
   ```bash
   git clone <repository-url>
   cd email-assistant
   ```

2. **Configure environment variables**
   ```bash
   cp be/env.example be/.env
   ```
   
   Edit `be/.env` with your API keys:
   ```env
   NODE_ENV=development
   PORT=8000
   CLIENT_ORIGIN=http://localhost:3000
   
   # Clerk Authentication
   CLERK_PUBLISHABLE_KEY=pk_test_your_key_here
   CLERK_SECRET_KEY=sk_test_your_key_here
   
   # OpenAI API
   OPENAI_API_KEY=sk-your_openai_key_here
   
   # Nylas Email Service
   NYLAS_CLIENT_ID=your_client_id
   NYLAS_CLIENT_SECRET=your_client_secret
   NYLAS_GRANT_ID=your_grant_id
   ```

3. **Start the application**
   ```bash
   docker-compose up --build
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Documentation: http://localhost:8000/api

### Local Development Setup

**Backend Development**
```bash
cd be
pnpm install
pnpm dev
```

**Frontend Development**
```bash
cd fe
pnpm install
pnpm dev
```

### API Key Configuration

The application supports flexible API key configuration:

1. **System-wide keys**: Set in `.env` file (recommended for development)
2. **User-provided keys**: Users can provide their own OpenAI API keys via the settings modal
3. **Hybrid approach**: System provides default keys, users can override with their own

### Getting API Keys

**Clerk (Authentication)**
1. Sign up at [clerk.com](https://clerk.com)
2. Create a new application
3. Copy the publishable and secret keys
4. Add `http://localhost:3000` to allowed origins

**OpenAI (AI Models)**
1. Sign up at [platform.openai.com](https://platform.openai.com)
2. Navigate to API keys section
3. Create a new API key
4. Add billing information (required for API access)

**Nylas (Email Service)**
1. Sign up at [nylas.com](https://nylas.com)
2. Create a new application
3. Set up email provider integration (Gmail, Outlook, etc.)
4. Copy client credentials and grant ID

## Available Docker Commands

```bash
# Start services in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild and restart
docker-compose up --build

# Remove all data (caution!)
docker-compose down -v
```

## API Endpoints

- `GET /health` - Health check
- `GET /api` - API information and endpoint list
- `POST /api/chat` - Send chat message
- `GET /api/chat/history` - Get chat history
- `POST /api/documents/upload` - Upload documents
- `GET /api/documents/list` - List uploaded documents
- `POST /api/documents/search` - Search document content
- `POST /api/email/draft` - Generate email draft
- `POST /api/email/send` - Send email
- `POST /api/email/from-chat` - Generate email from chat context

## Features

### Document Processing
- Support for PDF and text files
- Automatic text extraction and chunking
- Vector embedding generation
- Semantic search capabilities

### AI Chat
- Context-aware responses using document content
- Streaming responses for real-time interaction
- Chat history persistence
- Flexible AI model configuration

### Email Features
- Professional email draft generation
- Customizable tone and style
- Direct email sending via Nylas
- Template-based composition

### Security & Authentication
- JWT-based authentication via Clerk
- Secure file upload handling
- API key encryption and storage
- CORS and security headers

## Troubleshooting

### Common Issues

**Port conflicts**
- Ensure ports 3000 and 8000 are available
- Check with: `lsof -i :3000` and `lsof -i :8000`

**API key errors**
- Verify all required API keys are set in `.env`
- Check API key permissions and billing status
- Ensure Clerk domain settings include your development URL

**Docker issues**
```bash
# Check container status
docker-compose ps

# View specific service logs
docker-compose logs backend
docker-compose logs frontend

# Restart specific service
docker-compose restart backend

# Clean rebuild
docker-compose down
docker system prune -a
docker-compose up --build
```

**File upload issues**
- Check file size limits (default: 10MB)
- Verify supported file types (PDF, TXT)
- Ensure proper MIME type detection

## Development

### Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Clerk React
- **Backend**: Node.js, Express, TypeScript, LangChain, OpenAI
- **Database**: In-memory vector storage with HNSW indexing
- **Authentication**: Clerk
- **Email**: Nylas API
- **AI**: OpenAI GPT-3.5-turbo and text-embedding-3-small

### Project Structure
```
email-assistant/
├── fe/                    # Frontend React application
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── App.tsx       # Main application component
│   │   └── main.tsx      # Application entry point
│   └── Dockerfile        # Frontend container
├── be/                    # Backend Node.js API
│   ├── src/
│   │   ├── config/       # Environment configuration
│   │   ├── routes/       # API route handlers
│   │   ├── services/     # Business logic services
│   │   ├── middleware/   # Express middleware
│   │   └── index.ts      # Server entry point
│   └── Dockerfile        # Backend container
└── docker-compose.yml    # Multi-service orchestration
```

This application demonstrates modern full-stack development practices with AI integration, providing a solid foundation for document-based AI assistants and email automation workflows. 