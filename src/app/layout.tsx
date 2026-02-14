import type { Metadata, Viewport } from 'next'
import { Recursive } from 'next/font/google'
import { ViewTransitions } from 'next-view-transitions'
import './globals.css'
import { Link } from 'next-view-transitions'
import { Header } from '@/components/Header'
import { ThemeProvider } from '@/hooks/useTheme'
import { SoundProvider } from '@/hooks/useSound'
import { CreditsNotificationProvider } from '@/components/CreditsNotificationProvider'
import { BottomNotificationBar } from '@/components/BottomNotificationBar'
import { GroupPlayProvider } from '@/components/GroupPlayProvider'
import { GroupPlayBar } from '@/components/GroupPlayBar'
import { Toaster } from 'sonner'

const recursive = Recursive({
  subsets: ['latin'],
  variable: '--font-title',
  weight: ['400', '700', '800', '900'],
})

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'Podium Arena',
  description: 'Daily Mind Battles.',
  metadataBase: new URL('https://podiumarena.com'),
  openGraph: {
    title: 'Podium Arena',
    description: 'Daily Mind Battles.',
    siteName: 'Podium Arena',
    type: 'website',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'Podium Arena - Daily Mind Battles' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Podium Arena',
    description: 'Daily Mind Battles.',
    images: ['/opengraph-image'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ViewTransitions>
      <html lang="en" className="dark">
        <body className={`${recursive.className} ${recursive.variable} bg-slate-100 dark:bg-slate-900 min-h-screen transition-colors`}>
          <ThemeProvider>
            <SoundProvider>
            <CreditsNotificationProvider>
            <GroupPlayProvider>
              <Header />
              <GroupPlayBar />
              <main className="pb-14">{children}</main>
              <footer className="border-t border-slate-200 dark:border-slate-800">
                <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-500">
                  <span>&copy; 2026 Podium Arena &middot; For entertainment purposes only.</span>
                  <Link href="/terms" className="hover:text-slate-700 dark:hover:text-slate-300 transition-colors">Terms of Use</Link>
                </div>
              </footer>
              <BottomNotificationBar />
              <Toaster position="bottom-right" theme="dark" toastOptions={{ duration: 4000 }} />
            </GroupPlayProvider>
            </CreditsNotificationProvider>
            </SoundProvider>
          </ThemeProvider>
        </body>
      </html>
    </ViewTransitions>
  )
}
