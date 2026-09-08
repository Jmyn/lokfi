import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPortfolioExport } from '../../lib/investments/exportPortfolio'
import { ExportPortfolioButton } from './ExportPortfolioButton'

vi.mock('../../lib/db/db', () => ({ db: {} }))
vi.mock('../../lib/investments/exportPortfolio', () => ({ createPortfolioExport: vi.fn() }))

describe('ExportPortfolioButton', () => {
  const createObjectURL = vi.fn((_blob: Blob) => 'blob:portfolio')
  const revokeObjectURL = vi.fn()
  let download: { filename: string; href: string } | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    download = undefined
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      download = { filename: this.download, href: this.href }
    })
    vi.mocked(createPortfolioExport).mockResolvedValue({
      filename: 'lokfi-portfolio-2026-09-08.txt',
      text: 'LOKFI PORTFOLIO\n',
    })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('downloads a text file only after an explicit click and releases the blob URL', async () => {
    render(<ExportPortfolioButton syncing={false} />)
    expect(createPortfolioExport).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Export portfolio' }))
    await act(() => vi.advanceTimersByTimeAsync(0))
    expect(download).toEqual({ filename: 'lokfi-portfolio-2026-09-08.txt', href: 'blob:portfolio' })
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob)
    expect((createObjectURL.mock.calls[0][0] as Blob).type).toBe('text/plain;charset=utf-8')
    expect(document.querySelector('a[download]')).toBeNull()
    await vi.advanceTimersByTimeAsync(1000)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:portfolio')
  })

  it('disables export while a broker sync or export is running', async () => {
    const { rerender } = render(<ExportPortfolioButton syncing />)
    const button = screen.getByRole('button', { name: 'Export portfolio' })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(createPortfolioExport).not.toHaveBeenCalled()
    rerender(<ExportPortfolioButton syncing={false} />)
    vi.mocked(createPortfolioExport).mockReturnValue(new Promise(() => {}))
    fireEvent.click(button)
    expect(screen.getByRole('button', { name: 'Exporting...' })).toBeDisabled()
  })

  it('shows a safe error and allows retry if local export fails', async () => {
    vi.mocked(createPortfolioExport).mockRejectedValueOnce(new Error('internal sensitive details'))
    render(<ExportPortfolioButton syncing={false} />)
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export portfolio' })))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not export your portfolio. Please try again.')
    expect(screen.queryByText('internal sensitive details')).toBeNull()
    expect(createObjectURL).not.toHaveBeenCalled()
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Export portfolio' })))
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
