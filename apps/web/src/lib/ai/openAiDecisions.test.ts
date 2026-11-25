import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiCategorisationContext, AiTransactionInput } from './categorisationProvider'
import { OpenAiDecisions } from './openAiDecisions'

const rows: AiTransactionInput[] = [
  {
    id: 'row-0',
    description: 'PAYMENT BY INTERNET',
    source: 'ocbc',
    direction: 'credit',
    matchedRuleCategoryId: 'cat_transfer',
  },
  { id: 'row-1', description: 'GRAB RIDE', source: 'ocbc', direction: 'debit' },
  { id: 'row-2', description: 'PAYNOW', source: 'ocbc', direction: 'credit' },
]
const context: AiCategorisationContext = {
  categories: [
    { id: 'cat_transfer', name: 'Transfers', isIncome: false },
    { id: 'cat_transport', name: 'Transport', isIncome: false },
  ],
  rules: [],
}

afterEach(() => vi.unstubAllGlobals())

describe('OpenAiDecisions', () => {
  it('offers only existing categories and keeps the confidence score when supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        answers: [
          {
            type: 'choice',
            name: 'row-1',
            choice: 'c1',
            confidence: 0.62,
            probabilities: [{ value: 'c1', probability: 0.8 }],
          },
          { type: 'refusal', name: 'row-2' },
          { type: 'choice', name: 'row-0', choice: 'c0' },
        ],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await new OpenAiDecisions('test-key').suggestCategories(rows, context, new AbortController().signal)

    expect(result.get('row-0')).toEqual({ type: 'category', categoryId: 'cat_transfer' })
    expect(result.get('row-1')).toEqual({ type: 'category', categoryId: 'cat_transport', confidence: 0.62 })
    expect(result.get('row-2')).toEqual({ type: 'unavailable' })
    const [url, request] = fetchMock.mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/decisions')
    const { input, questions } = JSON.parse(request.body)
    expect(input[1].content[0].data.transactions[0]).toEqual({
      id: 'row-0',
      description: 'PAYMENT BY INTERNET',
      source: 'ocbc',
      direction: 'credit',
      matchedRuleChoice: 'c0',
    })
    expect(questions.map(({ choices }: { choices: { value: string }[] }) => choices)).toEqual(
      rows.map(() => [{ value: 'c0' }, { value: 'c1' }])
    )
  })

  it('requires two user categories before making a request', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const singleCategory = { ...context, categories: context.categories.slice(0, 1) }

    await expect(
      new OpenAiDecisions('test-key').suggestCategories(rows, singleCategory, new AbortController().signal)
    ).rejects.toThrow('OpenAI suggestions require between 2 and 255 categories.')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an incomplete response so the batch can be retried', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ answers: [{ type: 'choice', name: 'row-0', choice: 'c0' }] }),
      })
    )

    await expect(
      new OpenAiDecisions('test-key').suggestCategories(rows, context, new AbortController().signal)
    ).rejects.toThrow('OpenAI returned an incomplete result.')
  })

  it('compacts rule-heavy context and publishes batches sized by UTF-8 bytes', async () => {
    const batches: string[][] = []
    const fetchMock = vi.fn((_url: string, { body }: { body: string }) => {
      const { input, questions } = JSON.parse(body)
      const data = input[1].content[0].data
      expect(new TextEncoder().encode(JSON.stringify(data)).length).toBeLessThanOrEqual(256 * 1024)
      const countValues = (value: unknown): number =>
        value && typeof value === 'object'
          ? 1 + Object.values(value).reduce<number>((count, entry) => count + countValues(entry), 0)
          : 1
      expect(countValues(data)).toBeLessThanOrEqual(10_000)
      expect(data.rules.length).toBeLessThan(2000)
      expect(data.rules[0].conditions[0].value).toBe('Merchant 0')
      return Promise.resolve({
        ok: true,
        json: async () => ({
          answers: questions.map(({ name }: { name: string }) => ({ type: 'choice', name, choice: 'c0' })),
        }),
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    const ruleHeavyContext: AiCategorisationContext = {
      ...context,
      rules: Array.from({ length: 2000 }, (_, i) => ({
        categoryId: 'cat_transfer',
        conditions: [{ field: 'description', operation: 'contains', value: `Merchant ${i}` }],
      })),
    }
    const longRows = Array.from({ length: 45 }, (_, i) => ({
      ...rows[0]!,
      id: `long-${i}`,
      description: '你好'.repeat(1500),
    }))
    const results = await new OpenAiDecisions('test-key').suggestCategories(
      longRows,
      ruleHeavyContext,
      new AbortController().signal,
      (batch) => batches.push([...batch.keys()])
    )

    expect(fetchMock.mock.calls.length).toBeGreaterThan(1)
    expect(batches.flat()).toEqual(longRows.map(({ id }) => id))
    expect(results.size).toBe(longRows.length)
  })

  it('marks a single oversized description unavailable and continues with subsequent rows', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ answers: [{ type: 'choice', name: 'row-1', choice: 'c1' }] }),
    })
    vi.stubGlobal('fetch', fetchMock)
    const results = await new OpenAiDecisions('test-key').suggestCategories(
      [{ ...rows[0]!, description: '你'.repeat(100_000) }, rows[1]!],
      context,
      new AbortController().signal
    )
    expect(results.get('row-0')).toEqual({ type: 'unavailable', reason: 'input-too-large' })
    expect(results.get('row-1')).toMatchObject({ type: 'category', categoryId: 'cat_transport' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts the active request when the user turns suggestions off', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, { signal }: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          })
      )
    )

    const controller = new AbortController()
    const result = new OpenAiDecisions('test-key').suggestCategories(rows, context, controller.signal)
    controller.abort(new Error('Cancelled'))

    await expect(result).rejects.toThrow('Cancelled')
  })
})
