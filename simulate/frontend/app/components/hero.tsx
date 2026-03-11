import { useEffect, useRef, useState } from 'react'

/* ── Typewriter tagline ── */
const TAGLINE_1 = 'See what happens. '
const TAGLINE_2 = 'Before it happens.'
const SUBTITLE = 'Real mainnet state. Simulated execution. Full visibility.'

function Typewriter({ phase, onClickPlayground }: { phase: Phase; onClickPlayground: () => void }) {
  const [charIdx, setCharIdx] = useState(0)
  const [subtitleIdx, setSubtitleIdx] = useState(0)
  const [showButton, setShowButton] = useState(false)
  const started = useRef(false)

  const fullTagline = TAGLINE_1 + TAGLINE_2
  const totalChars = fullTagline.length

  useEffect(() => {
    if (phase !== 'done' || started.current) return
    started.current = true
    setCharIdx(0)
    setSubtitleIdx(0)
    setShowButton(false)

    let i = 0
    const taglineTimer = setInterval(() => {
      i++
      setCharIdx(i)
      if (i >= totalChars) {
        clearInterval(taglineTimer)
        setTimeout(() => {
          let j = 0
          const subTimer = setInterval(() => {
            j++
            setSubtitleIdx(j)
            if (j >= SUBTITLE.length) {
              clearInterval(subTimer)
              setTimeout(() => setShowButton(true), 300)
            }
          }, 20)
        }, 400)
      }
    }, 50)

    return () => clearInterval(taglineTimer)
  }, [phase])

  const visibleTagline = fullTagline.slice(0, charIdx)
  const part1 = visibleTagline.slice(0, TAGLINE_1.length)
  const part2 = visibleTagline.slice(TAGLINE_1.length)
  const isTyping = charIdx < totalChars || (subtitleIdx > 0 && subtitleIdx < SUBTITLE.length)
  const showCursor = phase === 'done'
  const visibleSubtitle = SUBTITLE.slice(0, subtitleIdx)

  return (
    <div className={`text-center mt-16 transition-opacity duration-300 ${phase === 'done' ? 'opacity-100' : 'opacity-0'}`}>
      <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tighter text-white">
        {part1}
        {part2 && (
          <span className="text-flow-green" style={{ textShadow: '0 0 30px rgba(0,239,139,0.35)' }}>
            {part2}
          </span>
        )}
        {showCursor && charIdx < totalChars && (
          <span
            className="inline-block w-[0.55em] h-[1.05em] ml-[2px] animate-[cursor-blink_1s_step-end_infinite] align-middle"
            style={{ background: '#00ef8b', boxShadow: '0 0 8px rgba(0,239,139,0.6), 0 0 16px rgba(0,239,139,0.2)' }}
          />
        )}
      </h1>
      <p className="mt-4 text-sm text-zinc-400 h-5">
        {visibleSubtitle}
        {showCursor && charIdx >= totalChars && (
          <span
            className="inline-block w-[0.5em] h-[1.05em] ml-[1px] animate-[cursor-blink_1s_step-end_infinite] align-middle"
            style={{ background: '#00ef8b', boxShadow: '0 0 6px rgba(0,239,139,0.5), 0 0 12px rgba(0,239,139,0.15)' }}
          />
        )}
      </p>
      <button
        onClick={onClickPlayground}
        className={`mt-8 px-6 py-2.5 border border-zinc-600 rounded text-xs text-zinc-300 hover:border-flow-green hover:text-flow-green hover:shadow-[0_0_12px_rgba(0,239,139,0.15)] transition-all ${showButton ? 'opacity-100' : 'opacity-0'}`}
      >
        Try it below &darr;
      </button>

    </div>
  )
}

/* ── Cadence syntax highlighting tokens ── */
const CODE_LINES = [
  { tokens: [{ text: '// Transfer FLOW tokens between accounts', cl: 'text-zinc-600' }] },
  { tokens: [{ text: 'import', cl: 'text-purple-400' }, { text: ' FungibleToken ', cl: 'text-yellow-300' }, { text: 'from ', cl: 'text-purple-400' }, { text: '0xf233dcee88fe0abe', cl: 'text-emerald-400' }] },
  { tokens: [{ text: 'import', cl: 'text-purple-400' }, { text: ' FlowToken ', cl: 'text-yellow-300' }, { text: 'from ', cl: 'text-purple-400' }, { text: '0x1654653399040a61', cl: 'text-emerald-400' }] },
  { tokens: [] },
  { tokens: [{ text: 'transaction', cl: 'text-purple-400' }, { text: '(', cl: 'text-zinc-400' }, { text: 'amount', cl: 'text-orange-300' }, { text: ': ', cl: 'text-zinc-400' }, { text: 'UFix64', cl: 'text-cyan-400' }, { text: ', ', cl: 'text-zinc-400' }, { text: 'to', cl: 'text-orange-300' }, { text: ': ', cl: 'text-zinc-400' }, { text: 'Address', cl: 'text-cyan-400' }, { text: ') {', cl: 'text-zinc-400' }] },
  { tokens: [] },
  { tokens: [{ text: '  ', cl: '' }, { text: 'let', cl: 'text-purple-400' }, { text: ' sentVault', cl: 'text-zinc-200' }, { text: ': ', cl: 'text-zinc-400' }, { text: '@{FungibleToken.Vault}', cl: 'text-cyan-400' }] },
  { tokens: [] },
  { tokens: [{ text: '  ', cl: '' }, { text: 'prepare', cl: 'text-purple-400' }, { text: '(', cl: 'text-zinc-400' }, { text: 'signer', cl: 'text-orange-300' }, { text: ': ', cl: 'text-zinc-400' }, { text: 'auth', cl: 'text-purple-400' }, { text: '(BorrowValue) ', cl: 'text-zinc-400' }, { text: '&Account', cl: 'text-cyan-400' }, { text: ') {', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '    ', cl: '' }, { text: 'let', cl: 'text-purple-400' }, { text: ' vaultRef', cl: 'text-zinc-200' }, { text: ' = ', cl: 'text-zinc-400' }, { text: 'signer', cl: 'text-orange-300' }, { text: '.storage.borrow<', cl: 'text-zinc-300' }] },
  { tokens: [{ text: '      auth(FungibleToken.Withdraw)', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '      &FlowToken.Vault', cl: 'text-cyan-400' }] },
  { tokens: [{ text: '    >', cl: 'text-zinc-300' }, { text: '(', cl: 'text-zinc-400' }, { text: 'from', cl: 'text-orange-300' }, { text: ': /storage/flowTokenVault', cl: 'text-zinc-400' }, { text: ')', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '      ?? ', cl: 'text-zinc-400' }, { text: 'panic', cl: 'text-red-400' }, { text: '(', cl: 'text-zinc-400' }, { text: '"Could not borrow vault"', cl: 'text-emerald-400' }, { text: ')', cl: 'text-zinc-400' }] },
  { tokens: [] },
  { tokens: [{ text: '    ', cl: '' }, { text: 'self', cl: 'text-purple-400' }, { text: '.sentVault ', cl: 'text-zinc-200' }, { text: '<- ', cl: 'text-red-400' }, { text: 'vaultRef', cl: 'text-zinc-200' }, { text: '.withdraw(', cl: 'text-zinc-300' }] },
  { tokens: [{ text: '      ', cl: '' }, { text: 'amount', cl: 'text-orange-300' }, { text: ': amount', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '    )', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '  }', cl: 'text-zinc-400' }] },
  { tokens: [] },
  { tokens: [{ text: '  ', cl: '' }, { text: 'execute', cl: 'text-purple-400' }, { text: ' {', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '    ', cl: '' }, { text: 'let', cl: 'text-purple-400' }, { text: ' receiver', cl: 'text-zinc-200' }, { text: ' = ', cl: 'text-zinc-400' }, { text: 'getAccount', cl: 'text-purple-400' }, { text: '(to)', cl: 'text-zinc-300' }] },
  { tokens: [{ text: '      .capabilities.borrow<', cl: 'text-zinc-300' }] },
  { tokens: [{ text: '        &{FungibleToken.Receiver}', cl: 'text-cyan-400' }] },
  { tokens: [{ text: '      >', cl: 'text-zinc-300' }, { text: '(/public/flowTokenReceiver)', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '      ?? ', cl: 'text-zinc-400' }, { text: 'panic', cl: 'text-red-400' }, { text: '(', cl: 'text-zinc-400' }, { text: '"Could not borrow receiver"', cl: 'text-emerald-400' }, { text: ')', cl: 'text-zinc-400' }] },
  { tokens: [] },
  { tokens: [{ text: '    receiver.deposit(', cl: 'text-zinc-300' }, { text: 'from', cl: 'text-orange-300' }, { text: ': ', cl: 'text-zinc-400' }, { text: '<- ', cl: 'text-red-400' }, { text: 'self', cl: 'text-purple-400' }, { text: '.sentVault)', cl: 'text-zinc-200' }] },
  { tokens: [{ text: '  }', cl: 'text-zinc-400' }] },
  { tokens: [{ text: '}', cl: 'text-zinc-400' }] },
]

type Phase = 'idle' | 'typing' | 'ready' | 'running' | 'done'

/* ── Build flat character stream for typewriter ── */
const CHAR_STREAM: { char: string; cl: string; lineIdx: number; isNewline: boolean }[] = []
CODE_LINES.forEach((line, lineIdx) => {
  if (line.tokens.length === 0) {
    CHAR_STREAM.push({ char: '\n', cl: '', lineIdx, isNewline: true })
  } else {
    for (const token of line.tokens) {
      for (const ch of token.text) {
        CHAR_STREAM.push({ char: ch, cl: token.cl, lineIdx, isNewline: false })
      }
    }
    CHAR_STREAM.push({ char: '\n', cl: '', lineIdx, isNewline: true })
  }
})
const TOTAL_CHARS = CHAR_STREAM.length

export function Hero() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [charIdx, setCharIdx] = useState(0)
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const clearTimers = () => {
    timerRef.current.forEach(clearTimeout)
    timerRef.current = []
    if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const schedule = (fn: () => void, ms: number) => {
    timerRef.current.push(setTimeout(fn, ms))
  }

  useEffect(() => {
    const run = () => {
      clearTimers()
      setPhase('typing')
      setCharIdx(0)

      let idx = 0
      intervalRef.current = setInterval(() => {
        idx += 3
        if (idx >= TOTAL_CHARS) {
          idx = TOTAL_CHARS
          setCharIdx(TOTAL_CHARS)
          if (intervalRef.current) clearInterval(intervalRef.current)
          intervalRef.current = null
          return
        }
        setCharIdx(idx)
      }, 8)

      const typingDuration = Math.ceil(TOTAL_CHARS / 3) * 8
      schedule(() => setPhase('ready'), typingDuration + 300)
      schedule(() => setPhase('running'), typingDuration + 800)
      schedule(() => setPhase('done'), typingDuration + 1600)
    }

    schedule(run, 500)
    return clearTimers
  }, [])

  const scrollToPlayground = () => {
    document.getElementById('playground')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <section className="min-h-screen flex flex-col items-center justify-center px-4 pt-16 pb-8">

      <div className="w-full max-w-3xl sm:max-w-4xl mx-auto">
        {/* ══════ Dark Monitor ══════ */}
        <div
          className="relative"
          style={{ filter: 'drop-shadow(0 25px 60px rgba(0,0,0,0.6))' }}
        >
          {/* ── Monitor shell — dark aluminum ── */}
          <div
            className="relative rounded-[12px] sm:rounded-[16px]"
            style={{
              background: 'linear-gradient(180deg, #1e1e1e 0%, #181818 20%, #141414 50%, #111 80%, #0e0e0e 100%)',
              boxShadow: `
                inset 0 1px 0 rgba(255,255,255,0.08),
                inset 0 -1px 0 rgba(0,0,0,0.4),
                inset 1px 0 0 rgba(255,255,255,0.04),
                inset -1px 0 0 rgba(255,255,255,0.04),
                0 0 0 1px rgba(255,255,255,0.03)
              `,
              padding: '14px 14px 10px 14px',
            }}
          >
            {/* ── Screen bezel ── */}
            <div
              className="relative rounded-[6px] sm:rounded-[8px]"
              style={{
                background: '#0a0a0a',
                padding: '3px',
                boxShadow: `
                  inset 0 2px 6px rgba(0,0,0,0.8),
                  inset 0 0 12px rgba(0,0,0,0.4),
                  0 1px 0 rgba(255,255,255,0.05)
                `,
              }}
            >
              {/* ── CRT screen — green phosphor ── */}
              <div
                className="relative overflow-hidden rounded-[4px] sm:rounded-[6px]"
                style={{
                  background: '#010a03',
                  height: 'clamp(400px, 65vw, 560px)',
                }}
              >
                {/* Scanlines */}
                <div className="absolute inset-0 pointer-events-none z-[3]" style={{
                  background: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.08) 1px, rgba(0,0,0,0.08) 2px)',
                }} />
                {/* Vignette */}
                <div className="absolute inset-0 pointer-events-none z-[4]" style={{
                  background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 55%, rgba(0,0,0,0.3) 100%)',
                }} />
                {/* Phosphor glow */}
                <div className="absolute inset-0 pointer-events-none z-[2]" style={{
                  boxShadow: 'inset 0 0 80px rgba(0,239,139,0.03)',
                }} />
                {/* Reflection highlight */}
                <div className="absolute inset-0 pointer-events-none z-[5]" style={{
                  background: 'radial-gradient(ellipse 40% 25% at 25% 15%, rgba(255,255,255,0.04) 0%, transparent 100%)',
                }} />

                {/* Screen content */}
                <div className="relative z-[1] h-full flex flex-col">
                  {/* Title bar */}
                  <div className="px-3 py-1.5 border-b border-emerald-900/20 flex items-center justify-between shrink-0">
                    <span className="text-[9px] sm:text-[10px] text-emerald-500/70 flex items-center gap-1.5">
                      <span className="text-emerald-400/70">$</span> transfer.cdc
                    </span>
                    <button
                      className={`px-3 py-0.5 rounded text-[9px] sm:text-[10px] font-bold transition-all duration-300 ${
                        phase === 'ready'
                          ? 'bg-flow-green text-black shadow-[0_0_20px_rgba(0,239,139,0.6)]'
                          : phase === 'running'
                            ? 'bg-flow-green text-black animate-pulse'
                            : phase === 'done'
                              ? 'bg-flow-green text-black'
                              : 'bg-emerald-950/40 text-emerald-600/60 border border-emerald-800/30'
                      }`}
                    >
                      {phase === 'running' ? '◉ Running...' : phase === 'done' ? '✓ Passed' : '▶ Simulate'}
                    </button>
                  </div>

                  {/* Code + Result */}
                  <div className="flex-1 flex min-h-0">
                    {/* Code */}
                    <div className="flex-1 overflow-hidden">
                      <div className="p-2 sm:p-3 text-[8px] sm:text-[10px] leading-relaxed font-mono whitespace-pre overflow-hidden">
                        {(() => {
                          const visible = CHAR_STREAM.slice(0, charIdx)
                          const lines: { char: string; cl: string }[][] = [[]]
                          for (const c of visible) {
                            if (c.isNewline || c.char === '\n') { lines.push([]) }
                            else { lines[lines.length - 1].push(c) }
                          }
                          return lines.map((lineChars, i) => (
                            <div key={i} style={{ textShadow: '0 0 8px rgba(0,239,139,0.1)' }}>
                              <span className="text-emerald-700/50 mr-2 select-none text-[7px] sm:text-[8px] inline-block w-3 text-right">{String(i + 1).padStart(2)}</span>
                              {lineChars.length === 0 && <span>&nbsp;</span>}
                              {lineChars.map((c, j) => (
                                <span key={j} className={c.cl}>{c.char}</span>
                              ))}
                              {phase === 'typing' && i === lines.length - 1 && charIdx < TOTAL_CHARS && (
                                <span className="inline-block w-[6px] h-[11px] bg-flow-green animate-[cursor-blink_1s_step-end_infinite] align-middle" style={{ boxShadow: '0 0 8px rgba(0,239,139,0.7)' }} />
                              )}
                            </div>
                          ))
                        })()}
                      </div>
                    </div>

                    {/* Result panel */}
                    <div className="hidden sm:block w-52 border-l border-zinc-700/30">
                      <div className={`p-3 transition-all duration-500 ${phase === 'done' ? 'opacity-100' : 'opacity-0 translate-x-3'}`}>
                        <div className="flex items-center gap-1.5 mb-3">
                          <div className="w-2 h-2 rounded-full bg-flow-green" style={{ boxShadow: '0 0 8px rgba(0,239,139,0.8)' }} />
                          <span className="text-flow-green text-[10px] font-semibold" style={{ textShadow: '0 0 10px rgba(0,239,139,0.5)' }}>Passed</span>
                          <span className="ml-auto text-[8px] text-zinc-500">1,204 ops</span>
                        </div>
                        <div className="text-[7px] text-emerald-500/60 tracking-wider mb-2" style={{ textShadow: '0 0 6px rgba(0,239,139,0.2)' }}>BALANCE CHANGES</div>
                        <div className="rounded p-2 text-[9px] space-y-1.5 border border-emerald-800/30 bg-black/40">
                          <div className="flex justify-between">
                            <span className="text-zinc-300">0x1654..0a61</span>
                            <span className="text-red-400 font-semibold" style={{ textShadow: '0 0 8px rgba(248,113,113,0.4)' }}>-10.0 FLOW</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-zinc-300">0xf8d6..20c7</span>
                            <span className="text-flow-green font-semibold" style={{ textShadow: '0 0 10px rgba(0,239,139,0.6)' }}>+10.0 FLOW</span>
                          </div>
                        </div>
                        <div className="text-[7px] text-emerald-500/60 tracking-wider mb-2 mt-4" style={{ textShadow: '0 0 6px rgba(0,239,139,0.2)' }}>EVENTS</div>
                        <div className="rounded p-2 text-[9px] space-y-1 border border-emerald-800/30 bg-black/40">
                          <div className="text-zinc-300">TokensWithdrawn <span className="text-zinc-400">x1</span></div>
                          <div className="text-zinc-300">TokensDeposited <span className="text-zinc-400">x1</span></div>
                        </div>
                        <div className="mt-4 text-[8px] text-zinc-400">
                          Fee: <span className="text-zinc-200">0.00001</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Bottom bar: label + LED ── */}
            <div className="mt-2 flex items-center justify-between px-2">
              <div
                className="text-[9px] sm:text-[11px] tracking-[3px] font-bold select-none uppercase"
                style={{
                  color: '#3a3a3a',
                  textShadow: '0 1px 0 rgba(255,255,255,0.05)',
                }}
              >
                FlowIndex Simulator
              </div>
              <div className="crt-led" />
            </div>
          </div>

        </div>
      </div>

      {/* ── Tagline with typewriter effect ── */}
      <Typewriter phase={phase} onClickPlayground={scrollToPlayground} />
    </section>
  )
}
