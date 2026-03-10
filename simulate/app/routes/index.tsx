import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main className="pt-12">
      <div className="min-h-screen flex items-center justify-center">
        <h1 className="text-2xl font-bold text-zinc-100">FlowIndex Simulate</h1>
      </div>
    </main>
  )
}
