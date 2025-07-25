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

## Data Export/Import

Pocket Ding supports exporting and importing your local reading progress and app settings. This allows you to backup your data, migrate between devices, or reset your local data without losing reading progress.

### What Gets Exported

The export includes your **local-only data** that is not stored on the Linkding server:

- **Reading Progress**: Reading percentage, scroll position, last read timestamps, reading mode preferences, and dark mode overrides for each bookmark
- **App Settings**: Sync interval, auto-sync preferences, default reading mode, and theme preferences (excludes server credentials)
- **Sync Metadata**: Last sync timestamp for maintaining sync consistency

**Note**: The export does not include your bookmarks (which are stored on your Linkding server) or cached website content (which can be re-downloaded).

### Using Export/Import

1. Go to **Settings** in the app
2. Scroll to the **Data Management** section
3. Click **Export Data** to download a JSON file with your local data
4. Click **Import Data** to upload and import a previously exported JSON file

### Export File Format

The export file is a JSON document with the following structure:

```json
{
  "version": "1.0",
  "export_timestamp": "2025-01-15T10:30:00.000Z",
  "reading_progress": [
    {
      "bookmark_id": 123,
      "progress": 0.75,
      "last_read_at": "2025-01-15T09:45:00.000Z",
      "reading_mode": "readability",
      "scroll_position": 1500,
      "dark_mode_override": "dark"
    }
  ],
  "app_settings": {
    "sync_interval": 60,
    "auto_sync": true,
    "reading_mode": "readability",
    "theme_mode": "system"
  },
  "sync_metadata": {
    "last_sync_timestamp": "2025-01-15T10:00:00.000Z"
  }
}
```

#### Field Descriptions

- **version**: Schema version for compatibility checking
- **export_timestamp**: When the export was created (ISO 8601 format)
- **reading_progress**: Array of reading progress records
  - **bookmark_id**: ID of the bookmark from Linkding server
  - **progress**: Reading progress as a decimal (0.0 to 1.0)
  - **last_read_at**: Timestamp when reading progress was last updated
  - **reading_mode**: "original" or "readability"
  - **scroll_position**: Vertical scroll position in pixels
  - **dark_mode_override**: "light", "dark", or null for per-bookmark theme override
- **app_settings**: Application preferences (server credentials excluded)
  - **sync_interval**: Sync frequency in minutes
  - **auto_sync**: Boolean for automatic sync
  - **reading_mode**: Default reading mode ("original" or "readability")
  - **theme_mode**: Global theme preference ("light", "dark", or "system")
- **sync_metadata**: Synchronization state
  - **last_sync_timestamp**: Last successful sync with Linkding server

### Import Behavior

When importing data:

- **Reading Progress**: Only imported if the import timestamp is newer than existing data for that bookmark
- **Orphaned Progress**: Reading progress for non-existent bookmarks is skipped
- **App Settings**: Merged with existing settings (server credentials are preserved)
- **Sync Metadata**: Updated if present in import

This ensures that importing old data won't overwrite newer reading progress and that your server configuration remains intact.

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