import { useLiveQuery } from 'dexie-react-hooks'
import { type Dispatch, type ReactNode, type SetStateAction, createContext, useContext, useState } from 'react'
import { getBackupRestoreRevision } from '../../lib/db/backup'
import { db } from '../../lib/db/db'
import { type Filters, defaultFilters } from '../transactions/filterTypes'

interface AskLokfiContextValue {
  backupRevision: string | null | undefined
  transactionFilters: Filters
  setTransactionFilters: Dispatch<SetStateAction<Filters>>
  financesFilters: Filters
  setFinancesFilters: Dispatch<SetStateAction<Filters>>
}

const AskLokfiContext = createContext<AskLokfiContextValue | null>(null)

export function AskLokfiProvider({ children }: { children: ReactNode }) {
  const revision = useLiveQuery(() => getBackupRestoreRevision(db), [])
  const [initialRevision, setInitialRevision] = useState<string | null>()
  if (initialRevision === undefined && revision !== undefined) setInitialRevision(revision)

  // A restore replaces the dataset behind the app’s reports, filters and open editors.
  return (
    <AskLokfiWorkspace
      key={revision === initialRevision ? 'initial' : (revision ?? 'initial')}
      backupRevision={revision}
    >
      {children}
    </AskLokfiWorkspace>
  )
}

function AskLokfiWorkspace({
  children,
  backupRevision,
}: { children: ReactNode; backupRevision: string | null | undefined }) {
  const [transactionFilters, setTransactionFilters] = useState(defaultFilters)
  const [financesFilters, setFinancesFilters] = useState(defaultFilters)

  return (
    <AskLokfiContext.Provider
      value={{ backupRevision, transactionFilters, setTransactionFilters, financesFilters, setFinancesFilters }}
    >
      {children}
    </AskLokfiContext.Provider>
  )
}

export function useAskLokfiWorkspace() {
  const context = useContext(AskLokfiContext)
  if (!context) throw new Error('Ask Lokfi requires the app shell.')
  return context
}
