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

/**
 * Normalizes an email address to detect duplicate accounts using aliases.
 *
 * Gmail rules:
 * - Dots are ignored: j.o.h.n@gmail.com = john@gmail.com
 * - Plus suffixes are ignored: john+spam@gmail.com = john@gmail.com
 * - googlemail.com = gmail.com
 *
 * Other providers (outlook, yahoo, etc.):
 * - Plus suffixes are ignored
 *
 * @returns Normalized lowercase email
 */
export function normalizeEmail(email: string): string {
  const [localPart, domain] = email.toLowerCase().trim().split('@')

  if (!localPart || !domain) {
    return email.toLowerCase().trim()
  }

  // Normalize domain
  let normalizedDomain = domain
  if (domain === 'googlemail.com') {
    normalizedDomain = 'gmail.com'
  }

  // Normalize local part
  let normalizedLocal = localPart

  // Remove everything after + for all providers
  const plusIndex = normalizedLocal.indexOf('+')
  if (plusIndex !== -1) {
    normalizedLocal = normalizedLocal.substring(0, plusIndex)
  }

  // For Gmail, also remove dots
  if (normalizedDomain === 'gmail.com') {
    normalizedLocal = normalizedLocal.replace(/\./g, '')
  }

  return `${normalizedLocal}@${normalizedDomain}`
}

/**
 * Checks if an email appears to be a disposable/temporary email service.
 * This is a basic check - consider using a dedicated service for production.
 */
export function isDisposableEmail(email: string): boolean {
  const disposableDomains = [
    'tempmail.com', 'throwaway.email', 'guerrillamail.com', 'mailinator.com',
    '10minutemail.com', 'temp-mail.org', 'fakeinbox.com', 'trashmail.com',
    'yopmail.com', 'maildrop.cc', 'getnada.com', 'mohmal.com'
  ]

  const domain = email.toLowerCase().split('@')[1]
  return disposableDomains.includes(domain)
}
