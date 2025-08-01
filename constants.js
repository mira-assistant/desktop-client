/**
 * Constants for Mira Desktop Application
 */

// API Configuration
export const API_CONFIG = {
    BASE_URLS: new Map([
        ["localhost", 'http://localhost:8000'],
        ["ankurs-macbook-air", 'http://100.75.140.79:8000']
    ]),
    CLIENT_ID: 'Mira Desktop App',
    TIMEOUTS: {
        DEFAULT_REQUEST: 10000, // 10 seconds
        VAD_LIBRARY_LOAD: 15000, // 15 seconds
        BACKEND_STOP_REQUEST: 10000, // 10 seconds
    },
    RETRY_CONFIG: {
        MAX_RETRIES: 2,
        BACKOFF_DELAY: 1000, // 1 second
    }
};

// Audio Configuration
export const AUDIO_CONFIG = {
    VAD_THRESHOLDS: {
        POSITIVE_SPEECH: 0.35, // Increased for better noise rejection
        NEGATIVE_SPEECH: 0.15, // Balanced for clean cutoff
        SILENCE_MS: 420, // More responsive detection
    },
    OPTIMIZATION: {
        NOISE_FLOOR: -40, // dB
        SIGNAL_THRESHOLD: -20, // dB
        TARGET_RMS: 0.15, // Optimal for transcription
        MIN_SNR_DB: -20, // Minimum SNR threshold
    },
    CONSTRAINTS: {
        SAMPLE_RATE: 16000,
        CHANNELS: 1,
        LATENCY: 0.01, // Low latency for real-time processing
        ECHO_CANCELLATION: true,
        NOISE_SUPPRESSION: true,
        AUTO_GAIN_CONTROL: true,
    },
    PROCESSING: {
        FRAME_SIZE: 512,
        WINDOW_SIZE: 1024,
        OVERLAP_FACTOR: 0.5,
    }
};

// UI Configuration
export const UI_CONFIG = {
    OPACITY: {
        DISABLED: '0.7',
        ENABLED: '1.0',
    },
    MESSAGES: {
        FADE_DURATION: 3000, // 3 seconds
    },
    COLORS: {
        SUCCESS: '#28a745',
        ERROR: '#dc3545',
        WARNING: '#ffc107',
        INFO: '#17a2b8',
    }
};

// Debug Configuration
export const DEBUG_CONFIG = {
    LOG_LEVELS: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
    },
    PERFORMANCE: {
        AUDIO_STATS_INTERVAL: 5000, // 5 seconds
        MEMORY_CHECK_INTERVAL: 10000, // 10 seconds
    }
};

// API Endpoints
export const API_ENDPOINTS = {
    HEALTH_CHECK: '/',
    CLIENT_REGISTER: '/service/client/register',
    CLIENT_DEREGISTER: '/service/client/deregister',
    SERVICE_ENABLE: '/service/enable',
    SERVICE_DISABLE: '/service/disable',
    INTERACTIONS_REGISTER: '/interactions/register',
    INTERACTIONS: '/interactions',
    SPEAKERS: '/speakers',
};

// Error Messages
export const ERROR_MESSAGES = {
    NETWORK: {
        CONNECTION_FAILED: 'Failed to connect to server',
        TIMEOUT: 'Request timed out',
        ABORT: 'Request was aborted',
    },
    AUDIO: {
        PERMISSION_DENIED: 'Microphone permission denied',
        DEVICE_NOT_FOUND: 'No audio input device found',
        VAD_INIT_FAILED: 'Voice activity detection initialization failed',
        RECORDING_FAILED: 'Audio recording failed',
    },
    BACKEND: {
        REGISTRATION_FAILED: 'Failed to register with backend',
        SERVICE_UNAVAILABLE: 'Backend service unavailable',
        TRANSCRIPTION_FAILED: 'Transcription service failed',
    }
};

// Success Messages
export const SUCCESS_MESSAGES = {
    CONNECTION: 'Successfully connected to server',
    REGISTRATION: 'Successfully registered with backend',
    AUDIO_START: 'Audio recording started',
    AUDIO_STOP: 'Audio recording stopped',
};