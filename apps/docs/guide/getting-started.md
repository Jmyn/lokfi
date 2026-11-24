# Getting Started

Lokfi runs in your browser without an installation or a Lokfi account. Statement parsing and data storage happen on your device.

## Using the Web App

1. Go to **[lokfi.app](https://lokfi.app)**
2. You'll land on the welcome page — click **Get Started** to enter the app
3. That's it. You're ready to import your first statement.

No sign-up, no email, no password. Your data lives in your browser's IndexedDB storage.

## Running Locally (Developers)

If you prefer to run your own instance:

```bash
# Clone the repo
git clone https://github.com/jmyn/lokfi.git
cd lokfi

# Install dependencies
pnpm install

# Start the dev server
pnpm dev
```

The app will be available at `http://localhost:5173`.

## How It Works

Lokfi is a **local-first** application:

1. **Import** — Upload bank statements (PDF or CSV) or brokerage data via API
2. **Parse** — Your browser extracts transactions locally using a Web Worker
3. **Categorize** — The rule engine automatically assigns categories to each transaction
4. **Explore** — View your finances dashboard, transactions table, and investment portfolio

Core processing happens on your machine. [Optional AI suggestions](./privacy#local-first-architecture) send context for all matching statement transactions directly to OpenAI.

## Next Steps

- [Import your first statement](./importing-data)
- [Learn about categories and rules](./categories-and-rules)
- [Explore the finances dashboard](./finances)
- [Set up brokerage sync for investments](./investments)
