import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

function createRouter() {
  return createTanStackRouter({ routeTree })
}

let browserRouter: ReturnType<typeof createRouter> | undefined

export function getRouter() {
  if (typeof document !== 'undefined') {
    browserRouter ??= createRouter()
    return browserRouter
  }
  return createRouter()
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
