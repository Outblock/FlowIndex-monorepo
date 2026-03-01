import { createFileRoute } from '@tanstack/react-router'
import DeveloperLayout from '../../components/developer/DeveloperLayout'

export const Route = createFileRoute('/developer/runner')({
  component: RunnerPage,
})

function RunnerPage() {
  const RUNNER_URL = import.meta.env.VITE_RUNNER_URL || 'https://run.flowindex.io'

  return (
    <DeveloperLayout>
      <div className="h-[calc(100vh-8rem)] -m-6 -mb-6">
        <iframe
          src={RUNNER_URL}
          className="w-full h-full border-0"
          allow="clipboard-write"
          title="Cadence Runner"
        />
      </div>
    </DeveloperLayout>
  )
}
