'use client'

import { useCallback, useEffect, useState } from 'react'
import { emptyProgress, normalizeProgress, type ProgressState } from '@/lib/progress'

export const PROGRESS_LOCAL_KEY = 'lexqcm_next_progress_v4'
const OLD_LOCAL_KEYS = ['lexqcm_next_progress_v3', 'lexqcm_crfpa_v1_state']

export function useProgress() {
  const [progress, setProgress] = useState<ProgressState>(emptyProgress())
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [online, setOnline] = useState(true)
  const [error, setError] = useState('')

  const syncCloud = useCallback(async (next: ProgressState) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    setSyncing(true)
    try {
      const response = await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ progress: next }),
      })
      if (!response.ok) throw new Error('Synchronisation impossible.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Synchronisation impossible.')
    } finally {
      setSyncing(false)
    }
  }, [])

  const persist = useCallback((next: ProgressState) => {
    setProgress(next)
    try { localStorage.setItem(PROGRESS_LOCAL_KEY, JSON.stringify(next)) } catch {}
    void syncCloud(next)
  }, [syncCloud])

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/progress', { cache: 'no-store' })
      const cloud = response.ok ? normalizeProgress((await response.json()).progress) : emptyProgress()

      let local = emptyProgress()
      const candidates = [PROGRESS_LOCAL_KEY, ...OLD_LOCAL_KEYS]
      for (const key of candidates) {
        const raw = localStorage.getItem(key)
        if (!raw) continue
        try {
          const parsed = normalizeProgress(JSON.parse(raw))
          const parsedWeight = parsed.answered + parsed.caseHistory.length
          const localWeight = local.answered + local.caseHistory.length
          if (parsedWeight > localWeight) local = parsed
        } catch {}
      }

      const cloudWeight = cloud.answered + cloud.caseHistory.length
      const localWeight = local.answered + local.caseHistory.length
      const chosen = localWeight > cloudWeight ? local : cloud
      setProgress(chosen)
      localStorage.setItem(PROGRESS_LOCAL_KEY, JSON.stringify(chosen))
      if (localWeight > cloudWeight) void syncCloud(chosen)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Progression indisponible.')
    } finally {
      setLoading(false)
    }
  }, [syncCloud])

  useEffect(() => {
    setOnline(navigator.onLine)
    void reload()
    const onOnline = () => {
      setOnline(true)
      const raw = localStorage.getItem(PROGRESS_LOCAL_KEY)
      if (raw) {
        try { void syncCloud(normalizeProgress(JSON.parse(raw))) } catch {}
      }
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [reload, syncCloud])

  return { progress, persist, loading, syncing, online, error, reload }
}
