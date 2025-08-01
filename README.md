# Mira Desktop Application

A modern, cross-platform desktop application for real-time voice interaction using Whisper Live technology.

## Features

- **Modern UI**: Clean, professional interface with intuitive design
- **Real-time Interaction**: Live voice-to-text conversion powered by Whisper
- **Cross-platform**: Compatible with macOS and Windows
- **Visual Feedback**: Animated microphone button with status indicators
- **Live Updates**: Real-time interaction display with timestamps
- **Keyboard Shortcuts**: Space bar to toggle listening

## Screenshots

### Application Interface
![Mira Desktop Interface](https://github.com/user-attachments/assets/bbdf4975-3426-424d-a5c2-9dc7c761842a)

### Live Interaction in Action
![Live Interaction](https://github.com/user-attachments/assets/bf3d7c65-eac4-40ea-931b-69f4e6f57fba)

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Python 3.8+ with Mira backend running

### Setup
1. Navigate to the desktop app directory:
   ```bash
   cd apps/desktop-client
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

## Usage

1. **Start Backend**: Ensure the Mira backend server is running on `http://localhost:8000`
2. **Launch App**: Run `npm start` to open the desktop application
3. **Connect**: The app will automatically attempt to connect to the backend
4. **Start Listening**: Click the large circular microphone button to begin interaction
5. **View Interactions**: Live interactions will appear in the right panel
6. **Stop Listening**: Click the button again (now red with stop icon) to stop

## Keyboard Shortcuts

- **Space Bar**: Toggle listening on/off
- **Cmd/Ctrl + Q**: Quit application

## UI Components

### Main Interface
- **Header**: App title, version, and connection status
- **Microphone Button**: Large circular button in center with visual feedback
- **Status Indicator**: Shows connection and listening status
- **Interaction Panel**: Right-side panel showing live interactions
- **Connection Banner**: Warning banner when backend is unavailable

### Button States
- **Disabled**: Gray button when disconnected
- **Ready**: Blue gradient when connected and ready
- **Listening**: Red gradient with pulsing animation and ripple effect

## Configuration

The application connects to the backend at `http://localhost:8000` by default. You can modify this in `renderer.js`:

```javascript
this.baseUrl = 'http://localhost:8000';
```

## Building for Distribution

### macOS
```bash
npm run build-mac
```

### Windows
```bash
npm run build-win
```

### All Platforms
```bash
npm run build
```

Built applications will be available in the `dist/` directory.

## Development

### File Structure
```
apps/desktop-client/
├── main.js          # Electron main process
├── preload.js       # Secure IPC bridge
├── index.html       # Application UI
├── style.css        # Styling and animations
├── renderer.js      # Frontend logic
├── start-script.js  # Platform-aware launcher script
├── package.json     # Project configuration
└── assets/          # Icons and resources
```

### Development Mode
```bash
npm run start-dev
```

This runs the application with development tools enabled.

### Testing

The application includes a comprehensive test suite with 67 tests across 5 test files:

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode for development
npm run test:watch
```

**Note**: Tests are designed to work independently of the backend service. All HTTP requests are mocked, so tests pass even when the backend is unavailable or in development.

Test coverage includes:
- Configuration constants validation
- Data model classes (Person, Interaction, Conversation, Action)
- API service functionality with mocked HTTP requests
- Integration testing of component interactions
- Utility functions and core logic

For detailed test documentation, see `tests/README.md`.

## Architecture

The desktop application is built using:
- **Electron**: Cross-platform desktop framework
- **Modern Web Technologies**: HTML5, CSS3, ES6+ JavaScript
- **Professional Design**: Google Fonts, Font Awesome icons
- **Responsive Layout**: Adaptive design for different screen sizes

The app communicates with the existing Python backend via HTTP APIs, maintaining separation of concerns and reusing existing interaction functionality.

## Troubleshooting

### Common Issues

1. **Cannot connect to backend**
   - Ensure the backend server is running on port 8000
   - Check firewall settings
   - Verify the backend URL in configuration

2. **Microphone not working**
   - Grant microphone permissions to the application
   - Check system audio settings
   - Restart the application

3. **Application won't start**
   - Ensure Node.js is installed and updated
   - Run `npm install` to install dependencies
   - Check for port conflicts

4. **macOS SetApplicationIsDaemon Error**
   - This is a harmless warning that has been resolved in v2.3.1+
   - The app uses platform-aware launching to avoid unnecessary sandbox flags on macOS

### Platform-Specific Notes

- **macOS**: No special configuration needed, sandbox is enabled by default for security
- **Windows**: Runs with standard Electron security settings
- **Linux/Docker**: Automatically uses `--no-sandbox` flag when detected in container environments

### Logs
Application logs are available in the developer console (Cmd/Ctrl + Shift + I).