import { useEffect, useState } from 'react'

/** Whether the browser says it's online (`navigator.onLine` and its events). It can be true with no
 * internet, so the map switches to tiles only once one loads (SPEC.md 6.2). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    update()
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
