/**
 * Constants for Mira Desktop Application
 */

/**
 * API Configuration settings for backend communication
 * @type {Object}
 */
export const API_CONFIG = {
    BASE_URLS: new Map([
        ["localhost", 'http://localhost:8000'],
        ["ankurs-macbook-air", 'http://100.75.140.79:8000']
    ]),
    CLIENT_ID: 'Mira Desktop App',
    TIMEOUTS: {
        /** Default request timeout in milliseconds */
        DEFAULT_REQUEST: 10000,
        /** VAD library loading timeout in milliseconds */
        VAD_LIBRARY_LOAD: 15000,
        /** Backend stop request timeout in milliseconds */
        BACKEND_STOP_REQUEST: 10000,
    },
    RETRY_CONFIG: {
        MAX_RETRIES: 2,
        /** Backoff delay in milliseconds */
        BACKOFF_DELAY: 1000,
    }
};

/**
 * Audio Configuration settings for voice processing and optimization
 * @type {Object}
 */
export const AUDIO_CONFIG = {
    VAD_THRESHOLDS: {
        /** Increased for better noise rejection */
        POSITIVE_SPEECH: 0.35,
        /** Balanced for clean cutoff */
        NEGATIVE_SPEECH: 0.15,
        /** More responsive detection in milliseconds */
        SILENCE_MS: 420,
    },
    OPTIMIZATION: {
        /** Noise floor threshold in dB */
        NOISE_FLOOR: -40,
        /** Signal threshold in dB */
        SIGNAL_THRESHOLD: -20,
        /** Optimal RMS for transcription */
        TARGET_RMS: 0.15,
        /** Minimum SNR threshold in dB */
        MIN_SNR_DB: -20,
    },
    CONSTRAINTS: {
        SAMPLE_RATE: 16000,
        CHANNELS: 1,
        /** Low latency for real-time processing */
        LATENCY: 0.01,
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

/**
 * UI Configuration settings for visual elements and behaviors
 * @type {Object}
 */
export const UI_CONFIG = {
    OPACITY: {
        DISABLED: '0.7',
        ENABLED: '1.0',
    },
    MESSAGES: {
        /** Fade duration in milliseconds */
        FADE_DURATION: 3000,
    },
    COLORS: {
        SUCCESS: '#28a745',
        ERROR: '#dc3545',
        WARNING: '#ffc107',
        INFO: '#17a2b8',
    }
};

/**
 * Debug Configuration settings for logging and diagnostics
 * @type {Object}
 */
export const DEBUG_CONFIG = {
    LOG_LEVELS: {
        ERROR: 0,
        WARN: 1,
        INFO: 2,
        DEBUG: 3,
    },
    PERFORMANCE: {
        /** Audio stats interval in milliseconds */
        AUDIO_STATS_INTERVAL: 5000,
        /** Memory check interval in milliseconds */
        MEMORY_CHECK_INTERVAL: 10000,
    }
};

/**
 * API Endpoints for backend communication
 * @type {Object}
 */
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

/**
 * Error Messages for user feedback and debugging
 * @type {Object}
 */
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

/**
 * Success Messages for user feedback
 * @type {Object}
 */
export const SUCCESS_MESSAGES = {
    CONNECTION: 'Successfully connected to server',
    REGISTRATION: 'Successfully registered with backend',
    AUDIO_START: 'Audio recording started',
    AUDIO_STOP: 'Audio recording stopped',
};