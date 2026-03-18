import { ThemeProvider } from 'next-themes'

function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 p-8">
        <h1 className="text-2xl font-bold">Lokfi</h1>
        <p className="mt-2 text-gray-500">Shell — Phase 2G wires up routing.</p>
      </div>
    </ThemeProvider>
  )
}

export default App
