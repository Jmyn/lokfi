import { Link } from '@tanstack/react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { aiCredentials } from '../../lib/ai/credentials'
import { aiProvider } from '../../lib/ai/provider'

type Action = 'save' | 'test' | 'remove'

const buttonClass =
  'rounded-md border px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-200 disabled:opacity-40'

const helpLinkClass = 'font-medium text-amber-800 underline underline-offset-2 dark:text-amber-300'

export function AiProvidersSettingsPage() {
  const hasKey = useLiveQuery(() => aiCredentials.hasCredentials(aiProvider.id), [])
  const [apiKey, setApiKey] = useState('')
  const [pending, setPending] = useState<Action | null>(null)
  const [status, setStatus] = useState<{ message: string; error?: boolean } | null>(null)
  const ready = hasKey !== undefined && !pending

  async function perform(action: Action) {
    setPending(action)
    setStatus(null)
    try {
      if (action === 'save') {
        const key = apiKey.trim()
        if (!key) return
        await aiCredentials.store(aiProvider.id, { apiKey: key })
        setApiKey('')
        setStatus({ message: 'API key saved.' })
      } else if (action === 'test') {
        const key = apiKey.trim() || (await aiCredentials.retrieve(aiProvider.id))?.apiKey
        if (!key) throw new Error('Enter an API key to test the connection.')
        const provider = aiProvider.create(key)
        const result = await provider.suggestCategories(
          [
            {
              id: 'connection-test',
              description: 'GROCERY STORE',
              source: 'example',
              direction: 'debit',
            },
          ],
          {
            categories: [
              { id: 'groceries', name: 'Groceries', isIncome: false },
              { id: 'transport', name: 'Transport', isIncome: false },
            ],
            rules: [],
          },
          new AbortController().signal
        )
        const decision = result.get('connection-test')
        if (decision?.type !== 'category' || decision.categoryId !== 'groceries')
          throw new Error('OpenAI responded but could not classify the test transaction.')
        setStatus({ message: 'OpenAI Decisions connection verified.' })
      } else {
        await aiCredentials.remove(aiProvider.id)
        setApiKey('')
        setStatus({ message: 'API key removed.' })
      }
    } catch (error) {
      setStatus({ message: error instanceof Error ? error.message : 'The request failed. Try again.', error: true })
    } finally {
      setPending(null)
    }
  }

  return (
    <main className="mx-auto max-w-xl px-5 py-8 text-gray-900 dark:text-white">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-serif text-2xl">AI Providers</h1>
        <Link to="/transactions" className="text-sm font-medium" style={{ color: 'var(--accent)' }}>
          Back to Transactions
        </Link>
      </div>
      <section
        className="space-y-4 rounded-xl border p-5"
        style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-sidebar)' }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-serif text-lg">OpenAI</h2>
          <span className="text-xs text-gray-600 dark:text-gray-400">
            {hasKey === undefined ? 'Checking settings…' : hasKey ? 'Key saved' : 'Setup required'}
          </span>
        </div>
        <div
          className="space-y-2 rounded-lg border p-3.5 text-sm text-gray-700 dark:text-gray-300"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg)' }}
        >
          <h3 className="font-semibold text-gray-900 dark:text-white">Set up an OpenAI API key</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Open{' '}
              <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer" className={helpLinkClass}>
                OpenAI API Keys
              </a>{' '}
              and select <strong>Create new secret key</strong>.
            </li>
            <li>
              Copy the key, paste it below, then choose <strong>Save key</strong> and <strong>Test connection</strong>.
            </li>
          </ol>
          <p>
            API billing is separate from ChatGPT. Eligible Pro and Business users can{' '}
            <a
              href="https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions"
              target="_blank"
              rel="noreferrer"
              className={helpLinkClass}
            >
              claim API credits
            </a>
            .
          </p>
          <a
            href="https://help.openai.com/en/articles/4936850-where-do-i-find-my-openai-api-key"
            target="_blank"
            rel="noreferrer"
            className={helpLinkClass}
          >
            OpenAI’s API key guide
          </a>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Lokfi stores your key encrypted in this browser. When you run AI suggestions, your browser sends the filtered
          statement descriptions, source, direction, categories, and rule context directly to OpenAI. Source account
          numbers are masked.
        </p>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void perform('save')
          }}
        >
          <div className="space-y-1.5">
            <label htmlFor="openai-api-key" className="block text-sm font-medium">
              OpenAI API key
            </label>
            <input
              id="openai-api-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              disabled={!ready}
              placeholder={hasKey ? 'Enter a new key to replace it' : 'Enter your OpenAI API key'}
              className="w-full rounded-md border bg-white px-3 py-2 text-sm dark:bg-gray-900"
              style={{ borderColor: 'var(--border)' }}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={!ready || !apiKey.trim()}
              className="rounded-md bg-amber-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
            >
              {pending === 'save' ? 'Saving…' : 'Save key'}
            </button>
            <button
              type="button"
              disabled={!ready || (!hasKey && !apiKey.trim())}
              onClick={() => void perform('test')}
              className={buttonClass}
              style={{ borderColor: 'var(--border)' }}
            >
              {pending === 'test' ? 'Testing…' : 'Test connection'}
            </button>
            {hasKey && (
              <button
                type="button"
                disabled={!ready}
                onClick={() => void perform('remove')}
                className={buttonClass}
                style={{ borderColor: 'var(--border)' }}
              >
                {pending === 'remove' ? 'Removing…' : 'Remove key'}
              </button>
            )}
          </div>
        </form>
        {status && (
          <p
            role={status.error ? 'alert' : 'status'}
            className={
              status.error ? 'text-sm text-red-700 dark:text-red-300' : 'text-sm text-emerald-700 dark:text-emerald-300'
            }
          >
            {status.message}
          </p>
        )}
      </section>
    </main>
  )
}
