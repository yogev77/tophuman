import type { Metadata, Viewport } from 'next'
import { Recursive } from 'next/font/google'
import { ViewTransitions } from 'next-view-transitions'
import './globals.css'
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
