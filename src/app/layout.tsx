import type { Metadata } from 'next'
import { Recursive } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/Header'

const recursive = Recursive({
  subsets: ['latin'],
  variable: '--font-title',
  weight: ['400', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'TopHuman - Daily Skill Competition',
  description: 'Compete daily in skill-based games. Prove you\'re human!',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={`${recursive.className} ${recursive.variable} bg-slate-900 min-h-screen`}>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  )
}
