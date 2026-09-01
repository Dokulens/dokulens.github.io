import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export function useIncomingFile(setFile, setFileName) {
  const location = useLocation()

  useEffect(() => {
    const incoming = location.state?.file
    if (incoming instanceof Blob) {
      const name = location.state?.fileName || 'file'
      const file = new File([incoming], name, { type: incoming.type })
      setFile(file)
      if (setFileName) setFileName(name)
    }
    // clear state so刷新 doesn't re-trigger
    if (location.state) {
      window.history.replaceState({}, document.title)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
