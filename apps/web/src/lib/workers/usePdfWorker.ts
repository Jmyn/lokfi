import { useRef, useCallback, useEffect } from 'react'

interface WorkerMessage {
  type: 'parse'
  buffer: ArrayBuffer
  id: string
}

interface WorkerSuccess {
  type: 'success'
  text: string
  id: string
}

interface WorkerError {
  type: 'error'
  message: string
  id: string
}

type WorkerResponse = WorkerSuccess | WorkerError

export function usePdfWorker() {
  const workerRef = useRef<Worker | null>(null)
  const pendingRef = useRef<Map<string, { resolve: (text: string) => void; reject: (err: Error) => void }>>(new Map())
  const counterRef = useRef(0)

  const getWorker = useCallback(() => {
    if (!workerRef.current) {
      const worker = new Worker(new URL('./pdf.worker.ts', import.meta.url), { type: 'module' })

      worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        const { type, id } = event.data
        const pending = pendingRef.current.get(id)
        if (!pending) return

        pendingRef.current.delete(id)
        if (type === 'success') {
          pending.resolve((event.data as WorkerSuccess).text)
        } else {
          pending.reject(new Error((event.data as WorkerError).message))
        }
      })

      worker.addEventListener('error', (err) => {
        // Reject all pending with the error
        for (const [id, pending] of pendingRef.current) {
          pending.reject(new Error(`Worker error: ${err.message}`))
          pendingRef.current.delete(id)
        }
      })

      workerRef.current = worker
    }
    return workerRef.current
  }, [])

  /**
   * Parse a PDF binary buffer into extracted text.
   * @param buffer ArrayBuffer of the PDF file
   * @returns Raw extracted text string
   */
  const parsePdf = useCallback((buffer: ArrayBuffer): Promise<string> => {
    return new Promise((resolve, reject) => {
      const id = `pdf-${++counterRef.current}`
      pendingRef.current.set(id, { resolve, reject })

      const worker = getWorker()
      const msg: WorkerMessage = { type: 'parse', buffer, id }
      // Transfer the ArrayBuffer to avoid a costly structured-clone copy on large PDFs.
      // After transfer, msg.buffer on the main thread becomes detached (zero-byte),
      // which is safe since we don't use it after posting.
      worker.postMessage(msg, [msg.buffer])
    })
  }, [getWorker])

  // Terminate worker on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  return { parsePdf }
}
