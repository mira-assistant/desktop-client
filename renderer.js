import { API_CONFIG, AUDIO_CONFIG, UI_CONFIG, DEBUG_CONFIG, ERROR_MESSAGES, SUCCESS_MESSAGES } from './constants.js';
import { ApiService } from './api.js';

/**
 * MiraDesktop - Main application class for the Mira Desktop Client
 * Handles audio recording, interaction, and backend communication
 */
class MiraDesktop {
    /**
     * Initialize the MiraDesktop application
     */
    constructor() {
        /** Initialize API service that manages its own connection */
        this.apiService = new ApiService();

        /** Local state (not available via API service) */
        this.isListening = false;
        this.isToggling = false;
        this.isProcessingAudio = false;
        this.isDeregistering = false;
        this.isTogglingAudioCapture = false;

        /** Interaction data */
        this.interactions = [];

        /** Person management */
        this.personIndexMap = new Map();
        this.nextPersonIndex = 0;

        /** Notification management */
        this.activeNotifications = [];
        this.notificationContainer = null;

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

        /** Set up API service event listeners */
        this.initializeElements();
        this.setupEventListeners();
        this.setupApiEventListeners();

        /** Initialize connection banner state - start as disconnected */
        this.showConnectionBanner();

        /** Initialize notification container */
        this.initializeNotificationContainer();
    }

    /**
     * Set up event listeners for API service events
     */
    setupApiEventListeners() {
        /** Listen for connection changes, complete disconnection, or new host */
        this.apiService.addEventListener('connectionChange', (event) => {
            const { connected, hostName, url } = event.detail;

            if (connected) {
                this.updateConnectionStatus(true);
                this.hideConnectionBanner();

                /** Log successful connection */
                this.log('info', `Connected to ${hostName} at ${url}`);
            }

            else {
                this.updateConnectionStatus(false);
                this.showConnectionBanner();

                /** Connection lost - let statusChange handle listening state through health checks */
            }
        });

        /** Listen for service status changes */
        this.apiService.addEventListener('statusChange', (event) => {
            const { enabled } = event.detail;
            this.updateServerStatus({ enabled });

            /** Manage listening state based on service status */
            this.manageListeningState(enabled);
        });

        /** Listen for interaction updates */
        this.apiService.addEventListener('interactionsUpdated', (event) => {
            const { interactionIds } = event.detail;
            this.fetchLatestInteractions(interactionIds);
        });
    }

    initializeElements() {
        this.micButton = document.getElementById('micButton');
        this.micIcon = document.getElementById('micIcon');
        this.micStatusText = document.getElementById('micStatusText');
        this.statusDot = document.getElementById('statusDot');
        this.statusText = document.getElementById('statusText');
        this.interactionContent = document.getElementById('interactionContent');
        this.clearButton = document.getElementById('clearButton');
        this.connectionBanner = document.getElementById('connectionBanner');
        this.retryButton = document.getElementById('retryButton');
        this.rippleEffect = document.getElementById('rippleEffect');
        this.clientNameInput = document.getElementById('clientNameInput');
        this.toolTip = document.getElementById('custom-tooltip');
        this.statusIndicator = document.getElementById('statusIndicator');

        // Speaker training elements
        this.trainingGlyph = document.getElementById('trainingGlyph');
        this.trainingOverlay = document.getElementById('trainingOverlay');
        this.speakerSelect = document.getElementById('speakerSelect');
        this.speakerNameInput = document.getElementById('speakerNameInput');
        this.startTrainingBtn = document.getElementById('startTrainingBtn');
        this.cancelTrainingBtn = document.getElementById('cancelTrainingBtn');
        this.trainingProgress = document.getElementById('trainingProgress');
        this.recordBtn = document.getElementById('recordBtn');
        this.progressText = document.getElementById('progressText');
        this.progressFill = document.getElementById('progressFill');
        this.promptText = document.getElementById('promptText');

        // Training state
        this.isTraining = false;
        this.currentTrainingStep = 0;
        this.selectedSpeaker = null;
        this.trainingPrompts = [
            "The quick brown fox jumps over the lazy dog.",
            "How now brown cow, the rain in Spain falls mainly on the plain.",
            "She sells seashells by the seashore, but the shells she sells are seashells for sure.",
            "Peter Piper picked a peck of pickled peppers, a peck of pickled peppers Peter Piper picked."
        ];
        this.trainingRecordings = [];
        this.trainingMicVAD = null;
    }

    /**
     * Unified function to manage listening state based on service enabled status
     * Handles enabling/disabling audio streams, MicVAD systems, and all listening components
     * @param {boolean} enabled - Whether the service should be enabled
     */
    async manageListeningState(enabled) {
        try {
            if (enabled && !this.isListening) {
                /** Enable listening: start audio capture and interaction */
                await this.startAudioCapture();
                this.isListening = true;
                this.updateListeningUI(true);
                this.log('info', SUCCESS_MESSAGES.AUDIO_START);
                this.debugLog('audio', 'Listening enabled via state management', {
                    serviceEnabled: true,
                    vadInitialized: !!this.micVAD
                });
            } else if (!enabled && this.isListening) {
                /** Disable listening: stop audio capture and cleanup */
                await this.stopAudioCapture();
                this.isListening = false;
                this.updateListeningUI(false);
                this.log('info', 'Listening disabled via state management');
                this.debugLog('audio', 'Listening disabled via state management', {
                    serviceEnabled: false,
                    vadDestroyed: !this.micVAD
                });
            }
        }

        catch (error) {
            this.log('error', 'Error in manageListeningState', error);
            /** Ensure cleanup on error */
            if (!enabled) {
                await this.stopAudioCapture();
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopInteractionPolling();
            }
        }
    }

    setupEventListeners() {
        this.micButton.addEventListener('click', () => this.toggleListening());
        this.clearButton.addEventListener('click', () => this.clearInteractions());
        this.retryButton.addEventListener('click', () => this.handleRetryConnection());

        // Speaker training event listeners
        this.trainingGlyph.addEventListener('click', () => this.showTrainingDialog());
        this.cancelTrainingBtn.addEventListener('click', () => this.hideTrainingDialog());
        this.startTrainingBtn.addEventListener('click', () => this.startTrainingProcess());
        this.speakerSelect.addEventListener('change', () => this.handleSpeakerSelection());
        this.recordBtn.addEventListener('click', () => this.handleTrainingRecord());

        this.statusIndicator.addEventListener('mouseenter', () => {
            if (this.apiService.isConnected && this.apiService.baseUrl) {
                this.toolTip.textContent = `Backend URL: ${this.apiService.baseUrl}/`;
            } else {
                this.toolTip.textContent = 'Not connected to backend';
            }

            const elementRect = this.statusIndicator.getBoundingClientRect();
            const tooltipRect = this.toolTip.getBoundingClientRect();

            let left = elementRect.left + elementRect.width / 2 - tooltipRect.width / 2;

            this.toolTip.style.left = `${left}px`;
            this.toolTip.style.top = `60px`;
            this.toolTip.className = `custom-tooltip`;

            requestAnimationFrame(() => {
                this.toolTip.classList.add('show');
            });
        });

        this.statusIndicator.addEventListener('mouseleave', () => {
            this.toolTip.classList.remove('show');
        });

        this.clientNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.handleClientNameChange(e.target.value);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.toggleListening();
            }
        });
    }

    /**
     * Handle client name change from input field
     * @param {string} newClientName - New client name
     */
    /**
     * Handle retry connection button click with visual feedback
     */
    handleRetryConnection() {
        this.showMessage('Attempting to reconnect...', 'info');
        this.apiService.checkConnection();
    }

    /**
     * Handle client name change when user presses Enter
     * @param {string} newClientName - New client name input
     */
    async handleClientNameChange(newClientName) {
        if (!newClientName || newClientName.trim() === '') {
            /** Reset to current client ID if empty */
            this.clientNameInput.value = this.apiService.clientId;
            return;
        }

        const success = await this.apiService.updateClientId(newClientName.trim());
        if (success) {
            this.log('info', `Client name updated to: ${this.apiService.clientId}`);
            this.debugLog('client', 'Client name changed successfully', {
                newClientName: this.apiService.clientId,
                connected: this.apiService.isConnected
            });

            /** Show success message and make text appear gray/placeholder-like */
            this.showMessage(`Client name updated to: ${this.apiService.clientId}`, 'info');
            this.clientNameInput.style.color = '#999';
            this.clientNameInput.value = this.apiService.clientId;

            /** Reset text color after a short delay */
            setTimeout(() => {
                this.clientNameInput.style.color = '';
            }, 2000);
        }

        else {
            /** Revert input on failure */
            this.clientNameInput.value = this.apiService.clientId;
            this.log('warn', 'Failed to update client name - reverted to previous name');
            this.showMessage('Failed to update client name', 'error');
        }
    }

    /**
     * Enhanced logging method with debug levels and proper console methods
     * @param {string} level - Log level: 'error', 'warn', 'info', 'debug'
     * @param {string} message - Log message
     * @param {any} data - Optional data to log
     */
    log(level, message, data = null) {
        const levels = DEBUG_CONFIG.LOG_LEVELS;
        const currentLevel = DEBUG_CONFIG.DEBUG_MODE ? DEBUG_CONFIG.LOG_LEVELS.DEBUG : DEBUG_CONFIG.LOG_LEVELS.INFO;

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
                if (DEBUG_CONFIG.DEBUG_MODE) {
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
        if (DEBUG_CONFIG.DEBUG_MODE) {
            this.log('debug', `[${category.toUpperCase()}] ${message}`, {
                timestamp: Date.now(),
                debugData: data,
                appState: {
                    isConnected: this.apiService.isConnected,
                    isListening: this.isListening,
                    isRecording: this.isRecording,
                    isRegistered: this.apiService.isRegistered
                }
            });
        }
    }

    /**
     * Check connection to available servers
     * Wrapper method that delegates to API service
     */
    async checkConnection() {
        return this.apiService.checkConnection();
    }

    /**
     * Register client with backend service
     * Uses ApiService for proper error handling and response parsing
     */
    async registerClient() {
        try {
            const success = await this.apiService.registerClient();

            if (success) {
                this.log('info', SUCCESS_MESSAGES.REGISTRATION);
                this.debugLog('api', 'Client registration successful', { clientId: API_CONFIG.CLIENT_ID });
            }

            else {
                this.log('error', 'Failed to register client');
            }
        }

        catch (error) {
            this.log('error', `Client registration error: ${error.message}`);
        }
    }

    /**
     * Deregister client from backend service
     * Uses ApiService for proper cleanup and error handling
     */
    async deregisterClient() {
        if (this.isDeregistering) {
            return;
        }

        this.isDeregistering = true;
        try {
            const success = await this.apiService.deregisterClient();

            if (success) {
                this.log('info', 'Client deregistered successfully');
                this.debugLog('api', 'Client deregistration successful', { clientId: API_CONFIG.CLIENT_ID });
            }

            else {
                this.log('error', 'Failed to deregister client');
            }
        }

        catch (error) {
            this.log('error', `Client deregistration error: ${error.message}`);
        }
    }

    async toggleListening() {
        if (!this.apiService.isConnected) {
            this.showMessage('Please wait for connection to the backend server');
            return;
        }

        // Wait until audio capture is not toggling (ready)
        async function waitTilAudioCaptureReady(ctx) {
            while (ctx.isTogglingAudioCapture) {
                console.log('Waiting for audio capture to be ready...');
                await new Promise(resolve => setTimeout(resolve, 50));
            }
        }

        if (this.isToggling) {
            return;
        }

        this.isToggling = true;

        try {
            /** Provide immediate UI feedback */
            this.micButton.disabled = true;
            this.micButton.style.opacity = UI_CONFIG.OPACITY.DISABLED;
            this.micStatusText.textContent = this.isListening ? 'Stopping...' : 'Starting...';
            this.isTogglingAudioCapture = true;

            if (this.isListening) {
                /** Send disable request to backend - state management will handle cleanup */
                const success = await this.apiService.disableService();

                if (!success) {
                    throw new Error('Failed to send disable request to backend');
                }
            }

            else {
                /** Send enable request to backend - state management will handle audio start */
                const success = await this.apiService.enableService();

                if (!success) {
                    throw new Error('Failed to send enable request to backend');
                }
            }

            await waitTilAudioCaptureReady(this);

        }

        catch (error) {
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
                isConnected: this.apiService.isConnected,
                isListening: this.isListening,
                isRecording: this.isRecording
            });

        }

        finally {
            this.micButton.disabled = false;
            this.updateListeningUI(this.isListening);
            this.isToggling = false;
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
            this.log('info', 'Starting audio capture process');

            this.isTogglingAudioCapture = true;
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
            const sampleRate = AUDIO_CONFIG.VAD_SETTINGS.SAMPLE_RATE;
            const frameSamples = AUDIO_CONFIG.VAD_SETTINGS.FRAME_SAMPLES;
            const targetSilenceMs = AUDIO_CONFIG.VAD_SETTINGS.TARGET_SILENCE_MS;
            const redemptionFrames = Math.max(1, Math.round((targetSilenceMs * sampleRate) / (frameSamples * 1000)));

            const vadInitPromise = MicVAD.new({
                model: 'legacy',

                /** Optimized thresholds for better noise rejection */
                positiveSpeechThreshold: AUDIO_CONFIG.VAD_THRESHOLDS.POSITIVE_SPEECH,
                negativeSpeechThreshold: AUDIO_CONFIG.VAD_THRESHOLDS.NEGATIVE_SPEECH,

                redemptionFrames: redemptionFrames,

                /** Audio quality settings optimized for interaction */
                frameSamples: frameSamples,
                preSpeechPadFrames: AUDIO_CONFIG.VAD_SETTINGS.PRE_SPEECH_PAD_FRAMES,
                minSpeechFrames: AUDIO_CONFIG.VAD_SETTINGS.MIN_SPEECH_FRAMES,

                /** Enhanced audio constraints for maximum quality */
                additionalAudioConstraints: {
                    sampleRate: AUDIO_CONFIG.CONSTRAINTS.SAMPLE_RATE,
                    echoCancellation: AUDIO_CONFIG.CONSTRAINTS.ECHO_CANCELLATION,
                    noiseSuppression: AUDIO_CONFIG.CONSTRAINTS.NOISE_SUPPRESSION,
                    autoGainControl: AUDIO_CONFIG.CONSTRAINTS.AUTO_GAIN_CONTROL,
                    channelCount: AUDIO_CONFIG.CONSTRAINTS.CHANNELS,

                    /** Advanced constraints for better audio quality */
                    googEchoCancellation: AUDIO_CONFIG.CONSTRAINTS.GOOGLE_ECHO_CANCELLATION,
                    googAutoGainControl: AUDIO_CONFIG.CONSTRAINTS.GOOGLE_AUTO_GAIN_CONTROL,
                    googNoiseSuppression: AUDIO_CONFIG.CONSTRAINTS.GOOGLE_NOISE_SUPPRESSION,
                    googHighpassFilter: AUDIO_CONFIG.CONSTRAINTS.GOOGLE_HIGHPASS_FILTER,
                    googAudioMirroring: AUDIO_CONFIG.CONSTRAINTS.GOOGLE_AUDIO_MIRRORING,
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
                        }

                        else {
                            this.updateVADStatus('waiting');
                        }
                    }

                    catch (err) {
                        this.log('error', 'VAD error in onSpeechEnd callback', err);
                        this.updateVADStatus('waiting');
                    }
                },

                onVADMisfire: () => {
                    this.updateVADStatus('waiting');
                },

                onFrameProcessed: (probabilities) => {
                    /** Enhanced debug mode logging for frame processing */
                    if (DEBUG_CONFIG.DEBUG_MODE) {
                        this.debugLog('vad', 'Frame processed', {
                            probabilities: probabilities,
                            isRecording: this.isRecording,
                            vadStatus: this.micStatusText?.textContent,
                            audioOptimization: {
                                enableAdvancedNoiseReduction: AUDIO_CONFIG.OPTIMIZATION.ENABLE_ADVANCED_NOISE_REDUCTION,
                                enableDynamicGainControl: AUDIO_CONFIG.OPTIMIZATION.ENABLE_DYNAMIC_GAIN_CONTROL,
                                enableSpectralGating: AUDIO_CONFIG.OPTIMIZATION.ENABLE_SPECTRAL_GATING,
                                noiseFloor: AUDIO_CONFIG.OPTIMIZATION.NOISE_FLOOR,
                                signalThreshold: AUDIO_CONFIG.OPTIMIZATION.SIGNAL_THRESHOLD,
                                adaptiveThresholds: AUDIO_CONFIG.OPTIMIZATION.ENABLE_ADAPTIVE_THRESHOLDS,
                                environmentalNoise: AUDIO_CONFIG.OPTIMIZATION.ENVIRONMENTAL_NOISE,
                                lastNoiseAnalysis: AUDIO_CONFIG.OPTIMIZATION.LAST_NOISE_ANALYSIS
                            }
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
        }

        catch (error) {
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
            }

            else {
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

        finally {
            this.isTogglingAudioCapture = false;
        }
    }

    /**
     * Stop audio capture with complete VAD destruction and state verification
     * Enhanced error handling and debugging for stop recording functionality
     */
    async stopAudioCapture() {

        try {
            this.log('info', 'Stopping audio capture process');
            /** Set recording state to false immediately to prevent new processing */
            this.isRecording = false;
            this.isTogglingAudioCapture = true;

            if (this.micVAD) {
                this.debugLog('audio', 'VAD destruction initiated', {
                    vadExists: !!this.micVAD,
                    isRecording: this.isRecording
                });

                try {
                    /** Call destroy method on VAD */
                    await this.micVAD.destroy();
                }

                catch (vadError) {
                    this.log('error', 'Error calling VAD.destroy()', vadError);
                    /** Continue with cleanup even if destroy fails */
                }

                /** Additional cleanup: manually stop any remaining audio tracks */
                await this.forceStopAllAudioTracks();

                /** Clear the VAD reference */
                this.micVAD = null;
            }

            /** Verify that recording has actually stopped */
            await this.verifyRecordingIsStopped();

            /** Update VAD status */
            this.updateVADStatus('stopped');
            this.log('info', 'Audio capture stopped successfully');

        }

        catch (error) {
            this.log('error', 'Error stopping VAD audio capture', error);

            /** Force cleanup even if there are errors */
            try {
                await this.forceStopAllAudioTracks();
                this.micVAD = null;
                this.isRecording = false;
                this.updateVADStatus('stopped');
                this.log('info', 'Forced cleanup completed');
            }

            catch (forceError) {
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

        finally {
            this.isTogglingAudioCapture = false;
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
            }

            catch {
                /** Ignore permission check errors - this is just a verification step */
            }

            /** The VAD library should clean up its own streams, but let's add a verification step */
            /** We'll try to create a new temporary stream to verify microphone access is properly released */
            await this.verifyMicrophoneIsReleased();

        }

        catch (error) {
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

        }

        catch (error) {
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
        // TODO: Need to implement

        if (this.isRecording) {
            console.log('Recording state verification - isRecording:', this.isRecording, 'micVAD:', !!this.micVAD);
        }
    }


    /**
     * Get comprehensive debug information
     * @returns {Object} Debug information object
     */
    getDebugInfo() {
        const debugInfo = {
            system: {
                debugMode: DEBUG_CONFIG.DEBUG_MODE,
                debugLevel: DEBUG_CONFIG.LOG_LEVELS.DEBUG,
                userAgent: navigator.userAgent,
                timestamp: new Date().toISOString()
            },
            connection: {
                isConnected: this.apiService.isConnected,
                isRegistered: this.apiService.isRegistered,
                baseUrl: this.apiService.baseUrl,
                clientId: API_CONFIG.CLIENT_ID,
                apiServiceInitialized: !!this.apiService
            },
            audio: {
                isListening: this.isListening,
                isRecording: this.isRecording,
                isProcessingAudio: this.isProcessingAudio,
                vadInitialized: !!this.micVAD,
                audioOptimization: {
                    enableAdvancedNoiseReduction: AUDIO_CONFIG.OPTIMIZATION.ENABLE_ADVANCED_NOISE_REDUCTION,
                    enableDynamicGainControl: AUDIO_CONFIG.OPTIMIZATION.ENABLE_DYNAMIC_GAIN_CONTROL,
                    enableSpectralGating: AUDIO_CONFIG.OPTIMIZATION.ENABLE_SPECTRAL_GATING,
                    noiseFloor: AUDIO_CONFIG.OPTIMIZATION.NOISE_FLOOR,
                    signalThreshold: AUDIO_CONFIG.OPTIMIZATION.SIGNAL_THRESHOLD,
                    adaptiveThresholds: AUDIO_CONFIG.OPTIMIZATION.ADAPTIVE_THRESHOLDS,
                    environmentalNoise: AUDIO_CONFIG.OPTIMIZATION.ENVIRONMENTAL_NOISE,
                    lastNoiseAnalysis: AUDIO_CONFIG.OPTIMIZATION.LAST_NOISE_ANALYSIS
                },
                audioProcessingStats: { ...this.audioProcessingStats }
            },
            ui: {
                interactionCount: this.interactions.length,
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

        if (DEBUG_CONFIG.DEBUG_MODE) {
            this.log('debug', 'Debug info requested', debugInfo);
        }

        return debugInfo;
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
            if (AUDIO_CONFIG.OPTIMIZATION.ENABLE_ADVANCED_NOISE_REDUCTION) {
                processedAudio = this.applyNoiseReduction(processedAudio, audioAnalysis);
            }

            /** Step 3: Apply dynamic gain control */
            if (AUDIO_CONFIG.OPTIMIZATION.ENABLE_DYNAMIC_GAIN_CONTROL) {
                processedAudio = this.applyDynamicGainControl(processedAudio, audioAnalysis);
            }

            /** Step 4: Apply spectral gating for further noise reduction */
            if (AUDIO_CONFIG.OPTIMIZATION.ENABLE_SPECTRAL_GATING) {
                processedAudio = this.applySpectralGating(processedAudio, audioAnalysis);
            }

            /** Step 5: Final quality check */
            const finalAnalysis = this.analyzeAudioQuality(processedAudio);

            /** Step 6: Only send if audio quality is sufficient */
            if (finalAnalysis.snr > AUDIO_CONFIG.OPTIMIZATION.SIGNAL_THRESHOLD) {
                await this.sendVADAudioToBackend(processedAudio);
            }

            else {
                this.updateVADStatus('waiting');
            }

        }

        catch (error) {
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
            }

            else {
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

        /** Calculate target RMS level - optimal level for interaction */
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
            if (!this.apiService.isConnected || !this.apiService) {
                throw new Error(ERROR_MESSAGES.BACKEND.SERVICE_UNAVAILABLE);
            }

            /** Use ApiService to register interaction */
            const interactionData = await this.apiService.registerInteraction(audioBytes.buffer, 'wav');

            if (interactionData) {
                // Handle different response types
                if (interactionData.type === 'message') {
                    // Display agent message without updating UI stats
                    this.showMessage(interactionData.message, interactionData.level);
                } else if (interactionData.id) {
                    // Handle interaction object - update stats and trigger inference
                    this.audioProcessingStats.successfulRequests++;
                    this.audioProcessingStats.totalAudioSent++;
                    this.audioProcessingStats.totalAudioBytes += audioBytes.length;
                    this.audioProcessingStats.averageAudioDuration =
                        ((this.audioProcessingStats.averageAudioDuration * (this.audioProcessingStats.totalAudioSent - 1)) +
                            (audioFloat32Array.length / 16000)) / this.audioProcessingStats.totalAudioSent;

                    this.debugLog('audio', 'Audio interaction registered successfully', {
                        audioLength: audioFloat32Array.length,
                        audioBytes: audioBytes.length,
                        interactionData: interactionData
                    });

                    // Trigger inference pipeline in background
                    this.apiService.triggerInferencePipeline(interactionData.id).catch(error => {
                        this.debugLog('api', 'Failed to trigger inference pipeline', {
                            interactionId: interactionData.id,
                            error: error.message
                        });
                    });
                }
            } else {
                // Handle null response (e.g., when disabling Mira via voice)
                // Suppress UI updates as requested
                this.audioProcessingStats.failedRequests++;
                this.debugLog('audio', 'Interaction returned null - likely voice disable command');
            }

        }

        catch (error) {
            console.error('Error sending VAD audio to backend:', error);

            if (error.name === 'AbortError') {
                this.showMessage('Audio processing timed out. Please try speaking again.', 'error');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
                this.showMessage('Network error. Please check your connection to the backend.', 'error');
            } else if (error.message.includes('Backend connection lost')) {
                this.showMessage('Connection to backend lost. Reconnecting...');
                this.checkConnection();
            }

            else {
                this.showMessage('Error processing audio: ' + error.message, 'error');
            }
        }

        finally {
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
            }

            else {
                this.micStatusText.textContent = 'Listening... Click to stop';
            }
        } else if (!this.isListening && status === 'stopped') {
            this.micStatusText.textContent = 'Click to start listening';
        }
    }

    updateConnectionStatus(connected) {
        if (connected) {
            this.statusDot.className = 'status-dot connected';
            const connectedHost = [...API_CONFIG.BASE_URLS.entries()].find(([, url]) => url === this.apiService.baseUrl)?.[0];
            this.statusText.textContent = 'Connected to ' + (connectedHost || this.apiService.baseUrl || 'unknown server');

            this.micButton.disabled = false;
        }

        else {
            this.statusDot.className = 'status-dot';
            this.statusText.textContent = 'Disconnected';

            this.micButton.disabled = true;
            this.isListening = false;
            this.updateListeningUI(false);
        }
    }

    /**
     * Update server status display
     * Note: Listening state management is now handled by manageListeningState through statusChange events
     * @param {Object} status - Status object with enabled property
     */
    async updateServerStatus(status) {
        /** The manageListeningState function now handles actual listening state changes */
        /** This function just updates the UI display if needed */
        this.log('info', `Server status updated: ${status.enabled ? 'enabled' : 'disabled'}`);
    }

    updateListeningUI(listening) {
        this.micButton.style.opacity = UI_CONFIG.OPACITY.ENABLED;

        if (listening) {
            this.micButton.classList.add('listening');
            this.micStatusText.textContent = 'Listening... Click to stop';
            this.micIcon.innerHTML = `
                <svg class="mic-svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M6 6h12v12H6z"/>
                </svg>
            `;
        }

        else {
            this.micButton.classList.remove('listening');
            this.micStatusText.textContent = 'Click to start listening';
            this.micIcon.innerHTML = `
                <svg class="mic-svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </svg>
            `;
        }
    }

    fetchLatestInteractions(interactions) {
        for (const interaction of interactions) {
            const existingInteraction = this.interactions.find(t => String(t.id) === String(interaction));
            try {
                if (!existingInteraction) {
                    this.log('info', `Adding new interaction: ${interaction}`);

                    this.apiService.getInteraction(interaction).then(interactionData => {
                        if (interactionData) {
                            this.appendInteraction(interactionData);
                        }

                        else {
                            this.log('error', `Failed to fetch interaction ${interaction}`);
                        }
                    }).catch(error => {
                        this.log('error', 'Error fetching interactions', error);
                    });
                }
            }

            catch (error) {
                this.log('error', 'Error fetching interactions', error);
            }
        }
    }

    async appendInteraction(interaction) {
        let timestamp = interaction.timestamp;
        try {
            let isoString = String(timestamp).replace(' ', 'T');
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
        }

        catch (error) {
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

        interaction.timestamp = timestamp;

        if (!this.apiService) {
            this.log('error', 'Cannot fetch person: API service not initialized');
            return;
        }

        const person = await this.apiService.getPerson(interaction.speaker_id);
        let personData = null;

        if (person) {
            personData = person;
        }

        else {
            this.log('error', `Failed to fetch person ${interaction.speaker_id}`);
            /** Create a fallback person object */
            personData = { name: 'Unknown Person', id: interaction.speaker_id };
        }

        interaction.speaker = personData;
        this.interactions.push(interaction);

        const emptyState = this.interactionContent.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const interactionElement = this.createInteractionElement(interaction);
        this.interactionContent.appendChild(interactionElement);

        /** Scroll to bottom */
        this.interactionContent.scrollTop = this.interactionContent.scrollHeight;
    }

    createInteractionElement(interaction) {
        const element = document.createElement('div');
        element.className = 'interaction-item';
        const personColor = this.getPersonColor(interaction.speaker);
        element.style.borderLeftColor = personColor.border;
        element.style.backgroundColor = personColor.background;

        element.innerHTML = `
            <div class="person-info" style="color: ${personColor.text};">
                <span class="person-name">${interaction.speaker.name || "Person " + interaction.speaker.index || interaction.speaker.id}</span>
                <span class="timestamp">${interaction.timestamp}</span>
            </div>
            <div class="text">${interaction.text}</div>
        `;
        return element;
    }

    getPersonColor(person) {
        const personIndex = parseInt(person.index) || this.getOrAssignPersonIndex(person.id);

        const greenShades = [
            { background: '#f0fffa', border: '#00ff88', text: '#00cc6a' },
            { background: '#e6fffa', border: '#00e074', text: '#00b359' },
            { background: '#dcfdf7', border: '#00d15a', text: '#009944' },
            { background: '#d1fae5', border: '#00c249', text: '#007f30' },
        ];

        return greenShades[personIndex % greenShades.length];
    }

    getOrAssignPersonIndex(person) {
        if (!this.personIndexMap.has(person)) {
            this.personIndexMap.set(person, this.nextPersonIndex);
            this.nextPersonIndex++;
        }

        return this.personIndexMap.get(person);
    }

    /**
     * Clear all interactions from database and UI
     * Uses ApiService for proper error handling
     */
    async clearInteractions() {
        if (!this.apiService) {
            this.log('error', 'Cannot clear interactions: API service not initialized');
            return;
        }

        console.log('Clearing interactions from database...', this.interactions);

        let deletedCount = 0;

        const deletePromises = this.interactions.map(async (interaction) => {
            try {
                const success = await this.apiService.deleteInteraction(interaction.id);
                if (success) {
                    this.log('info', 'Cleared interaction from database', { interactionId: interaction.id });
                    deletedCount++;
                    return interaction.id;
                }

                else {
                    this.log('error', `Failed to clear database for interaction ${interaction.id}`);
                    return null;
                }
            }

            catch (err) {
                this.log('warn', `Failed to delete interaction ${interaction.id}`, err);
                return null;
            }
        });

        const deletedIds = await Promise.all(deletePromises);
        this.interactions = this.interactions.filter(interaction => !deletedIds.includes(interaction.id));

        if (this.interactions.length === 0) {
            this.interactionContent.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-robot"></i>
                    <p>No conversations yet</p>
                    <small>Start speaking to interact with your AI assistant</small>
                </div>
            `;
        }


        if (deletedCount > 0) {
            this.interactionContent.scrollTop = this.interactionContent.scrollHeight;
            this.showMessage(`Cleared ${deletedCount} interactions from database`, 'info');
        }

        else {
            this.showMessage('No interactions to clear', 'info');
        }
    }


    showConnectionBanner() {
        if (this.connectionBanner) {
            this.connectionBanner.style.display = 'block';
            this.debugLog('ui', 'Connection banner shown');
        }

        else {
            console.error('Connection banner element not found');
        }
    }

    hideConnectionBanner() {
        if (this.connectionBanner) {
            this.connectionBanner.style.display = 'none';
            this.debugLog('ui', 'Connection banner hidden');
        }

        else {
            console.error('Connection banner element not found');
        }
    }

    /**
     * Initialize notification container for stacked notifications
     */
    initializeNotificationContainer() {
        this.notificationContainer = document.createElement('div');
        this.notificationContainer.id = 'notificationContainer';
        this.notificationContainer.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 10000;
            pointer-events: none;
            display: flex;
            flex-direction: column-reverse;
            gap: 8px;
        `;

        /** Add CSS for smooth repositioning of notifications */
        const style = document.createElement('style');
        style.textContent = `
            #notificationContainer > * {
                transition: all 0.3s ease !important;
            }
        `;
        document.head.appendChild(style);
        document.body.appendChild(this.notificationContainer);
    }

    showMessage(message, type = 'info') {
        console.log('Message:', message);

        /** Create a simple toast notification for user feedback */
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Define colors for different message types
        let backgroundColor;
        let textColor = 'white';

        switch (type) {
            case 'error':
                backgroundColor = '#ff4444';
                break;
            case 'warning':
                backgroundColor = '#ffaa00';
                break;
            case 'agent':
                backgroundColor = '#6366f1'; // Indigo color for agent messages
                break;
            case 'info':
            default:
                backgroundColor = '#00aa44';
                break;
        }

        toast.style.cssText = `
            position: relative;
            max-width: 400px;
            padding: 12px 16px;
            background: ${backgroundColor};
            color: ${textColor};
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-size: 14px;
            font-weight: 500;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease, transform 0.3s ease, opacity 0.3s ease;
            word-wrap: break-word;
            pointer-events: auto;
            cursor: pointer;
        `;

        toast.textContent = message;

        /** Add to notification container instead of body */
        this.notificationContainer.appendChild(toast);
        this.activeNotifications.push(toast);

        /** Animate in */
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);

        /** Auto-remove non-error notifications */
        if (type !== 'error') {
            const duration = Math.max(3000, Math.min(8000, message.length * 50));
            setTimeout(() => {
                this.removeNotification(toast);
            }, duration);
        }

        /** Click to dismiss */
        toast.addEventListener('click', () => {
            this.removeNotification(toast);
        });
    }

    /**
     * Remove a notification and update the stack
     * @param {HTMLElement} toast - The notification element to remove
     */
    removeNotification(toast) {
        if (!toast.parentNode) return;

        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);

                /** Remove from active notifications array */
                const index = this.activeNotifications.indexOf(toast);
                if (index > -1) {
                    this.activeNotifications.splice(index, 1);
                }
            }
        }, 300);
    }

    /**
     * Show speaker training dialog
     */
    async showTrainingDialog() {
        if (this.isTraining) {
            this.showMessage('Training is already in progress', 'warning');
            return;
        }

        try {
            // Load persons from backend
            const persons = await this.apiService.getPersons();
            this.populateSpeakerDropdown(persons);

            // Show overlay with smooth transition
            this.trainingOverlay.style.display = 'flex';
            requestAnimationFrame(() => {
                this.trainingOverlay.classList.add('show');
            });
        } catch (error) {
            this.showMessage('Failed to load speakers: ' + error.message, 'error');
        }
    }

    /**
     * Hide speaker training dialog
     */
    hideTrainingDialog() {
        this.trainingOverlay.classList.remove('show');
        setTimeout(() => {
            this.trainingOverlay.style.display = 'none';
            this.resetTrainingState();
        }, 300);
    }

    /**
     * Populate speaker dropdown with available speakers
     */
    populateSpeakerDropdown(persons) {
        this.speakerSelect.innerHTML = '<option value="">Choose a person...</option>';

        persons.forEach(person => {
            const option = document.createElement('option');
            option.value = person.id;
            option.textContent = person.name || `Person ${person.index}`;
            this.speakerSelect.appendChild(option);
        });
    }

    /**
     * Handle speaker selection change
     */
    handleSpeakerSelection() {
        const selectedId = this.speakerSelect.value;
        if (selectedId) {
            this.selectedSpeaker = selectedId;
            const selectedOption = this.speakerSelect.selectedOptions[0];
            this.speakerNameInput.value = selectedOption.textContent;
            this.speakerNameInput.parentElement.style.display = 'block';
            this.startTrainingBtn.disabled = false;
        } else {
            this.selectedSpeaker = null;
            this.speakerNameInput.parentElement.style.display = 'none';
            this.startTrainingBtn.disabled = true;
        }
    }

    /**
     * Start the training process
     */
    async startTrainingProcess() {
        if (!this.selectedSpeaker) {
            this.showMessage('Please select a speaker first', 'error');
            return;
        }

        try {
            this.isTraining = true;
            this.currentTrainingStep = 0;
            this.trainingRecordings = [];

            // Disable Mira service during training
            if (this.isListening) {
                await this.apiService.disableService();
            }

            // Show training progress
            this.trainingProgress.style.display = 'block';
            document.querySelector('.speaker-selection').style.display = 'none';
            document.querySelector('.speaker-name-input').style.display = 'none';
            document.querySelector('.training-controls').style.display = 'none';

            this.showCurrentPrompt();
        } catch (error) {
            this.showMessage('Failed to start training: ' + error.message, 'error');
            this.isTraining = false;
        }
    }

    /**
     * Show current training prompt
     */
    showCurrentPrompt() {
        const stepNumber = this.currentTrainingStep + 1;
        const totalSteps = this.trainingPrompts.length;

        this.progressText.textContent = `Step ${stepNumber} of ${totalSteps}`;
        this.progressFill.style.width = `${(stepNumber - 1) / totalSteps * 100}%`;
        this.promptText.textContent = this.trainingPrompts[this.currentTrainingStep];

        this.recordBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Click to Record</span>';
        this.recordBtn.disabled = false;
        this.recordBtn.classList.remove('recording');
    }

    /**
     * Handle training recording
     */
    async handleTrainingRecord() {
        if (!this.trainingMicVAD) {
            await this.startTrainingRecording();
        } else {
            await this.stopTrainingRecording();
        }
    }

    /**
     * Start training recording using VAD
     */
    async startTrainingRecording() {
        try {
            await this.waitForVADLibrary();

            if (typeof vad === 'undefined' || !vad.MicVAD) {
                throw new Error('Voice Activity Detection library is not available');
            }

            const { MicVAD } = vad;
            let recordedAudio = null;

            this.trainingMicVAD = await MicVAD.new({
                model: 'legacy',
                positiveSpeechThreshold: 0.3,
                negativeSpeechThreshold: 0.1,

                onSpeechEnd: (audio) => {
                    recordedAudio = audio;
                    this.stopTrainingRecording();
                },

                onError: (error) => {
                    this.showMessage('Recording error: ' + error.message, 'error');
                    this.resetTrainingRecording();
                }
            });

            await this.trainingMicVAD.start();

            this.recordBtn.innerHTML = '<i class="fas fa-stop"></i><span>Recording... Click to Stop</span>';
            this.recordBtn.classList.add('recording');

            // Store the recorded audio callback
            this.recordedAudioCallback = recordedAudio;

        } catch (error) {
            this.showMessage('Failed to start recording: ' + error.message, 'error');
            this.resetTrainingRecording();
        }
    }

    /**
     * Stop training recording and process audio
     */
    async stopTrainingRecording() {
        if (!this.trainingMicVAD) return;

        try {
            await this.trainingMicVAD.destroy();
            this.trainingMicVAD = null;

            this.recordBtn.innerHTML = '<i class="fas fa-check"></i><span>Processing...</span>';
            this.recordBtn.disabled = true;
            this.recordBtn.classList.remove('recording');

            // Wait a moment for audio to be captured
            setTimeout(() => {
                this.processTrainingRecording();
            }, 500);

        } catch (error) {
            this.showMessage('Failed to stop recording: ' + error.message, 'error');
            this.resetTrainingRecording();
        }
    }

    /**
     * Process the training recording
     */
    async processTrainingRecording() {
        // For now, simulate processing and move to next step
        // In a real implementation, you would get the actual audio data
        const mockAudioData = new ArrayBuffer(1000); // Placeholder

        try {
            const expectedText = this.trainingPrompts[this.currentTrainingStep];
            const success = await this.apiService.updatePerson(
                this.selectedSpeaker,
                this.speakerNameInput.value,
                mockAudioData,
                expectedText
            );

            if (success) {
                this.trainingRecordings.push({
                    step: this.currentTrainingStep,
                    text: expectedText,
                    audio: mockAudioData
                });

                this.currentTrainingStep++;

                if (this.currentTrainingStep < this.trainingPrompts.length) {
                    // Move to next step
                    setTimeout(() => {
                        this.showCurrentPrompt();
                    }, 1000);
                } else {
                    // Training complete
                    this.completeTraining();
                }
            } else {
                this.showMessage('Failed to process recording. Please try again.', 'error');
                this.resetTrainingRecording();
            }
        } catch (error) {
            this.showMessage('Training error: ' + error.message, 'error');
            this.resetTrainingRecording();
        }
    }

    /**
     * Complete the training process
     */
    async completeTraining() {
        this.progressFill.style.width = '100%';
        this.progressText.textContent = 'Training Complete!';

        this.recordBtn.innerHTML = '<i class="fas fa-check-circle"></i><span>Training Successful</span>';
        this.recordBtn.style.background = '#10b981';
        this.recordBtn.disabled = true;

        this.showMessage('Speaker training completed successfully!', 'info');

        // Re-enable Mira service
        try {
            await this.apiService.enableService();
        } catch (error) {
            this.debugLog('training', 'Failed to re-enable service after training', { error: error.message });
        }

        setTimeout(() => {
            this.hideTrainingDialog();
        }, 2000);
    }

    /**
     * Reset training recording state
     */
    resetTrainingRecording() {
        if (this.trainingMicVAD) {
            this.trainingMicVAD.destroy().catch(() => { });
            this.trainingMicVAD = null;
        }

        this.recordBtn.innerHTML = '<i class="fas fa-microphone"></i><span>Click to Record</span>';
        this.recordBtn.disabled = false;
        this.recordBtn.classList.remove('recording');
    }

    /**
     * Reset training state
     */
    resetTrainingState() {
        this.isTraining = false;
        this.currentTrainingStep = 0;
        this.selectedSpeaker = null;
        this.trainingRecordings = [];

        this.resetTrainingRecording();

        // Reset UI
        this.trainingProgress.style.display = 'none';
        document.querySelector('.speaker-selection').style.display = 'block';
        document.querySelector('.speaker-name-input').style.display = 'none';
        document.querySelector('.training-controls').style.display = 'flex';

        this.speakerSelect.value = '';
        this.speakerNameInput.value = '';
        this.startTrainingBtn.disabled = true;
        this.recordBtn.style.background = '#3b82f6';
    }

    async cleanup() {
        try {
            /** Stop recording first */
            if (this.isRecording && this.micVAD) {
                await this.stopAudioCapture();
            }

            /** Clear interaction interval */
            if (this.interactionInterval) {
                clearInterval(this.interactionInterval);
                this.interactionInterval = null;
            }

            /** Stop listening service and deregister from backend */
            if (this.apiService.isRegistered) {
                try {
                    await this.deregisterClient();

                    if (this.isListening) {
                        await this.apiService.disableService();
                    }
                }

                catch (error) {
                    this.log('error', 'Error during cleanup deregistration', error);
                }
            }

            /** Clean up API service */
            if (this.apiService) {
                this.apiService.destroy();
            }

            /** Final state reset */
            this.isRecording = false;
            this.isListening = false;
            this.isToggling = false;
            this.isProcessingAudio = false;

        }

        catch (error) {
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
        if (window.miraApp && window.miraApp.apiService.isRegistered && !window.miraApp.isDeregistering) {
            window.miraApp.apiService.destroy();
        }
    });

    window.addEventListener('unload', () => {
        if (window.miraApp && window.miraApp.isRegistered && !window.miraApp.isDeregistering) {
            window.miraApp.apiService.destroy();
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
});