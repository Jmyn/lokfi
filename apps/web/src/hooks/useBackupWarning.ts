import { useLiveQuery } from 'dexie-react-hooks'
import { useState, useEffect } from 'react'
import { db } from '../lib/db/db'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export function useBackupWarning() {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    // Update 'now' to ensure it's fresh enough if the app stays open for days
    const interval = setInterval(() => setNow(Date.now()), 1000 * 60 * 60)
    return () => clearInterval(interval)
  }, [])

  const lastExportedSetting = useLiveQuery(
    () => db.settings.get('lastExportedAt'),
    []
  )

  if (lastExportedSetting === undefined && !db.isOpen()) {
    return false
  }

  if (!lastExportedSetting || !lastExportedSetting.value) {
    return true
  }

  try {
    const lastExportDate = new Date(lastExportedSetting.value)
    return (now - lastExportDate.getTime()) > THIRTY_DAYS_MS
  } catch {
    return true
  }
}

