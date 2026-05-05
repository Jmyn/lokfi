# FAQ

## General

### What is Lokfi?

Lokfi is a privacy-first, local-first personal finance tracker. It parses bank statements (PDF/CSV) and syncs brokerage data entirely in your browser. Your data never leaves your device.

### Is Lokfi free?

The web app is free and open-source (MIT license). A pre-built desktop version may be available for purchase in the future — but the open-source version will always remain free.

### Do I need an account?

No. Lokfi has no accounts, no sign-up, and no login. Your data lives entirely in your browser.

## Data & Privacy

### Where is my data stored?

All data is stored in your browser's IndexedDB. There are no servers, no cloud storage, no third-party databases. See [Privacy & Security](./privacy) for details.

### Can I export my data?

Yes. Go to **Profile → Settings** and use the Export option to download all your data as JSON.

### What happens if I clear my browser cache?

All Lokfi data stored in IndexedDB will be deleted. Always export a backup before clearing browser data.

## Importing

### Which banks are supported?

See the [Supported Banks](../reference/supported-banks) page for the full list. Support is primarily for Singapore banks, with more being added.

### Why does my PDF import have garbled text?

PDF parsing uses text extraction (not OCR), but the quality depends on how the bank generates the PDF. Some banks produce machine-readable text, others embed text as paths or images. Try exporting CSV instead.

### Can I delete imported data?

Yes. You can delete individual transactions from the Transactions page, or clear all data from Profile settings.

## Features

### How does the rule engine work?

The rule engine matches transaction descriptions against patterns you define. When a match is found, the transaction is automatically categorized. Manual category overrides are always respected. See [Categories & Rules](./categories-and-rules).

### Can I create custom categories?

Yes. You can add, edit, and delete categories in the app settings.

### Does Lokfi support multiple currencies?

Yes. Lokfi supports 10+ currencies and converts between them using live exchange rates from the Frankfurter API. All conversions happen locally.

## Technical

### What browser do I need?

Lokfi works in any modern browser (Chrome, Firefox, Safari, Edge) that supports IndexedDB and Web Workers.

### Can I run Lokfi on my phone?

The web app works on mobile browsers, but the interface is optimized for desktop use. A mobile-optimized version may come in the future.

### Is Lokfi open-source?

Yes. The entire codebase is [MIT licensed](https://github.com/jmyn/lokfi/blob/main/LICENSE) on [GitHub](https://github.com/jmyn/lokfi).

### How can I contribute?

Open issues, submit pull requests, or sponsor the project on [GitHub Sponsors](https://github.com/sponsors/jmyn).

## Troubleshooting

### The app isn't loading

Try clearing your browser cache and reloading. If the issue persists, check that your browser supports IndexedDB and is up to date.

### A transaction is missing

Check your filters — they may be hiding the transaction. Also check the Import page to confirm the file was imported successfully.

### My brokerage sync failed

Verify your API credentials in **Settings → Brokerage**. Some broker APIs have rate limits or require periodic re-authorization.

### I found a bug

Open an issue on [GitHub](https://github.com/jmyn/lokfi/issues) with details about the bug and steps to reproduce.
