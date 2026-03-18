import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

interface UploadZoneProps {
  onFilesAdded: (files: File[]) => void
}

export function UploadZone({ onFilesAdded }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) onFilesAdded(files)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (files.length) onFilesAdded(files)
    e.target.value = ''
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === 'Enter' && inputRef.current?.click()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={[
        'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 cursor-pointer transition-colors',
        isDragging
          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
          : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/40',
      ].join(' ')}
    >
      <Upload className="h-8 w-8 text-gray-400 dark:text-gray-500" />
      <div className="text-center">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Drop files here or click to browse
        </p>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          CSV or PDF — CDC, OCBC, UOB, Citibank
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.pdf"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
