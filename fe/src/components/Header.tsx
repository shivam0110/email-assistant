import { Link } from '@tanstack/react-router'

export default function Header() {
  return (
    <header className="p-4 flex gap-2 bg-primary text-white justify-between shadow-lg">
      <nav className="flex flex-row items-center">
        <div className="px-2 font-bold text-lg">
          <Link to="/" className="hover:text-primary-100 transition-colors">
            📧 Email Assistant
          </Link>
        </div>
      </nav>
      <div className="text-primary-100 text-sm self-center">
        AI-Powered Document Chat
      </div>
    </header>
  )
}
