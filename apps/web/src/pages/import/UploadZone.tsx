import { useRef, useState } from 'react'
import { ArrowUpFromLine } from 'lucide-react'

interface UploadZoneProps {
  onFilesAdded: (files: File[]) => void
}

const FORMATS = ['CDC', 'OCBC', 'UOB', 'Citibank']

export function UploadZone({ onFilesAdded }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    // Only leave if we actually left the zone
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
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
      className="relative flex flex-col items-center justify-center gap-5 rounded-2xl cursor-pointer transition-all duration-200 select-none"
      style={{
        minHeight: '280px',
        border: `2px dashed ${isDragging ? 'var(--accent)' : 'var(--border)'}`,
        backgroundColor: isDragging ? 'var(--accent-subtle)' : 'var(--bg-sidebar)',
        // Animate dash on drag
        ...(isDragging
          ? {
              backgroundImage:
                'repeating-linear-gradient(45deg, transparent, transparent 6px, color-mix(in srgb, var(--accent) 8%, transparent) 6px, color-mix(in srgb, var(--accent) 8%, transparent) 12px)',
            }
          : {}),
      }}
    >
      {/* Icon */}
      <div
        className="flex items-center justify-center w-16 h-16 rounded-2xl transition-colors"
        style={{
          backgroundColor: isDragging ? 'var(--accent)' : 'var(--border)',
        }}
      >
        <ArrowUpFromLine
          className="w-7 h-7 transition-colors"
          style={{ color: isDragging ? '#fff' : 'var(--accent)' }}
        />
      </div>

      {/* Text */}
      <div className="text-center space-y-1">
        <p className="font-semibold text-gray-800 dark:text-gray-100">
          {isDragging ? 'Drop to upload' : 'Drop files here or click to browse'}
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">CSV or PDF transaction history</p>
      </div>

      {/* Format chips */}
      <div className="flex items-center gap-2 flex-wrap justify-center">
        {FORMATS.map((f) => (
          <span
            key={f}
            className="text-xs font-medium px-2.5 py-1 rounded-full border"
            style={{
              borderColor: 'var(--border)',
              backgroundColor: 'var(--bg)',
              color: 'inherit',
            }}
          >
            {f}
          </span>
        ))}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".csv,.pdf"
        className="hidden"
        aria-label="Upload CSV or PDF files"
        onChange={handleChange}
      />
    </div>
  )
}
