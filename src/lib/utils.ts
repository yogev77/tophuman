import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getUtcDay(): string {
  return new Date().toISOString().split('T')[0]
}

export function formatCredits(amount: number): string {
  return amount.toLocaleString()
}

export function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const milliseconds = ms % 1000
  return `${seconds}.${milliseconds.toString().padStart(3, '0')}s`
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'

  const hours = Math.floor(ms / (1000 * 60 * 60))
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60))
  const seconds = Math.floor((ms % (1000 * 60)) / 1000)

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

export function getMsUntilMidnightUtc(): number {
  const now = new Date()
  const midnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0
  ))
  return midnight.getTime() - now.getTime()
}

export function generateTurnToken(): string {
  const random = crypto.getRandomValues(new Uint8Array(32))
  const hex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('')
  return `turn_${hex}_${Date.now()}`
}
