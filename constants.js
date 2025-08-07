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
        /** Health check interval in milliseconds */
        HEALTH_CHECK_INTERVAL: 1000,
        /** Interaction request timeout in milliseconds */
        INTERACTION_REQUEST: 30000,
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
        /** Optimal RMS for interaction */
        TARGET_RMS: 0.15,
        /** Minimum SNR threshold in dB */
        MIN_SNR_DB: -20,
        /** Enable advanced noise reduction features */
        ENABLE_ADVANCED_NOISE_REDUCTION: true,
        /** Enable dynamic gain control */
        ENABLE_DYNAMIC_GAIN_CONTROL: true,
        /** Enable spectral gating */
        ENABLE_SPECTRAL_GATING: true,
        /** Enable adaptive thresholds */
        ENABLE_ADAPTIVE_THRESHOLDS: true,
        /** Environmental noise baseline */
        ENVIRONMENTAL_NOISE: 0,
        /** Last noise analysis timestamp */
        LAST_NOISE_ANALYSIS: 0,
    },
    CONSTRAINTS: {
        SAMPLE_RATE: 16000,
        CHANNELS: 1,
        /** Low latency for real-time processing */
        LATENCY: 0.01,
        ECHO_CANCELLATION: true,
        NOISE_SUPPRESSION: true,
        AUTO_GAIN_CONTROL: true,
        /** Enhanced Google-specific audio constraints */
        GOOGLE_ECHO_CANCELLATION: true,
        GOOGLE_AUTO_GAIN_CONTROL: true,
        GOOGLE_NOISE_SUPPRESSION: true,
        GOOGLE_HIGHPASS_FILTER: true,
        GOOGLE_AUDIO_MIRRORING: false,
    },
    VAD_SETTINGS: {
        /** Sample rate for VAD processing */
        SAMPLE_RATE: 16000,
        /** Frame samples for VAD processing */
        FRAME_SAMPLES: 1536,
        /** Target silence time in milliseconds */
        TARGET_SILENCE_MS: 420,
        /** Frames for speech onset capture */
        PRE_SPEECH_PAD_FRAMES: 2,
        /** Minimum frames for speech detection */
        MIN_SPEECH_FRAMES: 4,
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
    DEBUG_MODE: false,
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
    STATUS: '/',
    REGISTER_CLIENT: '/service/client/register/{client_id}',
    DEREGISTER_CLIENT: '/service/client/deregister/{client_id}',
    ENABLE_SERVICE: '/service/enable',
    DISABLE_SERVICE: '/service/disable',
    REGISTER_INTERACTION: '/interactions/register',
    RUN_INFERENCE: '/interactions/{interaction_id}/inference',
    TRIGGER_INFERENCE: '/interactions/{id}/trigger_inference',
    INTERACTION_INFERENCE: '/interactions/{interaction_id}/inference',
    GET_INTERACTION: '/interactions/{interaction_id}',
    DELETE_INTERACTION: '/interactions/{interaction_id}',
    GET_PERSON: '/persons/{person_id}',
    GET_ALL_PERSONS: '/persons/all',
    UPDATE_PERSON: '/persons/{person_id}/update',
    // Speaker endpoints (aliases for persons for backward compatibility)
    GET_SPEAKERS: '/persons/all',
    TRAIN_SPEAKER_EMBEDDING: '/persons/{speaker_id}/train_embedding',
    // Conversation endpoints
    GET_CONVERSATION: '/conversations/{conversation_id}',
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
        INTERACTION_FAILED: 'Interaction service failed',
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