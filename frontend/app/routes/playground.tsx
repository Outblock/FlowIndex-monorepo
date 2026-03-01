import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/playground')({
    component: PlaygroundPage,
})

function PlaygroundPage() {
    const RUNNER_URL = import.meta.env.VITE_RUNNER_URL || 'https://run.flowindex.io'

    return (
        <div className="h-[calc(100vh-3rem)]">
            <iframe
                src={RUNNER_URL}
                className="w-full h-full border-0"
                allow="clipboard-write"
                title="Cadence Runner"
            />
        </div>
    )
}
