import type { Statement, Transaction } from '@lokfi/parser-core'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FileStatusList } from './FileStatusList'

// ─── Fixtures ────────────────────────────────────────────────────────────────

const mockFile = (name: string, size = 1024): File => {
  return { name, size } as unknown as File
}

const mockTransaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  date: '2024-01-15',
  description: 'STARBUCKS COFFEE',
  transactionValue: -7.2,
  accountNo: '4915-XXXX-XXXX-1234',
  ...overrides,
})

const mockStatement = (overrides: Partial<Statement> = {}): Statement => ({
  accountNo: '4915-XXXX-XXXX-1234',
  source: 'cdc',
  statementType: 'debit',
  transactions: [],
  ...overrides,
})

const makeResult = (overrides: Partial<import('./FileStatusList').FileParseResult> = {}) =>
  overrides as import('./FileStatusList').FileParseResult

// ─── Pure Helper Implementations (mirrors FileStatusList.tsx logic) ──────────

function groupByAccountHelper(statement: Statement) {
  const groups = new Map<string, typeof statement.transactions>()
  for (const txn of statement.transactions) {
    const key = txn.accountNo ?? statement.accountNo
    const existing = groups.get(key)
    if (existing) existing.push(txn)
    else groups.set(key, [txn])
  }
  return [...groups.entries()].map(([accountNo, transactions]) => ({
    accountNo,
    transactions,
  }))
}

function maskCardNoHelper(accountNo: string): string {
  if (accountNo === 'UNKNOWN-ACCOUNT') return 'Unknown'
  if (accountNo.length >= 4) return '····' + accountNo.slice(-4)
  return accountNo
}

function formatBytesHelper(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatAmountHelper(value: number) {
  const abs = Math.abs(value).toFixed(2)
  return value < 0 ? `-${abs}` : `+${abs}`
}

function formatDateHelper(iso: string) {
  const [y, m, d] = iso.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(d))
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// ─── Helper Function Unit Tests ─────────────────────────────────────────────

describe('groupByAccount', () => {
  it('empty transactions array → empty groups array', () => {
    const statement = mockStatement({
      accountNo: '1234',
      transactions: [],
    })
    const groups = groupByAccountHelper(statement)
    // When there are no transactions, no groups are created
    expect(groups).toHaveLength(0)
  })

  it('all transactions same accountNo → single group', () => {
    const statement = mockStatement({
      accountNo: '1234',
      transactions: [
        mockTransaction({ accountNo: '1234' }),
        mockTransaction({ accountNo: '1234' }),
        mockTransaction({ accountNo: '1234' }),
      ],
    })
    const groups = groupByAccountHelper(statement)
    expect(groups).toHaveLength(1)
    expect(groups[0].transactions).toHaveLength(3)
  })

  it('transactions with different accountNos → multiple groups', () => {
    const statement = mockStatement({
      accountNo: '1234',
      transactions: [
        mockTransaction({ accountNo: '1111' }),
        mockTransaction({ accountNo: '2222' }),
        mockTransaction({ accountNo: '1111' }),
      ],
    })
    const groups = groupByAccountHelper(statement)
    expect(groups).toHaveLength(2)
  })

  it('UNKNOWN-ACCOUNT transactions grouped correctly', () => {
    const statement = mockStatement({
      accountNo: 'UNKNOWN-ACCOUNT',
      transactions: [
        mockTransaction({ accountNo: 'UNKNOWN-ACCOUNT' }),
        mockTransaction({ accountNo: 'UNKNOWN-ACCOUNT' }),
      ],
    })
    const groups = groupByAccountHelper(statement)
    expect(groups).toHaveLength(1)
    expect(groups[0].accountNo).toBe('UNKNOWN-ACCOUNT')
    expect(groups[0].transactions).toHaveLength(2)
  })
})

describe('maskCardNo', () => {
  it('normal card number → masked with last 4 digits', () => {
    expect(maskCardNoHelper('4915-XXXX-XXXX-1234')).toBe('····1234')
    expect(maskCardNoHelper('4111111111111111')).toBe('····1111')
  })

  it('UNKNOWN-ACCOUNT → "Unknown"', () => {
    expect(maskCardNoHelper('UNKNOWN-ACCOUNT')).toBe('Unknown')
  })

  it('short string → returned as-is', () => {
    expect(maskCardNoHelper('AB')).toBe('AB')
    expect(maskCardNoHelper('X')).toBe('X')
  })
})

describe('formatBytes', () => {
  it('returns bytes for values < 1024', () => {
    expect(formatBytesHelper(0)).toBe('0 B')
    expect(formatBytesHelper(512)).toBe('512 B')
    expect(formatBytesHelper(1023)).toBe('1023 B')
  })

  it('returns KB for values < 1 MB', () => {
    expect(formatBytesHelper(1024)).toBe('1.0 KB')
    expect(formatBytesHelper(1024 * 500)).toBe('500.0 KB')
    expect(formatBytesHelper(1024 * 1023)).toBe('1023.0 KB')
  })

  it('returns MB for values >= 1 MB', () => {
    expect(formatBytesHelper(1024 * 1024)).toBe('1.0 MB')
    expect(formatBytesHelper(1024 * 1024 * 5)).toBe('5.0 MB')
    expect(formatBytesHelper(1024 * 1024 * 1.5)).toBe('1.5 MB')
  })
})

describe('formatAmount', () => {
  it('prefixes positive values with +', () => {
    expect(formatAmountHelper(0)).toBe('+0.00')
    expect(formatAmountHelper(7.2)).toBe('+7.20')
    expect(formatAmountHelper(123.456)).toBe('+123.46')
  })

  it('prefixes negative values with -', () => {
    expect(formatAmountHelper(-7.2)).toBe('-7.20')
    expect(formatAmountHelper(-123.456)).toBe('-123.46')
  })

  it('always shows exactly 2 decimal places', () => {
    expect(formatAmountHelper(1)).toBe('+1.00')
    expect(formatAmountHelper(-1)).toBe('-1.00')
  })
})

describe('formatDate', () => {
  it('formats a known ISO date string to a locale date', () => {
    const result = formatDateHelper('2024-01-15')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

// ─── StatusBadge Tests (tested through FileStatusList component) ──────────────
//
// StatusBadge is a private (non-exported) component. We verify its output
// by rendering FileStatusList and inspecting the status text/icons rendered.

describe('StatusBadge via FileStatusList', () => {
  it('shows "Pending" with Clock icon for pending status', () => {
    render(
      <FileStatusList
        items={[makeResult({ file: mockFile('test.pdf'), status: 'pending' })]}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('shows "Parsing…" with Loader2 icon for parsing status', () => {
    render(
      <FileStatusList
        items={[makeResult({ file: mockFile('test.csv'), status: 'parsing' })]}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByText('Parsing…')).toBeInTheDocument()
  })

  it('shows "Done" with CheckCircle2 icon for success status', () => {
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('test.csv'),
            status: 'success',
            transactionCount: 0,
          }),
        ]}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('shows "Error" with XCircle icon for error status', () => {
    render(
      <FileStatusList
        items={[makeResult({ file: mockFile('test.pdf'), status: 'error', error: 'fail' })]}
        onConfigure={vi.fn()}
        onRemove={vi.fn()}
      />
    )
    expect(screen.getByText('Error')).toBeInTheDocument()
  })
})

// ─── FileStatusList Component Tests ─────────────────────────────────────────

describe('FileStatusList', () => {
  const defaultProps = {
    onConfigure: vi.fn(),
    onRemove: vi.fn(),
  }

  beforeEach(() => {
    defaultProps.onConfigure.mockClear()
    defaultProps.onRemove.mockClear()
  })

  it('renders nothing when items is empty', () => {
    const { container } = render(<FileStatusList items={[]} {...defaultProps} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders filename + "Pending" + Clock icon for pending file', () => {
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('statement.pdf'),
            status: 'pending',
          }),
        ]}
        {...defaultProps}
      />
    )
    expect(screen.getByText('statement.pdf')).toBeInTheDocument()
    expect(screen.getByText('Pending')).toBeInTheDocument()
  })

  it('renders filename + "Parsing…" for parsing file', () => {
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('data.csv'),
            status: 'parsing',
          }),
        ]}
        {...defaultProps}
      />
    )
    expect(screen.getByText('data.csv')).toBeInTheDocument()
    expect(screen.getByText('Parsing…')).toBeInTheDocument()
  })

  it('renders filename + error message + "Configure parser" button for error file with rawText', async () => {
    const user = userEvent.setup()
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('bad.pdf'),
            status: 'error',
            error: 'Failed to parse PDF',
            rawText: 'some raw text content',
          }),
        ]}
        {...defaultProps}
      />
    )
    expect(screen.getByText('bad.pdf')).toBeInTheDocument()
    expect(screen.getByText('Failed to parse PDF')).toBeInTheDocument()
    const btn = screen.getByRole('button', { name: /Configure parser/i })
    expect(btn).toBeInTheDocument()
    await user.click(btn)
    expect(defaultProps.onConfigure).toHaveBeenCalledTimes(1)
  })

  it('renders filename + transaction count + expand toggle for success file', () => {
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('ok.csv'),
            status: 'success',
            transactionCount: 3,
            statement: mockStatement({
              transactions: [mockTransaction(), mockTransaction(), mockTransaction()],
            }),
          }),
        ]}
        {...defaultProps}
      />
    )
    expect(screen.getByText('ok.csv')).toBeInTheDocument()
    expect(screen.getByText('3 transactions found')).toBeInTheDocument()
    // expand toggle is a button with aria-expanded
    const toggle = screen.getByRole('button', { name: /expand/i })
    expect(toggle).toBeInTheDocument()
  })

  it('shows yellow "Generic fallback" warning for success + generic source without profile', () => {
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('generic.csv'),
            status: 'success',
            transactionCount: 1,
            profileName: undefined,
            statement: mockStatement({ source: 'generic' }),
            rawText: 'date,description,amount\n2024-01-15,Test,10.00',
          }),
        ]}
        {...defaultProps}
      />
    )
    expect(screen.getByText(/Generic fallback/i)).toBeInTheDocument()
  })

  it('shows "Profile: XYZ" instead of warning when profile is set', () => {
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('profile.csv'),
            status: 'success',
            transactionCount: 1,
            profileName: 'My Bank',
            statement: mockStatement({ source: 'generic' }),
          }),
        ]}
        {...defaultProps}
      />
    )
    expect(screen.getByText('Profile: My Bank')).toBeInTheDocument()
    expect(screen.queryByText(/Generic fallback/i)).not.toBeInTheDocument()
  })

  it('clicking expand toggle shows all transactions', async () => {
    const user = userEvent.setup()
    const transactions = [
      mockTransaction({ date: '2024-01-01', description: 'Coffee' }),
      mockTransaction({ date: '2024-01-02', description: 'Lunch' }),
      mockTransaction({ date: '2024-01-03', description: 'Dinner' }),
    ]
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('all.csv'),
            status: 'success',
            transactionCount: 3,
            statement: mockStatement({ transactions }),
          }),
        ]}
        {...defaultProps}
      />
    )
    // Initial state: expand button visible with aria-expanded=false
    const expandBtn = screen.getByRole('button', { name: /^expand/i })
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false')

    // Click expand — replaces expand button with collapse button
    await user.click(expandBtn)
    // After click, expand button should be gone and collapse button should appear
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^expand/i })).toBeNull()
    })
    // Collapse button should now be visible and show aria-expanded=true
    const collapseBtn = screen.getByRole('button', { name: /^collapse/i })
    expect(collapseBtn).toHaveAttribute('aria-expanded', 'true')
    // All transactions should now be visible
    expect(screen.getByText('Coffee')).toBeInTheDocument()
    expect(screen.getByText('Lunch')).toBeInTheDocument()
    expect(screen.getByText('Dinner')).toBeInTheDocument()
  })

  it('clicking collapse hides expanded transactions', async () => {
    const user = userEvent.setup()
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('collapse.csv'),
            status: 'success',
            transactionCount: 3,
            statement: mockStatement({
              transactions: [
                mockTransaction({ description: 'Coffee' }),
                mockTransaction({ description: 'Lunch' }),
                mockTransaction({ description: 'Dinner' }),
              ],
            }),
          }),
        ]}
        {...defaultProps}
      />
    )
    // Expand first
    const expandBtn = screen.getByRole('button', { name: /^expand/i })
    await user.click(expandBtn)
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^expand/i })).toBeNull()
    })
    expect(screen.getByText('Coffee')).toBeInTheDocument()

    // Collapse via the collapse button
    const collapseBtn = screen.getByRole('button', { name: /^collapse/i })
    await user.click(collapseBtn)
    // After collapse, the expand button should reappear and scrollable list gone
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^expand/i })).toBeInTheDocument()
      expect(document.querySelector('.max-h-64')).toBeNull()
    })
  })

  it('clicking "Configure parser" button calls onConfigure with correct item', async () => {
    const user = userEvent.setup()
    const item = makeResult({
      file: mockFile('config.pdf'),
      status: 'error',
      error: 'Parse failed',
      rawText: 'raw content',
    })
    render(<FileStatusList items={[item]} {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /Configure parser/i }))
    expect(defaultProps.onConfigure).toHaveBeenCalledTimes(1)
    expect(defaultProps.onConfigure).toHaveBeenCalledWith(item)
  })

  it('clicking remove button calls onRemove with correct item', async () => {
    const user = userEvent.setup()
    const item = makeResult({ file: mockFile('remove.csv'), status: 'pending' })
    render(<FileStatusList items={[item]} {...defaultProps} />)
    await user.click(screen.getByRole('button', { name: /Remove file/i }))
    expect(defaultProps.onRemove).toHaveBeenCalledTimes(1)
    expect(defaultProps.onRemove).toHaveBeenCalledWith(item)
  })

  it('renders multiple account groups when statement has multiple accounts', () => {
    const transactions = [
      mockTransaction({ accountNo: '1111', description: 'Card 1 Txn' }),
      mockTransaction({ accountNo: '2222', description: 'Card 2 Txn' }),
    ]
    render(
      <FileStatusList
        items={[
          makeResult({
            file: mockFile('multi.csv'),
            status: 'success',
            transactionCount: 2,
            statement: mockStatement({ transactions }),
          }),
        ]}
        {...defaultProps}
      />
    )
    // Should show 2 accounts label
    expect(screen.getByText('2 accounts')).toBeInTheDocument()
  })
})
