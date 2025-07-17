# Pocket Ding

A Progressive Web App (PWA) that provides an enhanced offline reading experience for your [Linkding](https://github.com/sissbruecker/linkding) bookmarks. Read your saved articles with improved readability, track your progress, and sync seamlessly with your Linkding server.

## Try It Online

You can try Pocket Ding without installation at: **[https://garyp.github.io/pocket-ding/](https://garyp.github.io/pocket-ding/)**

Use the demo mode (see instructions below) to explore the app with sample data, or connect to your own Linkding server.

## Features

- **Offline Reading**: Download and cache article content for reading without an internet connection
- **Enhanced Readability**: Clean, distraction-free reading experience using Mozilla Readability
- **Reading Progress**: Track your reading progress with scroll position and completion percentage
- **Dual Reading Modes**: Switch between original HTML and enhanced readability view
- **Auto Sync**: Automatically sync bookmarks from your Linkding server in the background
- **Progressive Web App**: Install on your device and use like a native app
- **Responsive Design**: Optimized for both desktop and mobile devices

## Getting Started

### Prerequisites

- Node.js 22.0.0 or higher
- A running [Linkding](https://github.sissbruecker/linkding) instance
- Linkding API token

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd pocket-ding
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

### First Time Setup

1. When you first open the app, you'll see a welcome screen
2. Click "Configure Settings" to set up your Linkding connection
3. Enter your Linkding server URL (e.g., `https://your-linkding-server.com`)
4. Enter your API token (get this from your Linkding user settings)
5. Test the connection to ensure everything works
6. Save settings to start syncing your bookmarks

### Demo Mode

For testing and demonstration purposes, you can use the app without setting up a real Linkding server:

1. Enter `https://linkding.example.com` as your server URL
2. Enter any value for the API token (it will be ignored)
3. The app will load with mock bookmark data containing Lorem Ipsum text
4. All features will work normally, but no real data will be synced

## Usage

### Reading Bookmarks

- Browse your synced bookmarks in the main list
- Filter by "All" or "Unread" bookmarks
- Click on any bookmark to open it in the reader
- Use the "Reader" mode for clean, distraction-free reading
- Switch to "Original" mode to view the page as intended by the author

### Reading Progress

- Your reading progress is automatically tracked as you scroll
- Resume reading from where you left off
- Progress is saved locally and syncs across your reading sessions

### Sync Management

- Bookmarks sync automatically based on your configured interval
- Manually trigger sync using the sync button in the bookmark list
- New bookmarks and updates from Linkding are downloaded automatically
- Article content is fetched and cached for offline reading

## Development

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm test` - Run all tests
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only
- `npm run test:watch` - Run tests in watch mode

### Development Configuration

To configure the development proxy for your Linkding instance, set the `LINKDING_URL` environment variable:

```bash
LINKDING_URL=https://your-linkding-instance.com npm run dev
```

This will proxy API requests to your Linkding server during development to avoid CORS issues.

### Technology Stack

- **Frontend**: Lit (Web Components), TypeScript
- **Build Tool**: Vite
- **UI Components**: Shoelace Design System
- **Database**: Dexie (IndexedDB)
- **Content Processing**: Mozilla Readability
- **Testing**: Vitest with Happy DOM
- **PWA**: Vite PWA Plugin with Workbox

### Project Structure

```
src/
├── components/          # Lit web components
│   ├── app-root.ts     # Main application shell
│   ├── bookmark-list.ts # Bookmark listing and filtering
│   ├── bookmark-reader.ts # Reading interface
│   └── settings-panel.ts # Settings configuration
├── services/           # Core application services
│   ├── linkding-api.ts # Linkding API client
│   ├── database.ts     # Local database operations
│   ├── sync-service.ts # Bookmark synchronization
│   └── content-fetcher.ts # Article content processing
├── types/              # TypeScript type definitions
└── test/              # Test files
```

## Configuration

The app stores settings locally in IndexedDB:

- **Server URL**: Your Linkding instance URL
- **API Token**: Authentication token for API access
- **Sync Interval**: How often to check for new bookmarks (minutes)
- **Auto Sync**: Whether to sync automatically
- **Reading Mode**: Default reading mode preference

## Browser Support

Pocket Ding works on all modern browsers that support:
- Web Components
- IndexedDB
- Service Workers
- ES2020+ JavaScript features

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

- [Linkding](https://github.com/sissbruecker/linkding) - The excellent bookmark manager this app is built for
- [Mozilla Readability](https://github.com/mozilla/readability) - For content extraction and readability enhancement
- [Shoelace](https://shoelace.style/) - For the beautiful UI components
- [Lit](https://lit.dev/) - For the lightweight web components framework