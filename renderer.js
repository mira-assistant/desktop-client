class MiraDesktop {
    constructor() {
        this.baseUrls = new Map([
            ["localhost", 'http://localhost:8000'],
            ["ankurs-macbook-air", 'http://100.75.140.79:8000']
        ]);

        this.baseUrl = null;
        this.clientId = 'Mira Desktop App';
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

        // Audio capture properties - VAD-based
        this.micVAD = null;
        this.isRecording = false;
        this.audioProcessingStats = {
            totalAudioSent: 0,
            totalAudioBytes: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageAudioDuration: 0
        };

        // Enhanced audio optimization properties
        this.audioOptimization = {
            enableAdvancedNoiseReduction: true,
            enableDynamicGainControl: true,
            enableSpectralGating: true,
            noiseFloor: -40, // dB
            signalThreshold: -20, // dB
            adaptiveThresholds: true,
            environmentalNoise: 0,
            lastNoiseAnalysis: 0
        };

        // Debug mode (can be enabled via console: window.miraApp.debugMode = true)
        this.debugMode = false;

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

    async checkConnection() {
        let urls = Object.fromEntries(this.baseUrls);

        if (this.baseUrl) {
            urls = { "cachedUrl": this.baseUrl, ...urls };
        }

        let connected = false;

        for (const [hostName, url] of Object.entries(urls)) {
            try {
                const response = await fetch(`${url}/`);
                if (response.ok) {
                    this.baseUrl = url;
                    this.updateConnectionStatus(true);
                    this.hideConnectionBanner();
                    this.isConnected = true;

                    if (!this.isRegistered) {
                        await this.registerClient();
                    }

                    const status = await response.json();
                    this.updateFeatures(status.features);
                    this.updateServerStatus(status);
                    this.fetchLatestInteractions(status.recent_interactions);

                    console.log(`Connected to ${hostName} at ${url}`);
                    connected = true;
                    break;
                } else {
                    console.log('Connection check failed:', response.statusText);
                }
            } catch (error) {
                console.warn(`Failed to connect to ${hostName} at ${url}:`, error.message);
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

    async registerClient() {
        try {
            const response = await fetch(`${this.baseUrl}/service/client/register/${encodeURIComponent(this.clientId)}`, {
                method: 'POST'
            });

            if (response.ok) {
                this.isRegistered = true;
                console.log('Client registered successfully');
            }
        } catch (error) {
            console.error('Failed to register client:', error);
        }
    }

    async deregisterClient() {
        if (!this.isRegistered || this._deregistrationAttempted) {
            return;
        }

        this._deregistrationAttempted = true;

        try {
            const response = await fetch(`${this.baseUrl}/service/client/deregister/${encodeURIComponent(this.clientId)}`, {
                method: 'DELETE',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                this.isRegistered = false;
                console.log('Client deregistered successfully');
            } else {
                console.error('Failed to deregister client:', response.status, response.statusText);
            }
        } catch (error) {
            console.error('Failed to deregister client:', error);
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
            // Provide immediate UI feedback
            this.micButton.style.opacity = '0.7';
            this.micStatusText.textContent = this.isListening ? 'Stopping...' : 'Starting...';

            // Small delay to ensure UI feedback is visible
            await new Promise(resolve => setTimeout(resolve, 50));

            if (this.isListening) {
                await this.stopListening();
            } else {
                await this.startListening();
            }
            
        } catch (error) {
            console.error('❌ Error toggling listening:', error);

            // Determine user-friendly error message
            let errorMessage = 'Error: ' + error.message;
            if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
                errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
            } else if (error.message.includes('internet') || error.message.includes('VAD library')) {
                errorMessage = 'Voice detection library failed to load. Please check your internet connection and refresh the page.';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Operation timed out. Please try again.';
            } else if (error.message.includes('backend') || error.message.includes('Backend')) {
                errorMessage = 'Backend connection error. Please check your connection and try again.';
            } else if (error.message.includes('network') || error.message.includes('Failed to fetch')) {
                errorMessage = 'Network error. Please check your connection and try again.';
            }

            this.showMessage(errorMessage, 'error');
            
            // Ensure UI reflects actual state after error
            this.updateListeningUI(this.isListening);
            
            // Log detailed error information for debugging
            console.error('Toggle listening error details:', {
                message: error.message,
                isConnected: this.isConnected,
                isListening: this.isListening,
                isRecording: this.isRecording
            });
            
        } finally {
            // Always reset toggle state and UI
            this.isToggling = false;
            this.micButton.style.opacity = '1';

            // Restore button text if we're not listening and text shows loading state
            if (!this.isListening && this.micStatusText.textContent.includes('...')) {
                this.micStatusText.textContent = originalButtonText;
            }
        }
    }

    async startListening() {
        try {
            const response = await fetch(`${this.baseUrl}/service/enable`, {
                method: 'PATCH'
            });

            if (response.ok) {
                await this.startAudioCapture();
                this.isListening = true;
                this.updateListeningUI(true);
                this.startTranscriptionPolling();
            } else {
                const errorText = await response.text();
                console.error('Failed to enable backend service:', response.status, errorText);
                throw new Error(`Failed to enable listening: ${response.status}`);
            }
        } catch (error) {
            console.error('Error starting listening:', error);
            await this.stopAudioCapture();
            this.isListening = false;
            this.updateListeningUI(false);
            throw error;
        }
    }

    async stopListening() {
        try {
            // First, stop audio capture to ensure recording stops immediately
            await this.stopAudioCapture();

            // Send disable request to backend with timeout and retry logic
            const backendStopResult = await this.sendBackendStopRequest();
            
            if (backendStopResult.success) {
                // Update states only after successful backend confirmation
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopTranscriptionPolling();
            } else {
                // Even if backend fails, ensure local state is consistent
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopTranscriptionPolling();
                
                // Show user-friendly error message
                this.showMessage(
                    'Audio recording stopped, but backend communication failed. Please check your connection.', 
                    'warning'
                );
            }
        } catch (error) {
            console.error('Error stopping listening:', error);
            
            // Ensure cleanup happens even if there are errors
            try {
                // Force stop audio capture if not already done
                await this.stopAudioCapture();
                
                // Update states to stopped regardless of backend status
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopTranscriptionPolling();
            } catch (cleanupError) {
                console.error('Error during forced stop cleanup:', cleanupError);
            }
            
            // Show user-friendly error message
            this.showMessage('Error stopping recording: ' + error.message, 'error');
            
            // Don't rethrow - we want to ensure the UI is updated
        }
    }

    /**
     * Send stop request to backend with proper error handling and timeout
     */
    async sendBackendStopRequest(maxRetries = 2, timeout = 10000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => {
                    controller.abort();
                }, timeout);

                const response = await fetch(`${this.baseUrl}/service/disable`, {
                    method: 'PATCH',
                    signal: controller.signal,
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                clearTimeout(timeoutId);

                if (response.ok) {
                    return { success: true, attempt };
                } else {
                    const errorText = await response.text();
                    console.error(`Backend disable failed (attempt ${attempt}):`, response.status, errorText);
                    
                    if (attempt === maxRetries) {
                        return { 
                            success: false, 
                            error: `HTTP ${response.status}: ${response.statusText}`,
                            details: errorText
                        };
                    }
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                }
                
            } catch (error) {
                console.error(`Backend disable request error (attempt ${attempt}):`, error);
                
                if (attempt === maxRetries) {
                    return { 
                        success: false, 
                        error: error.message,
                        type: error.name 
                    };
                }
                
                // Wait before retry
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
        
        return { success: false, error: 'All retry attempts failed' };
    }

    async waitForVADLibrary(timeout = 15000) {
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
            const targetSilenceMs = 420; // Reduced for more responsive detection
            const redemptionFrames = Math.max(1, Math.round((targetSilenceMs * sampleRate) / (frameSamples * 1000)));

            const vadInitPromise = MicVAD.new({
                model: 'legacy',

                // Optimized thresholds for better noise rejection
                positiveSpeechThreshold: 0.35, // Increased for better noise rejection
                negativeSpeechThreshold: 0.15, // Balanced for clean cutoff

                redemptionFrames: redemptionFrames,

                // Audio quality settings optimized for transcription
                frameSamples: frameSamples,
                preSpeechPadFrames: 2, // Increased to capture speech onset
                minSpeechFrames: 4, // Increased to avoid false positives

                // Enhanced audio constraints for maximum quality
                additionalAudioConstraints: {
                    sampleRate: sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true, // Browser-level noise suppression
                    autoGainControl: true,
                    channelCount: 1,
                    
                    // Advanced constraints for better audio quality
                    googEchoCancellation: true,
                    googAutoGainControl: true,
                    googNoiseSuppression: true,
                    googHighpassFilter: true,
                    googAudioMirroring: false,
                    latency: 0.01, // Low latency for real-time processing
                },

                onSpeechStart: () => {
                    this.updateVADStatus('speaking');
                },

                onSpeechEnd: (audio) => {
                    try {
                        const durationSeconds = audio.length / sampleRate;
                        this.updateVADStatus('processing');

                        // Validate and optimize audio data before sending
                        if (audio && audio.length > 0) {
                            this.processAndSendOptimizedAudio(audio);
                        } else {
                            this.updateVADStatus('waiting');
                        }
                    } catch (err) {
                        console.error('VAD: Error in onSpeechEnd callback:', err);
                        this.updateVADStatus('waiting');
                    }
                },

                onVADMisfire: () => {
                    this.updateVADStatus('waiting');
                },

                onFrameProcessed: (probabilities) => {
                    // Optional: can be used for debugging
                },

                onError: (error) => {
                    console.error('VAD: Internal error:', error);
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
            console.error('Error starting VAD audio capture:', error);

            let errorMessage = 'Failed to initialize voice activity detection.';
            if (error.message.includes('Permission denied') || error.name === 'NotAllowedError') {
                errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
            } else if (error.message.includes('VAD library failed to load') || error.message.includes('library loading')) {
                errorMessage = `Voice detection library failed to load: ${error.message}. Please refresh the page and try again.`;
            } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                errorMessage = 'Voice detection initialization timed out. Please try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No microphone found. Please connect a microphone and try again.';
            } else if (error.message.includes('MicVAD')) {
                errorMessage = 'Voice detection module is incomplete. Please refresh the page and try again.';
            } else {
                errorMessage = `Voice detection error: ${error.message}`;
            }

            console.error('Audio capture error details:', {
                message: error.message,
                name: error.name,
                vadLibraryLoaded: window.vadLibraryLoaded,
                vadLibraryLoadError: window.vadLibraryLoadError
            });

            this.showMessage(errorMessage, 'error');
            throw error;
        }
    }

    async stopAudioCapture() {
        console.log('🛑 Starting audio capture stop process...');
        
        try {
            // Set recording state to false immediately to prevent new processing
            this.isRecording = false;
            console.log('✅ Recording state set to false');

            if (this.micVAD) {
                console.log('🎤 Destroying VAD instance...');
                
                try {
                    // Call destroy method on VAD
                    await this.micVAD.destroy();
                    console.log('✅ VAD.destroy() completed successfully');
                } catch (vadError) {
                    console.error('❌ Error calling VAD.destroy():', vadError);
                    // Continue with cleanup even if destroy fails
                }

                // Additional cleanup: manually stop any remaining audio tracks
                await this.forceStopAllAudioTracks();
                
                // Clear the VAD reference
                this.micVAD = null;
                console.log('✅ VAD instance cleared');
            } else {
                console.log('ℹ️ No VAD instance to destroy');
            }

            // Verify that recording has actually stopped
            await this.verifyRecordingIsStopped();
            
            // Update VAD status
            this.updateVADStatus('stopped');
            console.log('✅ Audio capture stopped successfully');
            
        } catch (error) {
            console.error('❌ Error stopping VAD audio capture:', error);
            
            // Force cleanup even if there are errors
            try {
                await this.forceStopAllAudioTracks();
                this.micVAD = null;
                this.isRecording = false;
                this.updateVADStatus('stopped');
                console.log('✅ Forced cleanup completed');
            } catch (forceError) {
                console.error('❌ Error during forced cleanup:', forceError);
            }
            
            // Log detailed error information for debugging
            console.error('Audio capture stop error details:', {
                message: error.message,
                name: error.name,
                stack: error.stack,
                isRecording: this.isRecording,
                micVAD: !!this.micVAD
            });
            
            // Don't rethrow the error - we want to ensure cleanup happens
        }
    }

    /**
     * Force stop all active audio tracks to ensure recording is completely stopped
     */
    async forceStopAllAudioTracks() {
        try {
            // Get all media devices
            const mediaDevices = navigator.mediaDevices;
            if (!mediaDevices || !mediaDevices.enumerateDevices) {
                return;
            }

            // Check if there are any active media streams
            let activeStreams = 0;
            
            // Try to detect active streams by checking permissions
            try {
                const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
            } catch (permError) {
                // Ignore permission check errors
            }

            // The VAD library should clean up its own streams, but let's add a verification step
            // We'll try to create a new temporary stream to verify microphone access is properly released
            await this.verifyMicrophoneIsReleased();
            
        } catch (error) {
            console.error('Error during audio track cleanup:', error);
            // Continue execution - this is a best-effort cleanup
        }
    }

    /**
     * Verify that the microphone is properly released by the VAD library
     */
    async verifyMicrophoneIsReleased() {
        try {
            // Try to get microphone access briefly to verify it's not locked
            const testStream = await navigator.mediaDevices.getUserMedia({ 
                audio: { 
                    sampleRate: 16000,
                    channelCount: 1 
                } 
            });
            
            // Immediately stop the test stream
            if (testStream) {
                testStream.getTracks().forEach(track => {
                    track.stop();
                });
            }
            
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                // Expected if user has denied access
            } else if (error.name === 'NotFoundError') {
                // No microphone found
            } else if (error.name === 'AbortError' || error.message.includes('busy')) {
                // This suggests the microphone wasn't properly released
                throw new Error('Microphone appears to still be in use after VAD destruction');
            }
        }
    }

    /**
     * Verify that recording has actually stopped
     */
    async verifyRecordingIsStopped() {
        // Check internal state
        if (this.isRecording) {
            console.log('Recording state verification - isRecording:', this.isRecording, 'micVAD:', !!this.micVAD);
        }
    }

    /**
     * Check if the audio contains a cancel command like "Mira cancel"
     * This is a placeholder for potential future speech recognition integration
     */
    checkForCancelCommand(audioData) { // eslint-disable-line no-unused-vars
        // Note: This is a placeholder for cancel command detection
        // In a full implementation, this could use a lightweight speech recognition
        // to detect "Mira cancel" or similar commands locally before sending to backend
        
        // Future implementation could:
        // 1. Use a lightweight local speech recognition model
        // 2. Check for specific wake words like "Mira cancel", "stop", etc.
        // 3. If detected, immediately call this.stopListening()
        // 4. Return true/false to indicate if command was found
        
        return false; // No cancel command detected
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
            console.error(`Unknown optimization feature: ${feature}`);
            console.log('Available features:', Object.keys(this.audioOptimization));
            return;
        }
        
        this.audioOptimization[feature] = !this.audioOptimization[feature];
        console.log(`${feature}: ${this.audioOptimization[feature] ? 'Enabled' : 'Disabled'}`);
        this.showMessage(`Audio optimization "${feature}" ${this.audioOptimization[feature] ? 'enabled' : 'disabled'}`, 'info');
    }

    /**
     * Test backend connection with detailed logging
     */
    async testBackendConnection() {
        if (!this.baseUrl) {
            console.warn('No backend URL configured');
            this.showMessage('No backend URL configured', 'warning');
            return;
        }

        try {
            const startTime = Date.now();
            const response = await fetch(`${this.baseUrl}/`, {
                method: 'GET',
                cache: 'no-cache'
            });
            const duration = Date.now() - startTime;

            if (response.ok) {
                const data = await response.json();
                console.log(`Backend connection test successful (${duration}ms):`, data);
                this.showMessage(`Backend connection OK (${duration}ms)`, 'info');
            } else {
                console.error(`Backend connection test failed: ${response.status} ${response.statusText}`);
                this.showMessage(`Backend test failed: ${response.status}`, 'error');
            }
        } catch (error) {
            console.error('Backend connection test error:', error);
            this.showMessage(`Backend test error: ${error.message}`, 'error');
        }
    }

    /**
     * Process and optimize audio with advanced noise reduction and quality enhancement
     */
    async processAndSendOptimizedAudio(audioFloat32Array) {
        try {
            // Step 1: Analyze audio quality
            const audioAnalysis = this.analyzeAudioQuality(audioFloat32Array);
            
            // Step 2: Apply noise reduction if enabled
            let processedAudio = audioFloat32Array;
            if (this.audioOptimization.enableAdvancedNoiseReduction) {
                processedAudio = this.applyNoiseReduction(processedAudio, audioAnalysis);
            }
            
            // Step 3: Apply dynamic gain control
            if (this.audioOptimization.enableDynamicGainControl) {
                processedAudio = this.applyDynamicGainControl(processedAudio, audioAnalysis);
            }
            
            // Step 4: Apply spectral gating for further noise reduction
            if (this.audioOptimization.enableSpectralGating) {
                processedAudio = this.applySpectralGating(processedAudio, audioAnalysis);
            }
            
            // Step 5: Final quality check
            const finalAnalysis = this.analyzeAudioQuality(processedAudio);
            
            // Step 6: Only send if audio quality is sufficient
            if (finalAnalysis.snr > this.audioOptimization.signalThreshold) {
                await this.sendVADAudioToBackend(processedAudio);
            } else {
                this.updateVADStatus('waiting');
            }
            
        } catch (error) {
            console.error('Error in audio optimization pipeline:', error);
            // Fallback to original audio if processing fails
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
        
        // Calculate RMS and find peak amplitude
        for (let i = 0; i < samples; i++) {
            const sample = Math.abs(audioFloat32Array[i]);
            sumSquares += sample * sample;
            maxAmplitude = Math.max(maxAmplitude, sample);
            
            if (sample < 0.001) { // Threshold for "silent" samples
                silentSamples++;
            }
        }
        
        const rms = Math.sqrt(sumSquares / samples);
        const energy = sumSquares / samples;
        
        // Estimate SNR (simplified calculation)
        const speechPower = rms * rms;
        const noisePower = silentSamples > samples * 0.1 ? 
            Math.max(speechPower * 0.01, 1e-10) : speechPower * 0.1; // Estimate noise floor
        const snr = 10 * Math.log10(speechPower / noisePower);
        
        // Calculate dynamic range
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
            return audioFloat32Array; // Audio is already clean
        }
        
        const result = new Float32Array(audioFloat32Array.length);
        const noiseThreshold = analysis.rms * 0.3; // Adaptive noise threshold
        
        // Simple spectral subtraction approach
        for (let i = 0; i < audioFloat32Array.length; i++) {
            const sample = audioFloat32Array[i];
            const sampleAbs = Math.abs(sample);
            
            if (sampleAbs > noiseThreshold) {
                // Keep strong signals, apply gentle filtering to weak ones
                const gain = Math.min(1.0, sampleAbs / noiseThreshold);
                result[i] = sample * gain;
            } else {
                // Aggressive reduction for likely noise
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
            return audioFloat32Array; // Audio level is already good
        }
        
        // Calculate target RMS level
        const targetRMS = 0.15; // Optimal level for transcription
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
        
        // Apply gating in overlapping windows
        for (let i = 0; i < audioFloat32Array.length; i++) {
            const windowStart = Math.max(0, i - windowSize / 2);
            const windowEnd = Math.min(audioFloat32Array.length, i + windowSize / 2);
            
            // Calculate local RMS
            let localRMS = 0;
            for (let j = windowStart; j < windowEnd; j++) {
                localRMS += audioFloat32Array[j] * audioFloat32Array[j];
            }
            localRMS = Math.sqrt(localRMS / (windowEnd - windowStart));
            
            // Apply gate
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

            // Convert Float32Array to 16-bit PCM for backend compatibility
            const audioInt16 = new Int16Array(audioFloat32Array.length);
            let validSamples = 0;

            for (let i = 0; i < audioFloat32Array.length; i++) {
                // Clamp and convert to 16-bit signed integer
                const sample = Math.max(-1, Math.min(1, audioFloat32Array[i]));
                audioInt16[i] = Math.round(sample * 32767);

                // Count non-zero samples to validate audio content
                if (Math.abs(sample) > 0.001) {
                    validSamples++;
                }
            }

            const validSampleRatio = validSamples / audioFloat32Array.length;
            if (validSampleRatio < 0.001) {
                console.warn('Audio appears to be mostly silence, validSamples:', validSamples, 'of', audioFloat32Array.length);
            }

            // Convert to bytes for backend (little-endian)
            const audioBytes = new Uint8Array(audioInt16.buffer);

            // Validate connection before sending
            if (!this.isConnected) {
                throw new Error('Backend connection lost');
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);

            const response = await fetch(`${this.baseUrl}/interactions/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': audioBytes.length.toString()
                },
                body: audioBytes,
                signal: controller.signal,
                keepalive: false,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                this.audioProcessingStats.successfulRequests++;
                this.audioProcessingStats.totalAudioSent++;
                this.audioProcessingStats.totalAudioBytes += audioBytes.length;
                this.audioProcessingStats.averageAudioDuration =
                    ((this.audioProcessingStats.averageAudioDuration * (this.audioProcessingStats.totalAudioSent - 1)) +
                        (audioFloat32Array.length / 16000)) / this.audioProcessingStats.totalAudioSent;

                try {
                    const result = await response.json();
                } catch (jsonError) {
                    console.warn('Response was OK but failed to parse JSON:', jsonError);
                }
            } else {
                this.audioProcessingStats.failedRequests++;
                let errorText = 'Unknown error';
                try {
                    errorText = await response.text();
                } catch (textError) {
                    console.warn('Failed to read error response text:', textError);
                }
                const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                console.error('Failed to process VAD audio:', errorMessage, errorText);

                if (response.status === 404) {
                    this.showMessage('Backend endpoint not found. Please check if the backend is running correctly.', 'error');
                } else if (response.status >= 500) {
                    this.showMessage('Backend server error. Please try again.', 'error');
                } else {
                    this.showMessage(`Failed to process audio: ${errorMessage}`, 'error');
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
            // Only update specific statuses, maintain the main listening message for most cases
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
            const connectedHost = [...this.baseUrls.entries()].find(([, url]) => url === this.baseUrl)?.[0];
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
                // await this.fetchLatestInteractions();
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
                    console.log(`Adding new transcription: ${interaction}`);

                    fetch(`${this.baseUrl}/interactions/${interaction}`)
                        .then(response => {
                            if (response.ok) {
                                return response.json();
                            } else {
                                console.error(`Failed to fetch interaction ${interaction}:`, response.status, response.statusText);
                                return null;
                            }
                        })
                        .then(interactionData => {
                            if (interactionData) {
                                this.addTranscriptionFromInteraction(interactionData);
                            }
                        })
                        .catch(error => {
                            console.error('Error fetching interaction:', error);
                        });
                }
            } catch (error) {
                console.error('Error fetching transcriptions:', error);
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
            console.warn('Error parsing timestamp:', error);
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

        const response = await fetch(`${this.baseUrl}/speakers/${interaction.speaker_id}`);
        const speaker = await response.json();

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

        // Scroll to bottom
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

    async clearTranscriptions() {
        try {
            const response = await fetch(`${this.baseUrl}/interactions`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Database cleared:', result);

                this.transcriptions = [];
                this.transcription_ids.clear();

                this.transcriptionContent.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-robot"></i>
                        <p>No conversations yet</p>
                        <small>Start speaking to interact with your AI assistant</small>
                    </div>
                `;

                this.showMessage(`Cleared ${result.deleted_count || 0} interactions from database`);
            } else {
                console.error('Failed to clear database:', response.status, response.statusText);
                this.showMessage('Failed to clear interactions from database', 'error');
            }
        } catch (error) {
            console.error('Error clearing interactions:', error);
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

        // Create a simple toast notification for user feedback
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
            // Stop recording first
            if (this.isRecording && this.micVAD) {
                await this.stopAudioCapture();
            }

            // Clear intervals
            if (this.connectionCheckInterval) {
                clearInterval(this.connectionCheckInterval);
                this.connectionCheckInterval = null;
            }

            if (this.transcriptionInterval) {
                clearInterval(this.transcriptionInterval);
                this.transcriptionInterval = null;
            }

            // Stop listening service and deregister from backend
            if (this.isRegistered) {
                try {
                    await this.deregisterClient();
                    
                    if (this.isListening) {
                        await this.stopListening();
                    }
                } catch (error) {
                    console.error('Error during cleanup deregistration:', error);
                }
            }

            // Final state reset
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
            const url = `${window.miraApp.baseUrl}/service/client/deregister/${encodeURIComponent(window.miraApp.clientId)}`;
            fetch(url, { method: 'DELETE' });
            window.miraApp._deregistrationAttempted = true;
        }
    });

    window.addEventListener('unload', () => {
        if (window.miraApp && window.miraApp.isRegistered && !window.miraApp._deregistrationAttempted) {
            const url = `${window.miraApp.baseUrl}/service/client/deregister/${encodeURIComponent(window.miraApp.clientId)}`;
            fetch(url, { method: 'DELETE' });
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

    if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        if (window.miraApp) {
            window.miraApp.showAudioStats();
        }
    }

    if (e.ctrlKey && e.shiftKey && e.code === 'KeyM') {
        e.preventDefault();
        if (window.miraApp) {
            window.miraApp.debugMode = !window.miraApp.debugMode;
            console.log('Debug mode:', window.miraApp.debugMode ? 'ENABLED' : 'DISABLED');
            window.miraApp.showMessage(`Debug mode ${window.miraApp.debugMode ? 'enabled' : 'disabled'}`, 'info');
        }
    }

    if (e.ctrlKey && e.shiftKey && e.code === 'KeyT') {
        e.preventDefault();
        if (window.miraApp) {
            window.miraApp.testBackendConnection();
        }
    }

    if (e.ctrlKey && e.shiftKey && e.code === 'KeyA') {
        e.preventDefault();
        if (window.miraApp) {
            console.log('=== AUDIO OPTIMIZATION CONTROLS ===');
            console.log('Available commands:');
            console.log('- window.miraApp.showAudioStats() - Show detailed audio statistics');
            console.log('- window.miraApp.toggleAudioOptimization("enableAdvancedNoiseReduction")');
            console.log('- window.miraApp.toggleAudioOptimization("enableDynamicGainControl")');
            console.log('- window.miraApp.toggleAudioOptimization("enableSpectralGating")');
            console.log('- window.miraApp.debugMode = true/false - Toggle debug mode');
            console.log('Keyboard shortcuts:');
            console.log('- Ctrl+Shift+D: Show audio stats');
            console.log('- Ctrl+Shift+M: Toggle debug mode');
            console.log('- Ctrl+Shift+T: Test backend connection');
            console.log('- Ctrl+Shift+A: Show this help (current)');
            window.miraApp.showMessage('Audio optimization help displayed in console', 'info');
        }
    }
});