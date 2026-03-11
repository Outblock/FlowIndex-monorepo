import { createRootRoute, Outlet, HeadContent, Scripts } from '@tanstack/react-router'
import { Navbar } from '@/components/navbar'
import { Footer } from '@/components/footer'
import appCss from '@/index.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'FlowIndex Simulator — Transaction Simulator for Flow' },
      { name: 'description', content: 'Simulate Flow transactions against real mainnet state. See balance changes, events, and errors before signing.' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
    ],
  }),
  component: RootLayout,
})

function RootLayout() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        <Navbar />
        <Outlet />
        <Footer />
        <Scripts />
      </body>
    </html>
  )
}
