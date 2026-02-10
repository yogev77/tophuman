'use client'

import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'

type SoundName = 'tap' | 'drop' | 'hit' | 'miss' | 'success' | 'tick'

interface SoundContextType {
  enabled: boolean
  toggleSounds: () => void
  play: (name: SoundName) => void
}

const SoundContext = createContext<SoundContextType | undefined>(undefined)

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [enabled, setEnabled] = useState(true)
  const [mounted, setMounted] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    setMounted(true)
    const stored = localStorage.getItem('sounds')
    if (stored === 'false') setEnabled(false)
  }, [])

  useEffect(() => {
    if (!mounted) return
    localStorage.setItem('sounds', String(enabled))
  }, [enabled, mounted])

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }, [])

  const play = useCallback((name: SoundName) => {
    if (!enabled) return
    try {
      const ctx = getAudioContext()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)

      const t = ctx.currentTime

      switch (name) {
        case 'tap':
          osc.type = 'sine'
          osc.frequency.value = 600
          gain.gain.setValueAtTime(0.2, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06)
          osc.start(t)
          osc.stop(t + 0.06)
          break
        case 'drop':
          osc.type = 'sine'
          osc.frequency.value = 400
          gain.gain.setValueAtTime(0.2, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08)
          osc.start(t)
          osc.stop(t + 0.08)
          break
        case 'hit':
          osc.type = 'sine'
          osc.frequency.value = 800
          gain.gain.setValueAtTime(0.22, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07)
          osc.start(t)
          osc.stop(t + 0.07)
          break
        case 'miss':
          osc.type = 'sine'
          osc.frequency.value = 250
          gain.gain.setValueAtTime(0.2, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1)
          osc.start(t)
          osc.stop(t + 0.1)
          break
        case 'success': {
          osc.type = 'sine'
          osc.frequency.setValueAtTime(880, t)
          osc.frequency.linearRampToValueAtTime(1100, t + 0.12)
          gain.gain.setValueAtTime(0.22, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
          osc.start(t)
          osc.stop(t + 0.12)
          break
        }
        case 'tick':
          osc.type = 'triangle'
          osc.frequency.value = 500
          gain.gain.setValueAtTime(0.15, t)
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04)
          osc.start(t)
          osc.stop(t + 0.04)
          break
      }
    } catch {
      // Audio not available — silently ignore
    }
  }, [enabled, getAudioContext])

  const toggleSounds = useCallback(() => {
    setEnabled(prev => !prev)
  }, [])

  return (
    <SoundContext.Provider value={{ enabled, toggleSounds, play }}>
      {children}
    </SoundContext.Provider>
  )
}

export function useSound() {
  const context = useContext(SoundContext)
  if (context === undefined) {
    throw new Error('useSound must be used within a SoundProvider')
  }
  return context
}
