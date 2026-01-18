# Full SEO Page Analyzer

A Chrome extension for analyzing on-page SEO factors including meta tags, headings, links, images, schema markup, Core Web Vitals, and more.

## Features

- **Meta & Content Analysis**: Title, description, canonical URL, robots meta, word count
- **Heading Structure**: Hierarchy visualization with skip-level warnings
- **Schema Markup**: JSON-LD detection and validation
- **Link Analysis**: Internal/external link breakdown with crawl status checking
- **Image Analysis**: Alt text auditing
- **Social Metadata**: Open Graph and Twitter Card validation
- **Core Web Vitals**: Real-time LCP, FID, and CLS monitoring
- **HTTP Response**: Status codes and redirect chain tracking
- **PageSpeed Insights**: Integrated PSI API diagnostics
- **External Tools**: Quick links to PageSpeed, Rich Results Test, Semrush, Whois

## Installation

### From Source (Developer Mode)

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top right)
4. Click "Load unpacked"
5. Select the extension directory

### API Key Setup

For PageSpeed Insights integration:
1. Get a Google API key from [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the PageSpeed Insights API
3. Click the extension icon → Options → Enter your API key

## Project Structure

```
├── manifest.json      # Extension configuration (Manifest V3)
├── background.js      # Service worker for request tracking & crawling
├── content.js         # Page analysis & Core Web Vitals observation
├── popup.html         # Main extension UI
├── popup.js           # UI logic & data display
├── options.html       # API key configuration page
├── options.js         # Options page logic
├── about.html         # Developer info page
└── images/            # Extension icons
```

## Permissions

- `activeTab`: Access current tab for analysis
- `scripting`: Inject content script
- `webNavigation`: Track page navigation
- `webRequest`: Monitor HTTP responses
- `storage`: Save API keys and settings
- `alarms`: Periodic cleanup tasks

## Development

### Requirements
- Chrome 88+ (Manifest V3 support)

### Testing
Load the extension in developer mode and test on various websites.

## License

MIT
