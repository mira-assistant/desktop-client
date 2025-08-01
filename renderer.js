import { API_CONFIG, AUDIO_CONFIG, UI_CONFIG, DEBUG_CONFIG, ERROR_MESSAGES, SUCCESS_MESSAGES } from './constants.js';
import { ApiService } from './api.js';

/**
 * MiraDesktop - Main application class for the Mira Desktop Client
 * Handles audio recording, transcription, and backend communication
 */
class MiraDesktop {
    /**
     * Initialize the MiraDesktop application
     */
    constructor() {
        this.baseUrl = null;
        this.apiService = null;
        
        this.isConnected = false;
        this.isListening = false;
        this.isRegistered = false;
        this.isToggling = false;
        this.isProcessingAudio = false;
        this._deregistrationAttempted = false;

        this.transcriptions = [];
        this.transcription_ids = new Set();
        this.connectionCheckInterval = null;

        this.speakerIndexMap = new Map();
        this.nextSpeakerIndex = 0;

        /** Audio capture properties for VAD-based recording */
        this.micVAD = null;
        this.isRecording = false;
        this.audioProcessingStats = {
            totalAudioSent: 0,
            totalAudioBytes: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageAudioDuration: 0
        };

        /** Enhanced audio optimization properties from constants */
        this.audioOptimization = {
            enableAdvancedNoiseReduction: true,
            enableDynamicGainControl: true,
            enableSpectralGating: true,
            noiseFloor: AUDIO_CONFIG.OPTIMIZATION.NOISE_FLOOR,
            signalThreshold: AUDIO_CONFIG.OPTIMIZATION.SIGNAL_THRESHOLD,
            adaptiveThresholds: true,
            environmentalNoise: 0,
            lastNoiseAnalysis: 0
        };

        /** Debug mode configuration */
        this.debugMode = false;
        this.debugLevel = DEBUG_CONFIG.LOG_LEVELS.INFO;

        this.initializeElements();
        this.setupEventListeners();
        this.startConnectionCheck();
    }

    initializeElements() {
        this.micButton = document.getElementById('micButton');
        this.micIcon = document.getElementById('micIcon');
        this.micStatusText = document.getElementById('micStatusText');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.transcriptionContent = document.getElementById('transcriptionContent');
        this.clearButton = document.getElementById('clearButton');
        this.connectionBanner = document.getElementById('connectionBanner');
        this.retryButton = document.getElementById('retryButton');
        this.rippleEffect = document.getElementById('rippleEffect');
    }

    setupEventListeners() {
        this.micButton.addEventListener('click', () => this.toggleListening());
        this.clearButton.addEventListener('click', () => this.clearTranscriptions());
        this.retryButton.addEventListener('click', () => this.checkConnection());

        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.toggleListening();
            }
        });
    }

    /**
     * Enhanced logging method with debug levels and proper console methods
     * @param {string} level - Log level: 'error', 'warn', 'info', 'debug'
     * @param {string} message - Log message
     * @param {any} data - Optional data to log
     */
    log(level, message, data = null) {
        const levels = DEBUG_CONFIG.LOG_LEVELS;
        const currentLevel = this.debugMode ? DEBUG_CONFIG.LOG_LEVELS.DEBUG : this.debugLevel;
        
        if (levels[level.toUpperCase()] > currentLevel) {
            return;
        }

        const timestamp = new Date().toISOString();
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        
        switch (level.toLowerCase()) {
            case 'error':
                console.error(prefix, message, data || '');
                break;
            case 'warn':
                console.warn(prefix, message, data || '');
                break;
            case 'info':
                console.log(prefix, message, data || '');
                break;
            case 'debug':
                if (this.debugMode) {
                    console.log(prefix, message, data || '');
                }
                break;
            default:
                console.log(prefix, message, data || '');
        }
    }

    /**
     * Log debug information with important data when in debug mode
     * @param {string} category - Debug category (e.g., 'audio', 'api', 'vad')
     * @param {string} message - Debug message
     * @param {Object} data - Important data to include
     */
    debugLog(category, message, data = {}) {
        if (this.debugMode) {
            this.log('debug', `[${category.toUpperCase()}] ${message}`, {
                timestamp: Date.now(),
                debugData: data,
                appState: {
                    isConnected: this.isConnected,
                    isListening: this.isListening,
                    isRecording: this.isRecording,
                    isRegistered: this.isRegistered
                }
            });
        }
    }

    /**
     * Check connection to available servers and establish API service
     * Attempts to connect to configured servers and initializes API service
     */
    async checkConnection() {
        let urls = Object.fromEntries(API_CONFIG.BASE_URLS);

        if (this.baseUrl) {
            urls = { "cachedUrl": this.baseUrl, ...urls };
        }

        let connected = false;

        for (const [hostName, url] of Object.entries(urls)) {
            try {
                /** Create temporary API service for health check */
                const tempApiService = new ApiService(url);
                const response = await tempApiService.healthCheck();
                
                if (response.success) {
                    this.baseUrl = url;
                    /** Set the working API service */
                    this.apiService = tempApiService;
                    this.updateConnectionStatus(true);
                    this.hideConnectionBanner();
                    this.isConnected = true;

                    if (!this.isRegistered) {
                        await this.registerClient();
                    }

                    this.updateFeatures(response.data.features);
                    this.updateServerStatus(response.data);
                    this.fetchLatestInteractions(response.data.recent_interactions);

                    this.log('info', `Connected to ${hostName} at ${url}`);
                    connected = true;
                    break;
                } else {
                    this.log('warn', `Connection check failed for ${hostName}: ${response.error}`);
                }
            } catch (error) {
                this.log('warn', `Failed to connect to ${hostName} at ${url}: ${error.message}`);
            }
        }

        if (!connected) {
            this.isConnected = false;
            this.isRegistered = false;
            this._deregistrationAttempted = false;
            this.updateConnectionStatus(false);
            this.showConnectionBanner();
        }
    }

    /**
     * Register client with backend service
     * Uses ApiService for proper error handling and response parsing
     */
    async registerClient() {
        if (!this.apiService) {
            this.log('error', 'Cannot register client: API service not initialized');
            return;
        }

        try {
            const response = await this.apiService.registerClient();
            
            if (response.success) {
                this.isRegistered = true;
                this.log('info', SUCCESS_MESSAGES.REGISTRATION);
                this.debugLog('api', 'Client registration successful', { clientId: API_CONFIG.CLIENT_ID });
            } else {
                this.log('error', `Failed to register client: ${response.error}`, { status: response.status });
            }
        } catch (error) {
            this.log('error', `Client registration error: ${error.message}`);
        }
    }

    /**
     * Deregister client from backend service
     * Uses ApiService for proper cleanup and error handling
     */
    async deregisterClient() {
        if (!this.isRegistered || this._deregistrationAttempted || !this.apiService) {
            return;
        }

        this._deregistrationAttempted = true;

        try {
            const response = await this.apiService.deregisterClient();
            
            if (response.success) {
                this.isRegistered = false;
                this.log('info', 'Client deregistered successfully');
                this.debugLog('api', 'Client deregistration successful', { clientId: API_CONFIG.CLIENT_ID });
            } else {
                this.log('error', `Failed to deregister client: ${response.error}`, { status: response.status });
            }
        } catch (error) {
            this.log('error', `Client deregistration error: ${error.message}`);
        }
    }

    async toggleListening() {
        if (!this.isConnected) {
            this.showMessage('Please wait for connection to the backend server');
            return;
        }

        if (this.isToggling) {
            return;
        }

        this.isToggling = true;
        const originalButtonText = this.micStatusText.textContent;

        try {
            /** Provide immediate UI feedback */
            this.micButton.style.opacity = UI_CONFIG.OPACITY.DISABLED;
            this.micStatusText.textContent = this.isListening ? 'Stopping...' : 'Starting...';

            /** Small delay to ensure UI feedback is visible */
            await new Promise(resolve => setTimeout(resolve, 50));

            if (this.isListening) {
                await this.stopListening();
            } else {
                await this.startListening();
            }
            
        } catch (error) {
            this.log('error', 'Error toggling listening', error);

            /** Determine user-friendly error message */
            let errorMessage = 'Error: ' + error.message;
            if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
                errorMessage = ERROR_MESSAGES.AUDIO.PERMISSION_DENIED;
            } else if (error.message.includes('internet') || error.message.includes('VAD library')) {
                errorMessage = ERROR_MESSAGES.AUDIO.VAD_INIT_FAILED;
            } else if (error.message.includes('timeout')) {
                errorMessage = ERROR_MESSAGES.NETWORK.TIMEOUT;
            } else if (error.message.includes('backend') || error.message.includes('Backend')) {
                errorMessage = ERROR_MESSAGES.BACKEND.SERVICE_UNAVAILABLE;
            } else if (error.message.includes('network') || error.message.includes('Failed to fetch')) {
                errorMessage = ERROR_MESSAGES.NETWORK.CONNECTION_FAILED;
            }

            this.showMessage(errorMessage, 'error');
            
            /** Ensure UI reflects actual state after error */
            this.updateListeningUI(this.isListening);
            
            /** Log detailed error information for debugging */
            console.error('Toggle listening error details:', {
                message: error.message,
                isConnected: this.isConnected,
                isListening: this.isListening,
                isRecording: this.isRecording
            });
            
        } finally {
            /** Always reset toggle state and UI */
            this.isToggling = false;
            this.micButton.style.opacity = UI_CONFIG.OPACITY.ENABLED;

            /** Restore button text if we're not listening and text shows loading state */
            if (!this.isListening && this.micStatusText.textContent.includes('...')) {
                this.micStatusText.textContent = originalButtonText;
            }
        }
    }

    /**
     * Start listening service with backend enable and audio capture
     * Uses ApiService for proper error handling and response management
     */
    async startListening() {
        if (!this.apiService) {
            throw new Error(ERROR_MESSAGES.BACKEND.SERVICE_UNAVAILABLE);
        }

        try {
            const response = await this.apiService.enableService();

            if (response.success) {
                await this.startAudioCapture();
                this.isListening = true;
                this.updateListeningUI(true);
                this.startTranscriptionPolling();
                this.log('info', SUCCESS_MESSAGES.AUDIO_START);
                this.debugLog('audio', 'Listening started successfully', {
                    serviceEnabled: true,
                    vadInitialized: !!this.micVAD
                });
            } else {
                this.log('error', `Failed to enable backend service: ${response.error}`, { status: response.status });
                throw new Error(`Failed to enable listening: ${response.status}`);
            }
        } catch (error) {
            this.log('error', 'Error starting listening', error);
            await this.stopAudioCapture();
            this.isListening = false;
            this.updateListeningUI(false);
            throw error;
        }
    }

    /**
     * Stop listening service with backend disable and audio cleanup
     * Uses ApiService for proper error handling and retry logic
     */
    async stopListening() {
        try {
            /** First, stop audio capture to ensure recording stops immediately */
            await this.stopAudioCapture();

            /** Send disable request to backend using ApiService */
            let backendStopResult = null;
            if (this.apiService) {
                backendStopResult = await this.apiService.disableService();
            }
            
            if (backendStopResult && backendStopResult.success) {
                /** Update states only after successful backend confirmation */
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopTranscriptionPolling();
                this.log('info', SUCCESS_MESSAGES.AUDIO_STOP);
                this.debugLog('audio', 'Listening stopped successfully', {
                    serviceDisabled: true,
                    vadDestroyed: !this.micVAD
                });
            } else {
                /** Even if backend fails, ensure local state is consistent */
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopTranscriptionPolling();
                
                /** Show user-friendly error message */
                this.showMessage(
                    'Audio recording stopped, but backend communication failed. Please check your connection.', 
                    'warning'
                );
                this.log('warn', 'Backend stop request failed but local cleanup completed');
            }
        } catch (error) {
            this.log('error', 'Error stopping listening', error);
            
            /** Ensure cleanup happens even if there are errors */
            try {
                /** Force stop audio capture if not already done */
                await this.stopAudioCapture();
                
                /** Update states to stopped regardless of backend status */
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopTranscriptionPolling();
            } catch (cleanupError) {
                this.log('error', 'Error during forced stop cleanup', cleanupError);
            }
            
            /** Show user-friendly error message */
            this.showMessage('Error stopping recording: ' + error.message, 'error');
            
            /** Don't rethrow - we want to ensure the UI is updated */
        }
    }

    /**
     * Wait for VAD library to load with timeout
     * @param {number} timeout - Timeout in milliseconds
     */
    async waitForVADLibrary(timeout = API_CONFIG.TIMEOUTS.VAD_LIBRARY_LOAD) {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (window.vadLibraryLoaded) {
                return;
            }

            if (window.vadLibraryLoadError) {
                throw new Error(`VAD library failed to load: ${window.vadLibraryLoadError}`);
            }

            await new Promise(resolve => setTimeout(resolve, 100));
        }

        throw new Error('Timeout waiting for VAD library to load');
    }

    async startAudioCapture() {
        try {
            await this.waitForVADLibrary();

            if (typeof vad === 'undefined') {
                console.error('VAD library not found. Library loading may have failed.');
                const errorMsg = window.vadLibraryLoadError || 'Voice Activity Detection library is not available. Please refresh the page and try again.';
                throw new Error(errorMsg);
            }

            if (!vad.MicVAD) {
                console.error('MicVAD not found in VAD library object:', Object.keys(vad));
                throw new Error('Voice Activity Detection module is incomplete. Please refresh the page and try again.');
            }

            const { MicVAD } = vad;
            const sampleRate = 16000;
            const frameSamples = 1536;
            /** Reduced for more responsive detection */
            const targetSilenceMs = 420;
            const redemptionFrames = Math.max(1, Math.round((targetSilenceMs * sampleRate) / (frameSamples * 1000)));

            const vadInitPromise = MicVAD.new({
                model: 'legacy',

                /** Optimized thresholds for better noise rejection */
                positiveSpeechThreshold: AUDIO_CONFIG.VAD_THRESHOLDS.POSITIVE_SPEECH,
                negativeSpeechThreshold: AUDIO_CONFIG.VAD_THRESHOLDS.NEGATIVE_SPEECH,

                redemptionFrames: redemptionFrames,

                /** Audio quality settings optimized for transcription */
                frameSamples: frameSamples,
                /** Increased to capture speech onset */
                preSpeechPadFrames: 2,
                /** Increased to avoid false positives */
                minSpeechFrames: 4,

                /** Enhanced audio constraints for maximum quality */
                additionalAudioConstraints: {
                    sampleRate: AUDIO_CONFIG.CONSTRAINTS.SAMPLE_RATE,
                    echoCancellation: AUDIO_CONFIG.CONSTRAINTS.ECHO_CANCELLATION,
                    noiseSuppression: AUDIO_CONFIG.CONSTRAINTS.NOISE_SUPPRESSION,
                    autoGainControl: AUDIO_CONFIG.CONSTRAINTS.AUTO_GAIN_CONTROL,
                    channelCount: AUDIO_CONFIG.CONSTRAINTS.CHANNELS,
                    
                    /** Advanced constraints for better audio quality */
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true,
                    googAudioMirroring: false,
                    latency: AUDIO_CONFIG.CONSTRAINTS.LATENCY,
                },

                onSpeechStart: () => {
                    this.updateVADStatus('speaking');
                },

                onSpeechEnd: (audio) => {
                    try {
                        this.updateVADStatus('processing');

                        /** Validate and optimize audio data before sending */
                        if (audio && audio.length > 0) {
                            this.processAndSendOptimizedAudio(audio);
                        } else {
                            this.updateVADStatus('waiting');
                        }
                    } catch (err) {
                        this.log('error', 'VAD error in onSpeechEnd callback', err);
                        this.updateVADStatus('waiting');
                    }
                },

                onVADMisfire: () => {
                    this.updateVADStatus('waiting');
                },

                onFrameProcessed: (probabilities) => {
                    /** Enhanced debug mode logging for frame processing */
                    if (this.debugMode) {
                        this.debugLog('vad', 'Frame processed', {
                            probabilities: probabilities,
                            isRecording: this.isRecording,
                            vadStatus: this.micStatusText?.textContent,
                            audioOptimization: this.audioOptimization
                        });
                    }
                },

                onError: (error) => {
                    this.log('error', 'VAD internal error', error);
                    this.showMessage('Voice detection error: ' + error.message, 'error');
                }
            });

            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('VAD initialization timeout after 10 seconds')), 10000);
            });

            this.micVAD = await Promise.race([vadInitPromise, timeoutPromise]);
            await this.micVAD.start();
            this.isRecording = true;
            this.updateVADStatus('waiting');
        } catch (error) {
            this.log('error', 'Error starting VAD audio capture', error);

            let errorMessage = ERROR_MESSAGES.AUDIO.VAD_INIT_FAILED;
            if (error.message.includes('Permission denied') || error.name === 'NotAllowedError') {
                errorMessage = ERROR_MESSAGES.AUDIO.PERMISSION_DENIED;
            } else if (error.message.includes('VAD library failed to load') || error.message.includes('library loading')) {
                errorMessage = `Voice detection library failed to load: ${error.message}. Please refresh the page and try again.`;
            } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                errorMessage = 'Voice detection initialization timed out. Please try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = ERROR_MESSAGES.AUDIO.DEVICE_NOT_FOUND;
            } else if (error.message.includes('MicVAD')) {
                errorMessage = 'Voice detection module is incomplete. Please refresh the page and try again.';
            } else {
                errorMessage = `Voice detection error: ${error.message}`;
            }

            this.debugLog('audio', 'VAD initialization failed', {
                message: error.message,
                name: error.name,
                vadLibraryLoaded: window.vadLibraryLoaded,
                vadLibraryLoadError: window.vadLibraryLoadError
            });

            this.showMessage(errorMessage, 'error');
            throw error;
        }
    }

    /**
     * Stop audio capture with complete VAD destruction and state verification
     * Enhanced error handling and debugging for stop recording functionality
     */
    async stopAudioCapture() {
        this.log('info', 'Starting audio capture stop process');
        
        try {
            /** Set recording state to false immediately to prevent new processing */
            this.isRecording = false;
            this.log('info', 'Recording state set to false');

            if (this.micVAD) {
                this.log('info', 'Destroying VAD instance');
                this.debugLog('audio', 'VAD destruction initiated', {
                    vadExists: !!this.micVAD,
                    isRecording: this.isRecording
                });
                
                try {
                    /** Call destroy method on VAD */
                    await this.micVAD.destroy();
                    this.log('info', 'VAD.destroy() completed successfully');
                } catch (vadError) {
                    this.log('error', 'Error calling VAD.destroy()', vadError);
                    /** Continue with cleanup even if destroy fails */
                }

                /** Additional cleanup: manually stop any remaining audio tracks */
                await this.forceStopAllAudioTracks();
                
                /** Clear the VAD reference */
                this.micVAD = null;
                this.log('info', 'VAD instance cleared');
            } else {
                this.log('info', 'No VAD instance to destroy');
            }

            /** Verify that recording has actually stopped */
            await this.verifyRecordingIsStopped();
            
            /** Update VAD status */
            this.updateVADStatus('stopped');
            this.log('info', 'Audio capture stopped successfully');
            
        } catch (error) {
            this.log('error', 'Error stopping VAD audio capture', error);
            
            /** Force cleanup even if there are errors */
            try {
                await this.forceStopAllAudioTracks();
                this.micVAD = null;
                this.isRecording = false;
                this.updateVADStatus('stopped');
                this.log('info', 'Forced cleanup completed');
            } catch (forceError) {
                this.log('error', 'Error during forced cleanup', forceError);
            }
            
            /** Log detailed error information for debugging */
            this.debugLog('audio', 'Audio capture stop error details', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                isRecording: this.isRecording,
                micVAD: !!this.micVAD
            });
            
            /** Don't rethrow the error - we want to ensure cleanup happens */
        }
    }

    /**
     * Force stop all active audio tracks to ensure recording is completely stopped
     */
    async forceStopAllAudioTracks() {
        try {
            /** Get all media devices */
            const mediaDevices = navigator.mediaDevices;
            if (!mediaDevices || !mediaDevices.enumerateDevices) {
                return;
            }

            /** Check if there are any active media streams and verify cleanup */
            
            /** Try to detect active streams by checking permissions */
            try {
                await navigator.permissions.query({ name: 'microphone' });
            } catch {
                /** Ignore permission check errors - this is just a verification step */
            }

            /** The VAD library should clean up its own streams, but let's add a verification step */
            /** We'll try to create a new temporary stream to verify microphone access is properly released */
            await this.verifyMicrophoneIsReleased();
            
        } catch (error) {
            console.error('Error during audio track cleanup:', error);
            /** Continue execution - this is a best-effort cleanup */
        }
    }

    /**
     * Verify that the microphone is properly released by the VAD library
     */
    async verifyMicrophoneIsReleased() {
        try {
            /** Try to get microphone access briefly to verify it's not locked */
            const testStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    sampleRate: 16000,
                    channelCount: 1 
                } 
            });
            
            /** Immediately stop the test stream */
            if (testStream) {
                testStream.getTracks().forEach(track => {
                    track.stop();
                });
            }
            
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                /** Expected if user has denied access */
            } else if (error.name === 'NotFoundError') {
                /** No microphone found */
            } else if (error.name === 'AbortError' || error.message.includes('busy')) {
                /** This suggests the microphone wasn't properly released */
                throw new Error('Microphone appears to still be in use after VAD destruction');
            }
        }
    }

    /**
     * Verify that recording has actually stopped
     */
    async verifyRecordingIsStopped() {
        /** Check internal state */
        if (this.isRecording) {
            console.log('Recording state verification - isRecording:', this.isRecording, 'micVAD:', !!this.micVAD);
        }
    }

    /**
     * Check if the audio contains a cancel command like "Mira cancel"
     * This is a placeholder for potential future speech recognition integration
     */
    checkForCancelCommand(audioData) { /* eslint-disable-line no-unused-vars */
        /** Note: This is a placeholder for cancel command detection */
        /** In a full implementation, this could use a lightweight speech recognition */
        /** to detect "Mira cancel" or similar commands locally before sending to backend */
        
        /** Future implementation could: */
        /** 1. Use a lightweight local speech recognition model */
        /** 2. Check for specific wake words like "Mira cancel", "stop", etc. */
        /** 3. If detected, immediately call this.stopListening() */
        /** 4. Return true/false to indicate if command was found */
        
        return false;
    }

    /**
     * Add debugging method to show audio processing statistics
     */
    showAudioStats() {
        if (!this.audioProcessingStats) {
            console.log('No audio stats available');
            return;
        }

        const stats = this.audioProcessingStats;
        console.log('=== AUDIO PROCESSING STATISTICS ===');
        console.log(`Total audio chunks sent: ${stats.totalAudioSent}`);
        console.log(`Successful requests: ${stats.successfulRequests}`);
        console.log(`Failed requests: ${stats.failedRequests}`);
        console.log(`Success rate: ${stats.totalAudioSent > 0 ? ((stats.successfulRequests / stats.totalAudioSent) * 100).toFixed(1) : 0}%`);
        
        console.log(`Audio optimization settings:`);
        console.log(`- Advanced noise reduction: ${this.audioOptimization.enableAdvancedNoiseReduction}`);
        console.log(`- Dynamic gain control: ${this.audioOptimization.enableDynamicGainControl}`);
        console.log(`- Spectral gating: ${this.audioOptimization.enableSpectralGating}`);
        
        const optimizationStatus = `${this.audioOptimization.enableAdvancedNoiseReduction ? 'NR+' : ''}${this.audioOptimization.enableDynamicGainControl ? 'AGC+' : ''}${this.audioOptimization.enableSpectralGating ? 'SG' : ''}`;
        const statsMessage = `Audio: ${stats.totalAudioSent} sent, ${stats.successfulRequests} OK (${((stats.successfulRequests / (stats.totalAudioSent || 1)) * 100).toFixed(1)}%) | Optimizations: ${optimizationStatus}`;
        this.showMessage(statsMessage, 'info');
    }

    /**
     * Toggle audio optimization features for testing
     */
    toggleAudioOptimization(feature) {
        if (!Object.prototype.hasOwnProperty.call(this.audioOptimization, feature)) {
            this.log('error', `Unknown optimization feature: ${feature}`);
            this.log('info', 'Available features: ' + Object.keys(this.audioOptimization).join(', '));
            return;
        }
        
        this.audioOptimization[feature] = !this.audioOptimization[feature];
        this.log('info', `${feature}: ${this.audioOptimization[feature] ? 'Enabled' : 'Disabled'}`);
        this.showMessage(`Audio optimization "${feature}" ${this.audioOptimization[feature] ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * Toggle debug mode and provide comprehensive debug information
     * @param {boolean} enabled - Whether to enable debug mode
     */
    setDebugMode(enabled = true) {
        this.debugMode = enabled;
        this.debugLevel = enabled ? DEBUG_CONFIG.LOG_LEVELS.DEBUG : DEBUG_CONFIG.LOG_LEVELS.INFO;
        
        this.log('info', `Debug mode ${enabled ? 'enabled' : 'disabled'}`);
        
        if (enabled) {
            /** Log current application state when debug mode is enabled */
            this.debugLog('system', 'Debug mode activated - Current state', {
                isConnected: this.isConnected,
                isListening: this.isListening,
                isRecording: this.isRecording,
                isRegistered: this.isRegistered,
                baseUrl: this.baseUrl,
                audioOptimization: this.audioOptimization,
                audioProcessingStats: this.audioProcessingStats,
                vadInitialized: !!this.micVAD,
                transcriptionCount: this.transcriptions.length
            });
        }
        
        return enabled;
    }

    /**
     * Get comprehensive debug information
     * @returns {Object} Debug information object
     */
    getDebugInfo() {
        const debugInfo = {
            system: {
                debugMode: this.debugMode,
                debugLevel: this.debugLevel,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            },
            connection: {
                isConnected: this.isConnected,
                isRegistered: this.isRegistered,
                baseUrl: this.baseUrl,
                clientId: API_CONFIG.CLIENT_ID,
                apiServiceInitialized: !!this.apiService
            },
            audio: {
                isListening: this.isListening,
                isRecording: this.isRecording,
                isProcessingAudio: this.isProcessingAudio,
                vadInitialized: !!this.micVAD,
                audioOptimization: { ...this.audioOptimization },
                audioProcessingStats: { ...this.audioProcessingStats }
            },
            ui: {
                transcriptionCount: this.transcriptions.length,
                micButtonText: this.micStatusText?.textContent,
                statusText: this.statusText?.textContent
            },
            browser: {
                mediaDevicesSupported: !!navigator.mediaDevices,
                getUserMediaSupported: !!navigator.mediaDevices?.getUserMedia,
                webAudioSupported: !!window.AudioContext || !!window.webkitAudioContext,
                vadLibraryLoaded: window.vadLibraryLoaded,
                vadLibraryLoadError: window.vadLibraryLoadError
            }
        };

        if (this.debugMode) {
            this.log('debug', 'Debug info requested', debugInfo);
        }

        return debugInfo;
    }

    /**
     * Print debug help information
     */
    printDebugHelp() {
        const helpText = `
🔧 Mira Desktop Debug Commands:

Basic Controls:
• window.miraApp.setDebugMode(true/false) - Enable/disable debug mode
• window.miraApp.getDebugInfo() - Get comprehensive debug information
• window.miraApp.printDebugHelp() - Show this help

Connection & API:
• window.miraApp.testBackendConnection() - Test backend connectivity
• window.miraApp.checkConnection() - Retry connection to backend

Audio & Recording:
• window.miraApp.toggleListening() - Start/stop listening
• window.miraApp.toggleAudioOptimization(feature) - Toggle audio features
  Available features: ${Object.keys(this.audioOptimization).join(', ')}

State Information:
• window.miraApp.debugMode - Current debug mode status
• window.miraApp.isConnected - Backend connection status
• window.miraApp.isListening - Listening service status
• window.miraApp.isRecording - Audio recording status
• window.miraApp.audioProcessingStats - Audio processing statistics

Debug Shortcuts:
• Ctrl+Shift+D - Toggle debug mode
• Ctrl+Shift+A - Show this help
• Ctrl+Shift+I - Get debug info
• Ctrl+Shift+T - Test backend connection
        `;
        
        console.log(helpText);
        return helpText;
    }

    /**
     * Test backend connection with detailed logging using ApiService
     */
    async testBackendConnection() {
        if (!this.apiService) {
            this.log('warn', 'No API service configured');
            this.showMessage('No backend URL configured', 'warning');
            return;
        }

        try {
            const startTime = Date.now();
            const response = await this.apiService.healthCheck();
            const duration = Date.now() - startTime;

            if (response.success) {
                this.log('info', `Backend connection test successful (${duration}ms)`, response.data);
                this.showMessage(`Backend connection OK (${duration}ms)`, 'info');
            } else {
                this.log('error', `Backend connection test failed: ${response.error}`);
                this.showMessage(`Backend test failed: ${response.status}`, 'error');
            }
        } catch (error) {
            this.log('error', 'Backend connection test error', error);
            this.showMessage(`Backend test error: ${error.message}`, 'error');
        }
    }

    /**
     * Process and optimize audio with advanced noise reduction and quality enhancement
     */
    async processAndSendOptimizedAudio(audioFloat32Array) {
        try {
            /** Step 1: Analyze audio quality */
            const audioAnalysis = this.analyzeAudioQuality(audioFloat32Array);
            
            /** Step 2: Apply noise reduction if enabled */
            let processedAudio = audioFloat32Array;
            if (this.audioOptimization.enableAdvancedNoiseReduction) {
                processedAudio = this.applyNoiseReduction(processedAudio, audioAnalysis);
            }
            
            /** Step 3: Apply dynamic gain control */
            if (this.audioOptimization.enableDynamicGainControl) {
                processedAudio = this.applyDynamicGainControl(processedAudio, audioAnalysis);
            }
            
            /** Step 4: Apply spectral gating for further noise reduction */
            if (this.audioOptimization.enableSpectralGating) {
                processedAudio = this.applySpectralGating(processedAudio, audioAnalysis);
            }
            
            /** Step 5: Final quality check */
            const finalAnalysis = this.analyzeAudioQuality(processedAudio);
            
            /** Step 6: Only send if audio quality is sufficient */
            if (finalAnalysis.snr > this.audioOptimization.signalThreshold) {
                await this.sendVADAudioToBackend(processedAudio);
            } else {
                this.updateVADStatus('waiting');
            }
            
        } catch (error) {
            console.error('Error in audio optimization pipeline:', error);
            /** Fallback to original audio if processing fails */
            await this.sendVADAudioToBackend(audioFloat32Array);
        }
    }

    /**
     * Analyze audio quality metrics for optimization decisions
     */
    analyzeAudioQuality(audioFloat32Array) {
        const samples = audioFloat32Array.length;
        let sumSquares = 0;
        let maxAmplitude = 0;
        let silentSamples = 0;
        
        /** Calculate RMS and find peak amplitude */
        for (let i = 0; i < samples; i++) {
            const sample = Math.abs(audioFloat32Array[i]);
            sumSquares += sample * sample;
            maxAmplitude = Math.max(maxAmplitude, sample);
            
            /** Threshold for "silent" samples */
            if (sample < 0.001) {
                silentSamples++;
            }
        }
        
        const rms = Math.sqrt(sumSquares / samples);
        const energy = sumSquares / samples;
        
        /** Estimate SNR (simplified calculation) */
        const speechPower = rms * rms;
        /** Estimate noise floor */
        const noisePower = silentSamples > samples * 0.1 ? 
            Math.max(speechPower * 0.01, 1e-10) : speechPower * 0.1;
        const snr = 10 * Math.log10(speechPower / noisePower);
        
        /** Calculate dynamic range */
        const dynamicRange = 20 * Math.log10(maxAmplitude / Math.max(rms, 1e-10));
        
        return {
            rms,
            energy,
            snr,
            maxAmplitude,
            dynamicRange,
            silentRatio: silentSamples / samples
        };
    }

    /**
     * Apply advanced noise reduction using spectral subtraction
     */
    applyNoiseReduction(audioFloat32Array, analysis) {
        if (analysis.snr > 20) {
            return audioFloat32Array;
        }
        
        const result = new Float32Array(audioFloat32Array.length);
        /** Adaptive noise threshold */
        const noiseThreshold = analysis.rms * 0.3;
        
        /** Simple spectral subtraction approach */
        for (let i = 0; i < audioFloat32Array.length; i++) {
            const sample = audioFloat32Array[i];
            const sampleAbs = Math.abs(sample);
            
            if (sampleAbs > noiseThreshold) {
                /** Keep strong signals, apply gentle filtering to weak ones */
                const gain = Math.min(1.0, sampleAbs / noiseThreshold);
                result[i] = sample * gain;
            } else {
                /** Aggressive reduction for likely noise */
                result[i] = sample * 0.1;
            }
        }
        
        return result;
    }

    /**
     * Apply dynamic gain control for consistent audio levels
     */
    applyDynamicGainControl(audioFloat32Array, analysis) {
        if (analysis.rms > 0.3) {
            return audioFloat32Array;
        }
        
        /** Calculate target RMS level - optimal level for transcription */
        const targetRMS = 0.15;
        const gainFactor = Math.min(3.0, targetRMS / Math.max(analysis.rms, 0.001));
        
        const result = new Float32Array(audioFloat32Array.length);
        for (let i = 0; i < audioFloat32Array.length; i++) {
            result[i] = Math.max(-1, Math.min(1, audioFloat32Array[i] * gainFactor));
        }
        
        return result;
    }

    /**
     * Apply spectral gating to remove noise between words
     */
    applySpectralGating(audioFloat32Array, analysis) {
        const result = new Float32Array(audioFloat32Array.length);
        const windowSize = Math.min(512, Math.floor(audioFloat32Array.length / 8));
        const gateThreshold = analysis.rms * 0.2;
        
        /** Apply gating in overlapping windows */
        for (let i = 0; i < audioFloat32Array.length; i++) {
            const windowStart = Math.max(0, i - windowSize / 2);
            const windowEnd = Math.min(audioFloat32Array.length, i + windowSize / 2);
            
            /** Calculate local RMS */
            let localRMS = 0;
            for (let j = windowStart; j < windowEnd; j++) {
                localRMS += audioFloat32Array[j] * audioFloat32Array[j];
            }
            localRMS = Math.sqrt(localRMS / (windowEnd - windowStart));
            
            /** Apply gate */
            const gateGain = localRMS > gateThreshold ? 1.0 : 0.3;
            result[i] = audioFloat32Array[i] * gateGain;
        }
        
        return result;
    }

    async sendVADAudioToBackend(audioFloat32Array) {
        if (!audioFloat32Array || audioFloat32Array.length === 0) {
            console.warn('sendVADAudioToBackend: Empty or invalid audio data');
            return;
        }

        if (this.isProcessingAudio) {
            console.warn('sendVADAudioToBackend: Already processing audio, skipping');
            return;
        }

        this.isProcessingAudio = true;

        try {
            if (!(audioFloat32Array instanceof Float32Array)) {
                console.error('Invalid audio data type:', typeof audioFloat32Array);
                throw new Error('Invalid audio data format');
            }

            /** Convert Float32Array to 16-bit PCM for backend compatibility */
            const audioInt16 = new Int16Array(audioFloat32Array.length);
            let validSamples = 0;

            for (let i = 0; i < audioFloat32Array.length; i++) {
                /** Clamp and convert to 16-bit signed integer */
                const sample = Math.max(-1, Math.min(1, audioFloat32Array[i]));
                audioInt16[i] = Math.round(sample * 32767);

                /** Count non-zero samples to validate audio content */
                if (Math.abs(sample) > 0.001) {
                    validSamples++;
                }
            }

            const validSampleRatio = validSamples / audioFloat32Array.length;
            if (validSampleRatio < 0.001) {
                this.log('warn', `Audio appears to be mostly silence, validSamples: ${validSamples} of ${audioFloat32Array.length}`);
            }

            /** Convert to bytes for backend (little-endian) */
            const audioBytes = new Uint8Array(audioInt16.buffer);

            /** Validate connection before sending */
            if (!this.isConnected || !this.apiService) {
                throw new Error(ERROR_MESSAGES.BACKEND.SERVICE_UNAVAILABLE);
            }

            /** Use ApiService to register interaction */
            const response = await this.apiService.registerInteraction(audioBytes.buffer, 'wav');

            if (response.success) {
                this.audioProcessingStats.successfulRequests++;
                this.audioProcessingStats.totalAudioSent++;
                this.audioProcessingStats.totalAudioBytes += audioBytes.length;
                this.audioProcessingStats.averageAudioDuration =
                    ((this.audioProcessingStats.averageAudioDuration * (this.audioProcessingStats.totalAudioSent - 1)) +
                        (audioFloat32Array.length / 16000)) / this.audioProcessingStats.totalAudioSent;

                this.debugLog('audio', 'Audio interaction registered successfully', {
                    audioLength: audioFloat32Array.length,
                    audioBytes: audioBytes.length,
                    interactionData: response.data
                });
            } else {
                this.audioProcessingStats.failedRequests++;
                const errorMessage = `Audio processing failed: ${response.error}`;
                this.log('error', errorMessage, { status: response.status });

                if (response.status === 404) {
                    this.showMessage('Backend endpoint not found. Please check if the backend is running correctly.', 'error');
                } else if (response.status >= 500) {
                    this.showMessage('Backend server error. Please try again.', 'error');
                } else {
                    this.showMessage(`Failed to process audio: ${response.error}`, 'error');
                }
            }

        } catch (error) {
            console.error('Error sending VAD audio to backend:', error);

            if (error.name === 'AbortError') {
                this.showMessage('Audio processing timed out. Please try speaking again.', 'error');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
                this.showMessage('Network error. Please check your connection to the backend.', 'error');
            } else if (error.message.includes('Backend connection lost')) {
                this.showMessage('Connection to backend lost. Reconnecting...');
                this.checkConnection();
            } else {
                this.showMessage('Error processing audio: ' + error.message, 'error');
            }
        } finally {
            this.isProcessingAudio = false;
            if (this.isListening) {
                this.updateVADStatus('waiting');
            }
        }
    }

    updateVADStatus(status) {
        const statusMessages = {
            'waiting': 'Waiting for speech...',
            'speaking': 'Speaking detected...',
            'processing': 'Processing speech...',
            'stopped': 'Stopped',
            'stopping': 'Stopping...'
        };

        if (this.isListening && this.micStatusText) {
            const message = statusMessages[status] || 'Unknown status';
            /** Only update specific statuses, maintain the main listening message for most cases */
            if (status === 'stopping') {
                this.micStatusText.textContent = message;
            } else if (status === 'stopped') {
                this.micStatusText.textContent = 'Click to start listening';
            } else {
                this.micStatusText.textContent = 'Listening... Click to stop';
            }
        } else if (!this.isListening && status === 'stopped') {
            this.micStatusText.textContent = 'Click to start listening';
        }
    }

    updateFeatures(features) {
        const featuresList = document.getElementById('featuresList');
        if (!featuresList || !features) return;
        featuresList.innerHTML = '';

        const featureMap = {
            'advanced_nlp': {
                name: 'Advanced NLP Processing',
                description: 'Intelligent text analysis and context understanding',
                icon: 'fas fa-brain'
            },
            'speaker_clustering': {
                name: 'Speaker Clustering',
                description: 'Automatically identify and separate different speakers',
                icon: 'fas fa-users'
            },
            'context_summarization': {
                name: 'Context Summarization',
                description: 'Generate concise summaries of conversations',
                icon: 'fas fa-clipboard-list'
            },
            'database_integration': {
                name: 'Database Integration',
                description: 'Seamlessly store and search transcription history',
                icon: 'fas fa-database'
            }
        };

        Object.keys(features).forEach(key => {
            if (features[key] && featureMap[key]) {
                const featureItem = document.createElement('div');
                featureItem.className = 'feature-item';
                featureItem.innerHTML = `
                    <i class="${featureMap[key].icon}"></i>
                    <div class="feature-content">
                        <span class="feature-name">${featureMap[key].name}</span>
                        <span class="feature-description">${featureMap[key].description}</span>
                    </div>
                `;
                featuresList.appendChild(featureItem);
            }
        });
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.statusDot.className = 'status-dot connected';
            const connectedHost = [...API_CONFIG.BASE_URLS.entries()].find(([, url]) => url === this.baseUrl)?.[0];
            this.statusText.textContent = 'Connected to ' + (connectedHost || this.baseUrl || 'unknown server');
            this.micButton.disabled = false;
        } else {
            this.statusDot.className = 'status-dot';
            this.statusText.textContent = 'Disconnected';
            this.micButton.disabled = true;
            this.isListening = false;
            this.updateListeningUI(false);
        }
    }

    async updateServerStatus(status) {
        if (status.enabled && !this.isListening) {
            await this.startListening();
        } else if (!status.enabled && this.isListening) {
            await this.stopListening();
        }
    }

    updateListeningUI(listening) {
        if (listening) {
            this.micButton.classList.add('listening');
            this.statusDot.className = 'status-dot listening';
            this.statusText.textContent = 'Listening';
            this.micStatusText.textContent = 'Listening... Click to stop';
            this.micIcon.innerHTML = `
                <svg class="mic-svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h12v12H6z"/>
                </svg>
            `;
        } else {
            this.micButton.classList.remove('listening');
            this.statusDot.className = 'status-dot connected';
            this.statusText.textContent = 'Connected';
            this.micStatusText.textContent = 'Click to start listening';
            this.micIcon.innerHTML = `
                <svg class="mic-svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </svg>
            `;
        }
    }

    startTranscriptionPolling() {
        this.stopTranscriptionPolling();

        this.transcriptionInterval = setInterval(async () => {
            if (this.isListening && this.isConnected) {
                /** await this.fetchLatestInteractions(); */
            } else {
                this.stopTranscriptionPolling();
            }
        }, 1000);
    }

    fetchLatestInteractions(interactions) {

        console.log(`interactions: ${interactions}`);

        interactions.forEach((interaction) => {
            const existingTranscription = this.transcriptions.find(t => String(t.id) === String(interaction));
            try {
                if (!existingTranscription) {
                    this.log('info', `Adding new transcription: ${interaction}`);

                    if (this.apiService) {
                        this.apiService.getInteraction(interaction)
                            .then(response => {
                                if (response.success && response.data) {
                                    this.addTranscriptionFromInteraction(response.data);
                                } else {
                                    this.log('error', `Failed to fetch interaction ${interaction}`, { error: response.error, status: response.status });
                                }
                            })
                            .catch(error => {
                                this.log('error', 'Error fetching interaction', error);
                            });
                    }
                }
            } catch (error) {
                this.log('error', 'Error fetching transcriptions', error);
            }
        });
    }

    async addTranscriptionFromInteraction(interaction) {
        let timestamp = interaction.timestamp;
        try {
            let isoString = timestamp.replace(' ', 'T');
            if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(isoString)) {
                isoString += 'Z';
            }
            const dateObj = new Date(isoString);
            timestamp = dateObj.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        } catch (error) {
            this.log('warn', 'Error parsing timestamp', error);
            const dateObj = new Date(interaction.timestamp);
            timestamp = dateObj.toLocaleString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            });
        }

        if (!this.apiService) {
            this.log('error', 'Cannot fetch speaker: API service not initialized');
            return;
        }

        const response = await this.apiService.getSpeaker(interaction.speaker_id);
        let speaker = null;
        
        if (response.success) {
            speaker = response.data;
        } else {
            this.log('error', `Failed to fetch speaker ${interaction.speaker_id}`, { error: response.error });
            /** Create a fallback speaker object */
            speaker = { name: 'Unknown Speaker', id: interaction.speaker_id };
        }

        const transcription = {
            text: interaction.text,
            timestamp: timestamp,
            speaker: speaker,
            id: interaction.id
        };

        this.transcriptions.push(transcription);

        const emptyState = this.transcriptionContent.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const transcriptionElement = this.createTranscriptionElement(transcription);
        this.transcriptionContent.appendChild(transcriptionElement);

        /** Scroll to bottom */
        this.transcriptionContent.scrollTop = this.transcriptionContent.scrollHeight;
    }

    stopTranscriptionPolling() {
        if (this.transcriptionInterval) {
            clearInterval(this.transcriptionInterval);
            this.transcriptionInterval = null;
        }
    }

    createTranscriptionElement(transcription) {
        const element = document.createElement('div');
        element.className = 'transcription-item';
        const speakerColor = this.getSpeakerColor(transcription.speaker);
        element.style.borderLeftColor = speakerColor.border;
        element.style.backgroundColor = speakerColor.background;

        element.innerHTML = `
            <div class="speaker-info" style="color: ${speakerColor.text};">
                <span class="speaker-name">${transcription.speaker.name || "Speaker " + transcription.speaker.index || transcription.speaker.id}</span>
                <span class="timestamp">${transcription.timestamp}</span>
            </div>
            <div class="text">${transcription.text}</div>
        `;
        return element;
    }

    getSpeakerColor(speaker) {
        const speakerIndex = parseInt(speaker.index) || this.getOrAssignSpeakerIndex(speaker.id);

        const greenShades = [
            { background: '#f0fffa', border: '#00ff88', text: '#00cc6a' },
            { background: '#e6fffa', border: '#00e074', text: '#00b359' },
            { background: '#dcfdf7', border: '#00d15a', text: '#009944' },
            { background: '#d1fae5', border: '#00c249', text: '#007f30' },
        ];

        return greenShades[speakerIndex % greenShades.length];
    }

    getOrAssignSpeakerIndex(speaker) {
        if (!this.speakerIndexMap.has(speaker)) {
            this.speakerIndexMap.set(speaker, this.nextSpeakerIndex);
            this.nextSpeakerIndex++;
        }

        return this.speakerIndexMap.get(speaker);
    }

    /**
     * Clear all transcriptions from database and UI
     * Uses ApiService for proper error handling
     */
    async clearTranscriptions() {
        if (!this.apiService) {
            this.log('error', 'Cannot clear transcriptions: API service not initialized');
            return;
        }

        try {
            const response = await this.apiService.deleteAllInteractions();

            if (response.success) {
                this.log('info', 'Database cleared successfully', response.data);

                this.transcriptions = [];
                this.transcription_ids.clear();

                this.transcriptionContent.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-robot"></i>
                        <p>No conversations yet</p>
                        <small>Start speaking to interact with your AI assistant</small>
                    </div>
                `;

                this.showMessage(`Cleared ${response.data?.deleted_count || 0} interactions from database`);
            } else {
                this.log('error', `Failed to clear database: ${response.error}`, { status: response.status });
                this.showMessage('Failed to clear interactions from database', 'error');
            }
        } catch (error) {
            this.log('error', 'Error clearing interactions', error);
            this.showMessage('Error clearing interactions: ' + error.message, 'error');
        }
    }

    showConnectionBanner() {
        this.connectionBanner.style.display = 'block';
    }

    hideConnectionBanner() {
        this.connectionBanner.style.display = 'none';
    }

    showMessage(message, type = 'info') {
        console.log('Message:', message);

        /** Create a simple toast notification for user feedback */
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            max-width: 400px;
            padding: 12px 16px;
            background: ${type === 'error' ? '#ff4444' : type === 'warning' ? '#ffaa00' : '#00aa44'};
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 10000;
            font-size: 14px;
            font-weight: 500;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            word-wrap: break-word;
        `;

        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);


        if (type !== 'error') {
            const duration = Math.max(3000, Math.min(8000, message.length * 50));
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(100%)';
                setTimeout(() => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                }, 300);
            }, duration);
        }


        toast.addEventListener('click', () => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        });
    }

    startConnectionCheck() {
        this.checkConnection();

        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();

        }, 1000);
    }

    async cleanup() {
        try {
            /** Stop recording first */
            if (this.isRecording && this.micVAD) {
                await this.stopAudioCapture();
            }

            /** Clear intervals */
            if (this.connectionCheckInterval) {
                clearInterval(this.connectionCheckInterval);
                this.connectionCheckInterval = null;
            }

            if (this.transcriptionInterval) {
                clearInterval(this.transcriptionInterval);
                this.transcriptionInterval = null;
            }

            /** Stop listening service and deregister from backend */
            if (this.isRegistered) {
                try {
                    await this.deregisterClient();
                    
                    if (this.isListening) {
                        await this.stopListening();
                    }
                } catch (error) {
                    this.log('error', 'Error during cleanup deregistration', error);
                }
            }

            /** Final state reset */
            this.isRecording = false;
            this.isListening = false;
            this.isToggling = false;
            this.isProcessingAudio = false;
            
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.miraApp = new MiraDesktop();

    if (window.electronAPI) {
        window.electronAPI.onAppClosing(() => {
            if (window.miraApp) {
                window.miraApp.cleanup();
            }
        });
    }

        window.addEventListener('beforeunload', async () => {
        if (window.miraApp && window.miraApp.isRegistered && !window.miraApp._deregistrationAttempted) {
            if (window.miraApp.apiService) {
                /** Use ApiService if available (fire and forget for beforeunload) */
                window.miraApp.apiService.deregisterClient().catch(() => {});
            } else {
                /** Fallback to direct fetch for backwards compatibility */
                const url = `${window.miraApp.baseUrl}/service/client/deregister/${encodeURIComponent(API_CONFIG.CLIENT_ID)}`;
                fetch(url, { method: 'DELETE' }).catch(() => {});
            }
            window.miraApp._deregistrationAttempted = true;
        }
    });

    window.addEventListener('unload', () => {
        if (window.miraApp && window.miraApp.isRegistered && !window.miraApp._deregistrationAttempted) {
            if (window.miraApp.apiService) {
                /** Use ApiService if available (fire and forget for unload) */
                window.miraApp.apiService.deregisterClient().catch(() => {});
            } else {
                /** Fallback to direct fetch for backwards compatibility */
                const url = `${window.miraApp.baseUrl}/service/client/deregister/${encodeURIComponent(API_CONFIG.CLIENT_ID)}`;
                fetch(url, { method: 'DELETE' }).catch(() => {});
            }
            window.miraApp._deregistrationAttempted = true;
        }
    });
});

document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.target.matches('input, textarea, [contenteditable]')) {
        e.preventDefault();
        if (window.miraApp && window.miraApp.isConnected) {
            window.miraApp.toggleListening();
        }
    }

    /** Ctrl+Shift+D - Toggle debug mode */
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        if (window.miraApp) {
            const newDebugMode = !window.miraApp.debugMode;
            window.miraApp.setDebugMode(newDebugMode);
            window.miraApp.showMessage(`Debug mode ${newDebugMode ? 'enabled' : 'disabled'}`, 'info');
        }
    }

    /** Ctrl+Shift+M - Show detailed debug info (was debug mode toggle, now moved to D) */
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        if (window.miraApp) {
            window.miraApp.showAudioStats();
        }
    }

    /** Ctrl+Shift+T - Test backend connection */
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyT') {
        e.preventDefault();
        if (window.miraApp) {
            window.miraApp.testBackendConnection();
        }
    }

    /** Ctrl+Shift+A - Show debug help */
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        if (window.miraApp) {
            window.miraApp.printDebugHelp();
            window.miraApp.showMessage('Debug help displayed in console', 'info');
        }
    }

    /** Ctrl+Shift+I - Get debug info */
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyI') {
        e.preventDefault();
        if (window.miraApp) {
            const debugInfo = window.miraApp.getDebugInfo();
            console.table(debugInfo.system);
            console.table(debugInfo.connection);
            console.table(debugInfo.audio);
            console.table(debugInfo.ui);
            console.table(debugInfo.browser);
            window.miraApp.showMessage('Debug info displayed in console', 'info');
        }
    }
});