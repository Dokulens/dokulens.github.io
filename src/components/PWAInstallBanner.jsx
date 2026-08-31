import { useState, useEffect } from 'react'
import { Download, Check, Wifi, WifiOff, X } from 'lucide-react'

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }

    const handleAppInstalled = () => {
      setIsInstalled(true)
      setDeferredPrompt(null)
    }

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      setIsInstalled(true)
    }
    setDeferredPrompt(null)
  }

  return (
    <div className="space-y-2">
      {/* Offline Status Badge */}
      {!isOnline && (
        <div className="flex items-center gap-1.5 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400 animate-fade-in">
          <WifiOff size={13} />
          <span>Mode Offline Aktif — Semua tool tetap dapat digunakan penuh!</span>
        </div>
      )}

      {/* PWA Install Button Prompt */}
      {deferredPrompt && !isInstalled && !dismissed && (
        <div className="flex items-center justify-between gap-2 rounded border border-[--color-brand] bg-[--color-brand-light] p-2 text-xs animate-fade-in">
          <div className="flex items-center gap-1.5 min-w-0">
            <Download size={14} className="shrink-0 text-[--color-brand]" />
            <span className="font-medium text-[--color-brand-text] truncate">
              Install DokuLens ke Desktop / HP
            </span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={handleInstallClick}
              className="rounded bg-[--color-brand] px-2 py-0.5 font-bold text-white hover:bg-[--color-brand-hover] transition-colors"
            >
              Install
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="p-0.5 text-[--color-text-3] hover:text-[--color-text]"
            >
              <X size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
