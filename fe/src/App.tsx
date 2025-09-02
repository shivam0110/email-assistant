import { SignedIn, SignedOut, SignInButton, UserButton } from '@clerk/clerk-react';
import Chat from './components/Chat';

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-secondary-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary to-primary-700 shadow-xl border-b border-primary-600">
        <div className="max-w-6xl mx-auto px-4 py-1.5 flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center space-x-1">
              <span>📧</span>
              <span>SmartMail Chat</span>
            </h1>
          </div>
          <div>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="bg-gradient-to-r from-accent to-accent-600 text-white px-4 py-2 rounded-lg hover:from-accent-600 hover:to-accent-700 transition-all duration-200 font-semibold shadow-md">
                  Sign In
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton 
                appearance={{
                  elements: {
                    avatarBox: "w-8 h-8 border-2 border-white/20"
                  }
                }}
              />
            </SignedIn>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-3 py-3">
        <SignedOut>
          <div className="text-center py-16">
            <div className="text-8xl mb-8">🤖📄</div>
            <h2 className="text-4xl font-bold text-primary mb-6">
              Welcome to AI Document Assistant
            </h2>
            <p className="text-xl text-secondary-600 mb-8 max-w-3xl mx-auto leading-relaxed">
              Upload your documents (PDF, TXT) and chat with an AI that remembers everything! 
              Get instant answers from your files using advanced RAG technology and vector memory.
            </p>
            
            <div className="mb-12">
              <div className="flex justify-center space-x-8 text-base">
                <div className="flex items-center space-x-3 bg-white shadow-lg px-6 py-4 rounded-xl border border-accent-100">
                  <div className="w-4 h-4 bg-accent rounded-full"></div>
                  <span className="font-medium text-gray-700">PDF & Text Support</span>
                </div>
                <div className="flex items-center space-x-3 bg-white shadow-lg px-6 py-4 rounded-xl border border-secondary-100">
                  <div className="w-4 h-4 bg-secondary rounded-full"></div>
                  <span className="font-medium text-gray-700">Vector Memory</span>
                </div>
                <div className="flex items-center space-x-3 bg-white shadow-lg px-6 py-4 rounded-xl border border-warning-100">
                  <div className="w-4 h-4 bg-warning rounded-full"></div>
                  <span className="font-medium text-gray-700">Contextual Answers</span>
                </div>
              </div>
            </div>
            
            <SignInButton mode="modal">
              <button className="bg-gradient-to-r from-accent to-accent-600 text-white px-12 py-4 rounded-2xl text-xl hover:from-accent-600 hover:to-accent-700 transition-all duration-200 font-bold shadow-2xl transform hover:scale-105">
                Get Started →
              </button>
            </SignInButton>
            
            <div className="mt-12 text-sm text-gray-500">
              <p>✨ No setup required • 🔒 Secure & Private • ⚡ Instant results</p>
            </div>
          </div>
        </SignedOut>
        
        <SignedIn>
          <div className="h-[calc(100vh-8vh)]">
            <Chat />
          </div>
        </SignedIn>
      </main>
    </div>
  )
}

export default App
