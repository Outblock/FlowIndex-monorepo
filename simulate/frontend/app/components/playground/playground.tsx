import { useState, useCallback, useRef, useEffect } from 'react'
import { templates } from '@/lib/templates'
import { simulateTransaction, type SimulateResponse } from '@/lib/simulate'
import { TemplatePanel } from './template-panel'
import { EditorPanel } from './editor-panel'
import { ResultPanel } from './result-panel'

function toCadenceArg(type: string, value: string): Record<string, unknown> {
  return { type, value }
}

export function Playground() {
  const [activeId, setActiveId] = useState(templates[0].id)
  const [code, setCode] = useState(templates[0].cadence)
  const [argValues, setArgValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const arg of templates[0].args) {
      initial[arg.name] = arg.defaultValue
    }
    return initial
  })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<SimulateResponse | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect() } },
      { rootMargin: '200px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const handleSelectTemplate = useCallback((id: string) => {
    const t = templates.find((t) => t.id === id)
    if (!t) return
    setActiveId(id)
    setCode(t.cadence)
    setResult(null)
    const newArgs: Record<string, string> = {}
    for (const arg of t.args) {
      newArgs[arg.name] = arg.defaultValue
    }
    setArgValues(newArgs)
  }, [])

  const handleArgChange = useCallback((name: string, value: string) => {
    setArgValues((prev) => ({ ...prev, [name]: value }))
  }, [])

  const handleSimulate = useCallback(async () => {
    const active = templates.find((t) => t.id === activeId)
    if (!active) return

    setLoading(true)
    setResult(null)

    const args = active.args.map((a) => toCadenceArg(a.type, argValues[a.name] ?? a.defaultValue))
    const payer = '0x1654653399040a61'

    try {
      const res = await simulateTransaction({
        cadence: code,
        arguments: args,
        authorizers: [payer],
        payer,
      })
      setResult(res)
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
        events: [],
        balanceChanges: [],
        computationUsed: 0,
      })
    } finally {
      setLoading(false)
    }
  }, [activeId, code, argValues])

  return (
    <section id="playground" className="border-t border-zinc-800/50 retro-grid flex flex-col" style={{ height: '100dvh' }} ref={containerRef}>
      <div className="px-6 pt-6 pb-2 shrink-0">
        <div className="text-[10px] text-flow-green/60 tracking-[3px] mb-2 crt-glow">// PLAYGROUND</div>
        <h2 className="text-xl font-bold text-zinc-100">Try it now</h2>
      </div>

      <div className="flex-1 px-3 pb-3 flex flex-col min-h-0">
        <div className="crt-bezel flex-1 flex flex-col min-h-0">
          <div className="crt-screen crt-scanlines crt-vignette bg-[#0a0a0a] flex-1 flex flex-col min-h-0">
            <div className="flex flex-1 min-h-0">
              {visible ? (
                <>
                  <TemplatePanel
                    templates={templates}
                    activeId={activeId}
                    argValues={argValues}
                    onSelectTemplate={handleSelectTemplate}
                    onArgChange={handleArgChange}
                  />
                  <EditorPanel
                    code={code}
                    filename={templates.find((t) => t.id === activeId)?.filename ?? 'code.cdc'}
                    loading={loading}
                    onCodeChange={setCode}
                    onSimulate={handleSimulate}
                  />
                  <ResultPanel result={result} />
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-xs text-zinc-500">
                  <span className="crt-cursor mr-2" /> Initializing playground...
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center justify-center gap-2 pt-2 pb-1">
            <div className="crt-led" />
            <span className="text-[8px] text-zinc-500 tracking-widest uppercase">Simulator</span>
          </div>
        </div>
      </div>
    </section>
  )
}
