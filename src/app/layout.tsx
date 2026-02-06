import type { Metadata } from 'next'
import { Recursive } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'
import { ThemeProvider } from '@/hooks/useTheme'
import { CreditsNotificationProvider } from '@/components/CreditsNotificationProvider'
import { BottomNotificationBar } from '@/components/BottomNotificationBar'
import { Toaster } from 'sonner'

const recursive = Recursive({
  subsets: ['latin'],
  variable: '--font-title',
  weight: ['400', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'Podium Arena',
  description: 'Every entry grows the prize pool. Rise to the top when the day closes and claim your share.',
  metadataBase: new URL('https://podiumarena.com'),
  openGraph: {
    title: 'Podium Arena',
    description: 'New Champions. Every Day. Play skill games, top the leaderboard, and claim your share of the pool.',
    siteName: 'Podium Arena',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Podium Arena',
    description: 'New Champions. Every Day. Play skill games, top the leaderboard, and claim your share of the pool.',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${recursive.className} ${recursive.variable} bg-slate-900 dark:bg-slate-900 light:bg-slate-100 min-h-screen transition-colors`}>
        <ThemeProvider>
          <CreditsNotificationProvider>
            <Header />
            <main className="pb-14">{children}</main>
            <BottomNotificationBar />
            <Toaster position="bottom-right" theme="dark" toastOptions={{ duration: 4000 }} />
          </CreditsNotificationProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
