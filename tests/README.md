# Mira Desktop Client Tests

This test suite provides comprehensive testing for the Mira Desktop Client application using Jest.

## Test Structure

The test suite consists of 5 test files covering different aspects of the application:

### 1. `constants.test.js`
Tests the configuration constants including:
- API configuration (endpoints, timeouts, retry settings)
- Audio configuration (VAD thresholds, optimization settings)
- UI configuration (opacity, messages, colors)
- Error messages and debug configuration

### 2. `models.test.js`
Tests the data model classes:
- `Person` - Speaker recognition and management
- `Interaction` - Conversation interactions with validation
- `Conversation` - Discussion session management
- `Action` - User action tracking
- `ApiResponse` - API response wrapper

### 3. `api.test.js`
Tests the API service functionality:
- Connection management and health checking
- Client registration and deregistration
- API method calls (getInteraction, registerClient, etc.)
- Request handling with timeouts and error recovery
- Event system for connection and interaction updates

### 4. `integration.test.js`
Integration tests for component interactions:
- Event-driven architecture testing
- API service and models integration
- Configuration consistency validation
- Error recovery and resilience
- Complete workflow testing (transcription, stop listening)

### 5. `renderer.test.js`
Core utility function tests:
- Timestamp formatting and text processing
- Audio processing utilities (SNR calculation, quality thresholds)
- Data validation functions
- Error handling and state management

## Backend Independence

**Important**: All tests are designed to work independently of the backend service. The tests use mocked HTTP requests and do not require the backend to be running. This ensures that:

1. Tests pass even when the backend is in development or unavailable
2. CI/CD pipeline doesn't fail due to backend issues
3. Frontend development can proceed independently
4. Tests run quickly without network dependencies

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- --testPathPatterns=constants.test.js

# Run specific test pattern
npm test -- --testNamePattern="API"
```

## Test Coverage

The test suite covers:
- **Configuration**: All constants and settings validation
- **Data Models**: Object creation, validation, and conversion
- **API Service**: HTTP requests, connection management, event system
- **Integration**: Component interactions and workflows
- **Utilities**: Core functionality and helper functions

Total: **67 tests** across **5 test suites**

## Mock Strategy

The tests use comprehensive mocking to simulate:
- HTTP requests using `fetch` mock
- Backend API responses
- Network errors and timeouts
- Connection state changes
- Audio processing workflows

This approach ensures reliable, fast tests that don't depend on external services while still providing meaningful validation of the application's functionality.