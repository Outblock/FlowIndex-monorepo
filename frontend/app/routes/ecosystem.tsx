import { createFileRoute } from '@tanstack/react-router'
import { motion, AnimatePresence, useMotionValue, useSpring } from 'framer-motion'
import { useState, useEffect } from 'react'
import { NanoBanana } from '../components/NanoBanana'
import MagicBento from '../components/MagicBento'
import { Terminal, Cpu, Zap, Brain, Wallet, Code, Bell, Database, Search } from 'lucide-react'

export const Route = createFileRoute('/ecosystem')({
  component: EcosystemPage,
})

const products = [
  { title: 'Simulator', description: 'Test your Cadence scripts and transactions in a local simulated environment before deploying to mainnet.', size: 'md:col-span-8', color: '#00ef8b', icon: Cpu, label: 'STABLE' },
  { title: 'Passkey', description: 'Next-gen auth for Flow. Secure, passwordless logins using WebAuthn.', size: 'md:col-span-4', color: '#3b82f6', icon: Zap, label: 'NEW' },
  { title: 'Runner', description: 'Reliable execution engine for long-running Cadence tasks.', size: 'md:col-span-4', color: '#8b5cf6', icon: Terminal, label: 'BETA' },
  { title: 'AI Assistant', description: 'Intelligent assistant to help you write, debug, and optimize Cadence code.', size: 'md:col-span-8', color: '#f59e0b', icon: Brain, label: 'AI' },
  { title: 'Agent Wallet', description: 'Fully programmable wallets designed for AI agents and automated interactions.', size: 'md:col-span-4', color: '#ef4444', icon: Wallet, label: 'BETA' },
  { title: 'Studio', description: 'A powerful, web-based IDE tailored for the Flow ecosystem.', size: 'md:col-span-4', color: '#ec4899', icon: Code, label: 'IDE' },
  { title: 'Webhook', description: 'Scalable event delivery system. Get notified instantly when on-chain events occur.', size: 'md:col-span-4', color: '#06b6d4', icon: Bell, label: 'CORE' },
  { title: 'Cadence MCP', description: 'Model Context Protocol for Cadence. Connect Flow development tools to LLMs seamlessly.', size: 'md:col-span-6', color: '#14b8a6', icon: Database, label: 'PROTOCOL' },
  { title: 'Cadence LSP', description: 'Language Server Protocol for Cadence. Professional IDE features.', size: 'md:col-span-6', color: '#a78bfa', icon: Search, label: 'TOOLING' },
]

function EcosystemPage() {
  const [isInside, setIsInside] = useState(false)
  
  // Custom Cursor Motion
  const mouseX = useMotionValue(-100)
  const mouseY = useMotionValue(-100)
  
  const ringX = useSpring(mouseX, { stiffness: 150, damping: 20 })
  const ringY = useSpring(mouseY, { stiffness: 150, damping: 20 })

  useEffect(() => {
    const handleGlobalMouse = (e: MouseEvent) => {
      mouseX.set(e.clientX)
      mouseY.set(e.clientY)
      // Automatically show cursor once it starts moving inside the window
      if (!isInside) setIsInside(true)
    }
    window.addEventListener('mousemove', handleGlobalMouse)
    return () => window.removeEventListener('mousemove', handleGlobalMouse)
  }, [isInside, mouseX, mouseY])

  return (
    <div 
      className="flex-1 overflow-y-auto p-4 md:p-8 max-w-7xl mx-auto w-full relative cursor-none"
      onMouseEnter={() => setIsInside(true)}
      onMouseLeave={() => setIsInside(false)}
    >
      {/* Custom Nothing Rectangular Cursor */}
      <AnimatePresence>
        {isInside && (
          <div className="fixed inset-0 pointer-events-none z-[10000] hidden md:block">
            {/* Outer Rectangle - Dynamic & Industrial */}
            <motion.div
              style={{ left: ringX, top: ringY, transform: 'translate(-50%, -50%)' }}
              className="absolute w-8 h-8 border border-white/40 rounded-none mix-blend-difference"
            />
            {/* Inner Square - Sharp core */}
            <motion.div
              style={{ left: mouseX, top: mouseY, transform: 'translate(-50%, -50%)' }}
              className="absolute w-1.5 h-1.5 bg-[#00ef8b] rounded-none mix-blend-normal shadow-[0_0_10px_rgba(0,239,139,0.8)]"
            />
          </div>
        )}
      </AnimatePresence>

      <header className="mb-12">
        <div className="flex items-center gap-4 mb-4">
          <div className="p-3 bg-neutral-900 border border-neutral-800">
            <NanoBanana size={32} className="text-[#00ef8b]" />
          </div>
          <h1 className="text-3xl font-black uppercase tracking-tighter italic text-white">
            FlowIndex <span className="text-[#00ef8b]">Ecosystem</span>
          </h1>
        </div>
        <p className="text-neutral-500 max-w-2xl font-mono text-sm leading-relaxed">
          A comprehensive suite of tools and services designed to supercharge your development 
          workflow on the Flow blockchain. From simulation to automation.
        </p>
      </header>

      <MagicBento 
        items={products}
        textAutoHide={true}
        enableStars={false}
        enableSpotlight={true}
        enableBorderGlow={true}
        enableTilt={true}
        enableMagnetism={true}
        clickEffect={true}
        spotlightRadius={400}
        glowColor="0, 239, 139"
        disableAnimations={false}
      />

      <footer className="mt-20 pt-8 border-t border-neutral-800 flex flex-col md:flex-row justify-between items-center gap-8 text-[10px] font-mono text-neutral-600 uppercase tracking-widest">
        <div className="flex items-center gap-4">
          <NanoBanana size={16} className="text-neutral-700" />
          <span>© 2026 FlowIndex Labs — Distributed Systems Group</span>
        </div>
        <div className="flex gap-8">
          <a href="#" className="hover:text-[#00ef8b] transition-colors">Documentation</a>
          <a href="#" className="hover:text-[#00ef8b] transition-colors">GitHub</a>
          <a href="#" className="hover:text-[#00ef8b] transition-colors">Discord</a>
        </div>
      </footer>
    </div>
  )
}
