import React from 'react'
import { Routes, Route, Link, Navigate, BrowserRouter as Router } from 'react-router-dom'
import VerificationPortal from './pages/VerificationPortal.jsx'
import AdminProtected from './pages/AdminProtected.jsx'

export default function App() {
  return (
    <Router>
      <div className="min-h-screen flex flex-col font-sans bg-gradient-to-b from-[#f7f8fa] to-[#e9ecf2]">
        {/* Header Navigation */}
        <header className="w-full bg-white shadow-md flex items-center justify-between px-8 py-4">
          <div className="flex items-center space-x-3">
            <img src="/NovaPrincipalV2.png" alt="NOVA SBE Logo" className="h-8" />
            <h1 className="text-xl font-semibold text-black">NOVA SBE Diploma Platform</h1>
          </div>

          <nav className="flex space-x-6 text-black font-medium">
            <Link to="/" className="hover:text-[#004b87] transition">
              Verify Diploma
            </Link>
            <Link to="/admin" className="hover:text-[#004b87] transition">
              Admin Portal
            </Link>
          </nav>
        </header>

        {/* Routes */}
        <main className="flex-grow">
          <Routes>
            <Route path="/" element={<VerificationPortal />} />
            <Route path="/admin" element={<AdminProtected />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="text-center text-sm text-black py-6 border-t bg-white">
          © 2025 NOVA School of Business and Economics — Blockchain Diploma Platform
        </footer>
      </div>
    </Router>
  )
}
