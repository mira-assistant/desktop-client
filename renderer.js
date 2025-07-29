// Mira Desktop Renderer Process
//
// Troubleshooting Guide:
// =====================
// 
// 1. If button is laggy or unresponsive:
//    - Check browser console for errors
//    - Try Ctrl+Shift+M to toggle debug mode for detailed logging
//    - Use Ctrl+Shift+T to test backend connection
//
// 2. If no audio is being sent to backend:
//    - Check that microphone permission is granted
//    - Use Ctrl+Shift+D to show audio processing statistics
//    - Look for "Sending X bytes of VAD-detected speech to backend" in console
//    - Verify VAD library loaded successfully (should see "VAD library loaded" message)
//
// 3. If VAD library fails to load:
//    - Check internet connection (loads from CDN)
//    - Check browser console for "Failed to load VAD library" errors
//    - The app will try both CDN and local npm package as fallback
//
// 4. Debug commands in browser console:
//    - window.miraApp.showAudioStats() - Show audio processing statistics
//    - window.miraApp.testBackendConnection() - Test backend connectivity
//    - window.miraApp.debugMode = true - Enable detailed logging
//    - window.miraApp.audioProcessingStats - View raw audio stats
//
class MiraDesktop {
    constructor() {
        this.baseUrl = 'http://localhost:8000';
        this.clientId = 'Mira Desktop App';
        this.isConnected = false;
        this.isListening = false;
        this.isRegistered = false; // Track registration status
        this.isToggling = false; // Prevent multiple simultaneous toggle operations
        this.isProcessingAudio = false; // Prevent overlapping audio processing
        this._deregistrationAttempted = false; // Prevent multiple deregistration attempts
        this.transcriptions = [];
        this.connectionCheckInterval = null;
        this.hasShownStartupDemo = false; // Track if startup demo transcriptions have been shown

        // Audio capture properties - VAD-based
        this.micVAD = null; // Voice Activity Detection instance
        this.isRecording = false;
        this.audioProcessingStats = {
            totalAudioSent: 0,
            totalAudioBytes: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageAudioDuration: 0
        };
        
        // Debug mode (can be enabled via console: window.miraApp.debugMode = true)
        this.debugMode = false;

        this.initializeElements();
        this.setupEventListeners();
        this.startConnectionCheck();
        
        console.log('Mira Desktop initialized - debug info:');
        console.log('- Base URL:', this.baseUrl);
        console.log('- Client ID:', this.clientId);
        console.log('- Audio stats available at: window.miraApp.audioProcessingStats');
        console.log('- Enable debug mode: window.miraApp.debugMode = true');
        console.log('- Keyboard shortcuts:');
        console.log('  * Space: Toggle listening');
        console.log('  * Ctrl+Shift+D: Show audio stats');
        console.log('  * Ctrl+Shift+M: Toggle debug mode');
        console.log('  * Ctrl+Shift+T: Test backend connection');
    }

    initializeElements() {
        // Get DOM elements
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
        // Microphone button click
        this.micButton.addEventListener('click', () => this.toggleListening());

        // Clear transcriptions
        this.clearButton.addEventListener('click', () => this.clearTranscriptions());

        // Retry connection
        this.retryButton.addEventListener('click', () => this.checkConnection());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === ' ' && !e.target.matches('input, textarea')) {
                e.preventDefault();
                this.toggleListening();
            }
        });
    }

    async checkConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/`);
            const status = await response.json();

            if (response.ok) {
                this.isConnected = true;
                this.updateConnectionStatus(true);
                this.hideConnectionBanner();

                // Register client only if not already registered
                if (!this.isRegistered) {
                    await this.registerClient();
                }

                // Update features from backend
                this.updateFeatures(status.features);

                // Update UI based on server status
                this.updateServerStatus(status);
            } else {
                throw new Error('Server responded with error');
            }
        } catch (error) {
            console.log('Connection check failed:', error.message);
            this.isConnected = false;
            this.isRegistered = false; // Reset registration status on disconnect
            this._deregistrationAttempted = false; // Reset deregistration flag on disconnect
            this.updateConnectionStatus(false);
            this.showConnectionBanner();
        }
    }

    async registerClient() {
        try {
            const response = await fetch(`${this.baseUrl}/register_client?client_id=${encodeURIComponent(this.clientId)}`, {
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
            return; // Already deregistered or deregistration already attempted
        }

        this._deregistrationAttempted = true; // Prevent multiple attempts

        try {
            const response = await fetch(`${this.baseUrl}/deregister_client?client_id=${encodeURIComponent(this.clientId)}`, {
                method: 'POST',
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

        // Prevent multiple simultaneous calls
        if (this.isToggling) {
            console.log('Toggle already in progress, ignoring');
            return;
        }

        this.isToggling = true;
        const originalButtonText = this.micStatusText.textContent;

        try {
            // Provide immediate responsive UI feedback
            this.micButton.style.opacity = '0.7';
            this.micStatusText.textContent = this.isListening ? 'Stopping...' : 'Starting...';

            // Add a slight delay to ensure UI update is visible
            await new Promise(resolve => setTimeout(resolve, 50));

            if (this.isListening) {
                await this.stopListening();
            } else {
                await this.startListening();
            }
        } catch (error) {
            console.error('Error toggling listening:', error);
            
            // Provide specific error messages to user
            let errorMessage = 'Error: ' + error.message;
            if (error.message.includes('Permission denied') || error.message.includes('NotAllowedError')) {
                errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
            } else if (error.message.includes('internet') || error.message.includes('VAD library')) {
                errorMessage = 'Voice detection library failed to load. Please check your internet connection and refresh the page.';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Operation timed out. Please try again.';
            }
            
            this.showMessage(errorMessage, 'error');
            
            // Reset UI state on error
            this.updateListeningUI(this.isListening);
        } finally {
            this.isToggling = false;
            this.micButton.style.opacity = '1';
            
            // Only restore original text if we're not listening (success state will update it)
            if (!this.isListening && this.micStatusText.textContent.includes('...')) {
                this.micStatusText.textContent = originalButtonText;
            }
        }
    }

    async startListening() {
        try {
            console.log('Starting listening service...');

            // First enable the backend service
            const response = await fetch(`${this.baseUrl}/enable`, {
                method: 'PATCH'
            });

            if (response.ok) {
                console.log('Backend service enabled, starting audio capture...');

                // Start audio capture
                await this.startAudioCapture();

                this.isListening = true;
                this.updateListeningUI(true);
                this.startTranscriptionPolling();
                console.log('Successfully started listening');
            } else {
                const errorText = await response.text();
                console.error('Failed to enable backend service:', response.status, errorText);
                throw new Error(`Failed to enable listening: ${response.status}`);
            }
        } catch (error) {
            console.error('Error starting listening:', error);
            await this.stopAudioCapture(); // Clean up audio on error
            // Ensure UI state is reset
            this.isListening = false;
            this.updateListeningUI(false);
            throw error;
        }
    }

    async stopListening() {
        try {
            console.log('Stopping listening service...');

            // Stop audio capture first
            await this.stopAudioCapture();

            // Then disable the backend service
            const response = await fetch(`${this.baseUrl}/disable`, {
                method: 'PATCH'
            });

            if (response.ok) {
                console.log('Backend service disabled successfully');
                this.isListening = false;
                this.updateListeningUI(false);
                this.stopTranscriptionPolling();
            } else {
                const errorText = await response.text();
                console.error('Failed to disable backend service:', response.status, errorText);
                throw new Error(`Failed to disable listening: ${response.status}`);
            }
        } catch (error) {
            console.error('Error stopping listening:', error);
            // Still update UI even if backend call fails
            this.isListening = false;
            this.updateListeningUI(false);
            this.stopTranscriptionPolling();
            throw error;
        }
    }

    async startAudioCapture() {
        try {
            console.log('Requesting microphone access...');

            // Check if VAD library is available, with detailed error reporting
            if (typeof vad === 'undefined') {
                console.error('VAD library not found. CDN may be blocked or unavailable.');
                throw new Error('Voice Activity Detection library is not available. Please check your internet connection and try again.');
            }
            
            if (!vad.MicVAD) {
                console.error('MicVAD not found in VAD library object:', Object.keys(vad));
                throw new Error('Voice Activity Detection module is incomplete. Please refresh the page and try again.');
            }
            
            const { MicVAD } = vad;
            console.log('VAD library loaded successfully, setting up audio processing...');

            // Initialize VAD with custom options for 0.6s silence detection
            const sampleRate = 16000;
            const frameSamples = 1536; // Default frame size
            // Calculate redemption frames for ~0.6s silence detection
            const targetSilenceMs = 580; // Slightly less than 0.6s for better responsiveness
            const redemptionFrames = Math.max(1, Math.round((targetSilenceMs * sampleRate) / (frameSamples * 1000)));
            
            console.log(`Setting up VAD with ${redemptionFrames} redemption frames for ${targetSilenceMs}ms silence detection`);

            // Add timeout for VAD initialization
            const vadInitPromise = MicVAD.new({
                // VAD model options
                model: 'legacy', // Use legacy model for better compatibility
                
                // Speech detection thresholds - more sensitive settings
                positiveSpeechThreshold: 0.3, // Lower threshold for better detection
                negativeSpeechThreshold: 0.25,
                
                // Silence detection - customized for ~0.6s like terminal-client
                redemptionFrames: redemptionFrames,
                
                // Audio quality settings
                frameSamples: frameSamples,
                preSpeechPadFrames: 1, // Reduced for faster response
                minSpeechFrames: 3, // Reduced minimum to avoid missing short utterances
                
                // Enhanced audio constraints for better quality
                additionalAudioConstraints: {
                    sampleRate: sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    channelCount: 1 // Ensure mono audio
                },
                
                // Callbacks for VAD events
                onSpeechStart: () => {
                    console.log('VAD: Speech started');
                    this.updateVADStatus('speaking');
                },
                
                onSpeechEnd: (audio) => {
                    try {
                        const durationSeconds = audio.length / sampleRate;
                        console.log(`VAD: Speech ended, processing ${durationSeconds.toFixed(2)}s of audio (${audio.length} samples)`);
                        this.updateVADStatus('processing');
                        
                        // Validate audio data before sending
                        if (audio && audio.length > 0) {
                            this.sendVADAudioToBackend(audio);
                        } else {
                            console.warn('VAD: Empty audio data received, skipping');
                            this.updateVADStatus('waiting');
                        }
                    } catch (err) {
                        console.error('VAD: Error in onSpeechEnd callback:', err);
                        this.updateVADStatus('waiting');
                    }
                },
                
                onVADMisfire: () => {
                    console.log('VAD: Speech detected but too short (misfire)');
                    this.updateVADStatus('waiting');
                },
                
                onFrameProcessed: (probabilities) => {
                    // Optional: Could show real-time speech probability for debugging
                    // if (probabilities && probabilities.isSpeech > 0.5) {
                    //     console.log('VAD probability:', probabilities.isSpeech.toFixed(3));
                    // }
                },
                
                onError: (error) => {
                    console.error('VAD: Internal error:', error);
                    this.showMessage('Voice detection error: ' + error.message, 'error');
                }
            });

            // Set a timeout for VAD initialization
            const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('VAD initialization timeout after 10 seconds')), 10000);
            });

            this.micVAD = await Promise.race([vadInitPromise, timeoutPromise]);

            console.log('VAD initialized successfully, starting...');
            
            // Start VAD listening with error handling
            await this.micVAD.start();
            this.isRecording = true;
            this.updateVADStatus('waiting');

            console.log('VAD-based audio capture started successfully');
        } catch (error) {
            console.error('Error starting VAD audio capture:', error);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to initialize voice activity detection.';
            if (error.message.includes('Permission denied')) {
                errorMessage = 'Microphone permission denied. Please allow microphone access and try again.';
            } else if (error.message.includes('internet') || error.message.includes('CDN')) {
                errorMessage = 'Voice detection library failed to load. Please check your internet connection.';
            } else if (error.message.includes('timeout')) {
                errorMessage = 'Voice detection initialization timed out. Please try again.';
            } else if (error.name === 'NotFoundError') {
                errorMessage = 'No microphone found. Please connect a microphone and try again.';
            } else if (error.name === 'NotAllowedError') {
                errorMessage = 'Microphone access blocked. Please allow microphone access in your browser settings.';
            }
            
            this.showMessage(errorMessage, 'error');
            throw error;
        }
    }

    async stopAudioCapture() {
        try {
            this.isRecording = false;

            // Clean up VAD resources
            if (this.micVAD) {
                this.micVAD.destroy();
                this.micVAD = null;
            }

            // Reset VAD status
            this.updateVADStatus('stopped');

            console.log('VAD audio capture stopped');
        } catch (error) {
            console.error('Error stopping VAD audio capture:', error);
        }
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
        console.log(`sendVADAudioToBackend: Processing ${audioFloat32Array.length} audio samples`);
        
        if (this.debugMode) {
            console.log('DEBUG: Audio sample stats:');
            console.log('- Sample rate: 16000 Hz');
            console.log('- Duration:', (audioFloat32Array.length / 16000).toFixed(3), 'seconds');
            console.log('- Min sample:', Math.min(...audioFloat32Array).toFixed(4));
            console.log('- Max sample:', Math.max(...audioFloat32Array).toFixed(4));
            console.log('- RMS:', Math.sqrt(audioFloat32Array.reduce((sum, x) => sum + x*x, 0) / audioFloat32Array.length).toFixed(4));
        }

        try {
            // Validate audio data
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

            // Validate that we have meaningful audio content
            const validSampleRatio = validSamples / audioFloat32Array.length;
            if (validSampleRatio < 0.001) {
                console.warn('Audio appears to be mostly silence, validSamples:', validSamples, 'of', audioFloat32Array.length);
                // Still send it, but log the warning
            } else {
                console.log(`Audio validation: ${validSamples}/${audioFloat32Array.length} non-silent samples (${(validSampleRatio * 100).toFixed(1)}%)`);
            }

            // Convert to bytes for backend (little-endian)
            const audioBytes = new Uint8Array(audioInt16.buffer);
            console.log(`Sending ${audioBytes.length} bytes (${audioInt16.length} samples) of VAD-detected speech to backend`);

            // Validate connection before sending
            if (!this.isConnected) {
                throw new Error('Backend connection lost');
            }

            // Send to backend with enhanced error handling
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

            const response = await fetch(`${this.baseUrl}/register_interaction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': audioBytes.length.toString()
                },
                body: audioBytes,
                signal: controller.signal,
                // Performance optimizations
                keepalive: false, // Changed to false to avoid potential issues
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
                    if (result.message !== "Duplicate transcription skipped") {
                        console.log('VAD audio processed successfully:', result);
                        if (this.debugMode) {
                            console.log('DEBUG: Backend response:', result);
                        }
                    } else {
                        console.log('Duplicate transcription was skipped');
                    }
                } catch (jsonError) {
                    console.warn('Response was OK but failed to parse JSON:', jsonError);
                    // Still consider this a success since the audio was sent
                }
                // The transcription polling will pick up any new interactions
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
                
                // Show user-friendly error message
                if (response.status === 404) {
                    this.showMessage('Backend endpoint not found. Please check if the backend is running correctly.');
                } else if (response.status >= 500) {
                    this.showMessage('Backend server error. Please try again.');
                } else {
                    this.showMessage(`Failed to process audio: ${errorMessage}`);
                }
            }

        } catch (error) {
            console.error('Error sending VAD audio to backend:', error);
            
            // Provide specific error messages
            if (error.name === 'AbortError') {
                this.showMessage('Audio processing timed out. Please try speaking again.');
            } else if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
                this.showMessage('Network error. Please check your connection to the backend.');
            } else if (error.message.includes('Backend connection lost')) {
                this.showMessage('Connection to backend lost. Reconnecting...');
                // Trigger reconnection check
                this.checkConnection();
            } else {
                this.showMessage('Error processing audio: ' + error.message);
            }
        } finally {
            this.isProcessingAudio = false;
            // Always return to waiting state unless we're no longer listening
            if (this.isListening) {
                this.updateVADStatus('waiting');
            }
        }
    }

    updateVADStatus(status) {
        // Update UI to show VAD status
        const statusMessages = {
            'waiting': 'Waiting for speech...',
            'speaking': 'Speaking detected...',
            'processing': 'Processing speech...',
            'stopped': 'VAD stopped'
        };
        
        // Update microphone status text if listening
        if (this.isListening && this.micStatusText) {
            const message = statusMessages[status] || 'Unknown status';
            // Only update if not showing the main listening message
            if (status !== 'waiting') {
                this.micStatusText.textContent = message;
            } else {
                this.micStatusText.textContent = 'Listening... Click to stop';
            }
        }
        
        console.log(`VAD Status: ${statusMessages[status] || status}`);
    }

    updateFeatures(features) {
        const featuresList = document.getElementById('featuresList');
        if (!featuresList || !features) return;

        // Clear existing features
        featuresList.innerHTML = '';

        // Map features to display names, descriptions and icons
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

        // Add each enabled feature
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
            this.statusText.textContent = 'Connected';
            this.micButton.disabled = false;
        } else {
            this.statusDot.className = 'status-dot';
            this.statusText.textContent = 'Disconnected';
            this.micButton.disabled = true;
            this.isListening = false;
            this.updateListeningUI(false);
        }
    }

    updateServerStatus(status) {
        if (status.enabled && !this.isListening) {
            this.isListening = true;
            this.updateListeningUI(true);
            this.startTranscriptionPolling();
        } else if (!status.enabled && this.isListening) {
            this.isListening = false;
            this.updateListeningUI(false);
            this.stopTranscriptionPolling();
        }
    }

    updateListeningUI(listening) {
        if (listening) {
            this.micButton.classList.add('listening');
            this.statusDot.className = 'status-dot listening';
            this.statusText.textContent = 'Listening';
            this.micStatusText.textContent = 'Listening... Click to stop';
            // Replace microphone SVG with stop icon
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
            // Replace with microphone SVG
            this.micIcon.innerHTML = `
                <svg class="mic-svg" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z"/>
                </svg>
            `;
        }
    }

    startTranscriptionPolling() {
        // Stop any existing polling first to prevent multiple intervals
        this.stopTranscriptionPolling();

        console.log('Starting transcription polling...');
        // Poll for new transcriptions from the backend
        this.transcriptionInterval = setInterval(async () => {
            if (this.isListening && this.isConnected) {
                await this.fetchLatestTranscriptions();
            } else {
                console.log('Stopping polling - not listening or not connected');
                this.stopTranscriptionPolling();
            }
        }, 1000); // Poll every 1 second for faster UI updates
    }

    async fetchLatestTranscriptions() {
        try {
            const response = await fetch(`${this.baseUrl}/interactions?limit=10`);
            if (response.ok) {
                const interactions = await response.json();

                // Check for new interactions since last check
                interactions.forEach(interaction => {
                    // Use more robust ID comparison - ensure both are strings
                    const interactionId = String(interaction.id);
                    const existingTranscription = this.transcriptions.find(t => String(t.id) === interactionId);

                    if (!existingTranscription) {
                        // Only add real transcriptions, not demo/test data on subsequent starts
                        // Skip demo transcriptions if we've already shown startup demo
                        const isTestData = interaction.text && (
                            interaction.text.includes('test transcription') ||
                            interaction.text.includes('example') ||
                            interaction.text.includes('demo') ||
                            interaction.text.includes('Mira is listening') ||
                            interaction.text.includes('Hello, this is a test') ||
                            interaction.text.includes('Voice recognition is working') ||
                            interaction.text.includes('The microphone is picking up') ||
                            interaction.text.includes('Audio processing is functioning') ||
                            interaction.text.includes('This is speaker recognition test')
                        );

                        if (!isTestData || !this.hasShownStartupDemo) {
                            console.log(`Adding new transcription: ${interactionId}`);
                            this.addTranscriptionFromInteraction(interaction);
                            if (isTestData) {
                                this.hasShownStartupDemo = true;
                            }
                        } else {
                            console.log(`Skipping test data: ${interaction.text.substring(0, 50)}...`);
                        }
                    } else {
                        console.log(`Skipping existing transcription: ${interactionId}`);
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching transcriptions:', error);
        }
    }

    addTranscriptionFromInteraction(interaction) {
        const timestamp = new Date(interaction.timestamp).toLocaleTimeString();
        const speaker = interaction.speaker || interaction.user_id || 'Unknown'; // Handle different data formats
        const transcription = {
            text: interaction.text,
            timestamp: timestamp,
            speaker: speaker,
            id: interaction.id
        };

        this.transcriptions.push(transcription);

        // Remove empty state if present
        const emptyState = this.transcriptionContent.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        // Create transcription element
        const transcriptionElement = this.createTranscriptionElement(transcription);
        this.transcriptionContent.appendChild(transcriptionElement);

        // Scroll to bottom
        this.transcriptionContent.scrollTop = this.transcriptionContent.scrollHeight;

        // Limit number of transcriptions displayed
        if (this.transcriptions.length > 50) {
            this.transcriptions.shift();
            const firstElement = this.transcriptionContent.firstElementChild;
            if (firstElement && !firstElement.classList.contains('empty-state')) {
                firstElement.remove();
            }
        }
    }

    stopTranscriptionPolling() {
        // Stop any ongoing transcription polling
        if (this.transcriptionInterval) {
            console.log('Stopping transcription polling...');
            clearInterval(this.transcriptionInterval);
            this.transcriptionInterval = null;
        }
    }

    addTranscription(text, timestamp = null, speaker = null) {
        if (!timestamp) {
            timestamp = new Date().toLocaleTimeString();
        }
        if (!speaker) {
            speaker = 'Unknown';
        }

        const transcription = { text, timestamp, speaker, id: Date.now() };
        this.transcriptions.push(transcription);

        // Remove empty state if present
        const emptyState = this.transcriptionContent.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        // Create transcription element
        const transcriptionElement = this.createTranscriptionElement(transcription);
        this.transcriptionContent.appendChild(transcriptionElement);

        // Scroll to bottom
        this.transcriptionContent.scrollTop = this.transcriptionContent.scrollHeight;

        // Limit number of transcriptions displayed
        if (this.transcriptions.length > 50) {
            this.transcriptions.shift();
            const firstElement = this.transcriptionContent.firstElementChild;
            if (firstElement && !firstElement.classList.contains('empty-state')) {
                firstElement.remove();
            }
        }
    }

    createTranscriptionElement(transcription) {
        const element = document.createElement('div');
        element.className = 'transcription-item';

        // Get speaker color
        const speakerColor = this.getSpeakerColor(transcription.speaker);

        element.style.borderLeftColor = speakerColor.border;
        element.style.backgroundColor = speakerColor.background;

        element.innerHTML = `
            <div class="speaker-info" style="color: ${speakerColor.text};">
                <span class="speaker-name">Speaker ${transcription.speaker}</span>
                <span class="timestamp">${transcription.timestamp}</span>
            </div>
            <div class="text">${transcription.text}</div>
        `;
        return element;
    }

    getSpeakerColor(speaker) {
        // Create a mapping of speakers to different shades of green
        const speakerIndex = parseInt(speaker) || this.getOrAssignSpeakerIndex(speaker);

        // Different shades of green for different speakers
        const greenShades = [
            { background: '#f0fffa', border: '#00ff88', text: '#00cc6a' }, // Speaker 1 - Light mint
            { background: '#e6fffa', border: '#00e074', text: '#00b359' }, // Speaker 2 - Slightly darker
            { background: '#dcfdf7', border: '#00d15a', text: '#009944' }, // Speaker 3 - Even darker
            { background: '#d1fae5', border: '#00c249', text: '#007f30' }, // Speaker 4 - Forest green
            { background: '#a7f3d0', border: '#00b33a', text: '#00661f' }, // Speaker 5 - Deep green
            { background: '#6ee7b7', border: '#00a42c', text: '#004d0f' }, // Speaker 6 - Very dark green
        ];

        // Cycle through colors if more speakers than available shades
        return greenShades[speakerIndex % greenShades.length];
    }

    getOrAssignSpeakerIndex(speaker) {
        // Keep track of speaker assignments to maintain consistent colors
        if (!this.speakerIndexMap) {
            this.speakerIndexMap = new Map();
            this.nextSpeakerIndex = 0;
        }

        if (!this.speakerIndexMap.has(speaker)) {
            this.speakerIndexMap.set(speaker, this.nextSpeakerIndex);
            this.nextSpeakerIndex++;
        }

        return this.speakerIndexMap.get(speaker);
    }

    async clearTranscriptions() {
        try {
            // Call backend API to clear all interactions from database
            const response = await fetch(`${this.baseUrl}/interactions`, {
                method: 'DELETE'
            });

            if (response.ok) {
                const result = await response.json();
                console.log('Database cleared:', result);

                // Clear local transcriptions
                this.transcriptions = [];
                this.transcriptionContent.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-robot"></i>
                        <p>No conversations yet</p>
                        <small>Start speaking to interact with your AI assistant</small>
                    </div>
                `;

                // Show success message briefly
                this.showMessage(`Cleared ${result.deleted_count || 0} interactions from database`);
            } else {
                console.error('Failed to clear database:', response.status, response.statusText);
                this.showMessage('Failed to clear interactions from database');
            }
        } catch (error) {
            console.error('Error clearing interactions:', error);
            this.showMessage('Error clearing interactions: ' + error.message);
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
        
        // Animate in
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 10);
        
        // Auto-remove after delay
        const duration = Math.max(3000, Math.min(8000, message.length * 50)); // 3-8 seconds based on length
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, duration);
        
        // Allow manual dismiss on click
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
        // Initial connection check
        this.checkConnection();

        // Check connection every 5 seconds
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 5000);
    }
    
    // Debug method to show audio processing statistics
    showAudioStats() {
        const stats = this.audioProcessingStats;
        console.log('📊 Audio Processing Statistics:');
        console.log(`- Total audio segments sent: ${stats.totalAudioSent}`);
        console.log(`- Total bytes sent: ${stats.totalAudioBytes.toLocaleString()}`);
        console.log(`- Successful requests: ${stats.successfulRequests}`);
        console.log(`- Failed requests: ${stats.failedRequests}`);
        console.log(`- Success rate: ${stats.totalAudioSent > 0 ? ((stats.successfulRequests / (stats.successfulRequests + stats.failedRequests)) * 100).toFixed(1) : 0}%`);
        console.log(`- Average audio duration: ${stats.averageAudioDuration.toFixed(2)}s`);
        console.log(`- VAD status: ${this.isRecording ? 'Recording' : 'Stopped'}`);
        console.log(`- Backend connection: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
        
        // Show in UI as well
        this.showMessage(`Audio Stats: ${stats.totalAudioSent} segments sent, ${stats.successfulRequests} successful, ${stats.failedRequests} failed`, 'info');
        
        return stats;
    }
    
    // Test backend connectivity with detailed reporting
    async testBackendConnection() {
        console.log('🔗 Testing backend connection...');
        
        try {
            // Test basic connection
            const startTime = Date.now();
            const response = await fetch(`${this.baseUrl}/`, {
                method: 'GET',
                cache: 'no-cache'
            });
            const responseTime = Date.now() - startTime;
            
            console.log(`- Response time: ${responseTime}ms`);
            console.log(`- Status: ${response.status} ${response.statusText}`);
            
            if (response.ok) {
                const data = await response.json();
                console.log('- Backend response:', data);
                
                // Test the register_interaction endpoint with dummy data
                console.log('🎵 Testing audio endpoint...');
                const dummyAudio = new Uint8Array(1600); // 0.1s of silence at 16kHz
                
                const audioTestStart = Date.now();
                const audioResponse = await fetch(`${this.baseUrl}/register_interaction`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/octet-stream'
                    },
                    body: dummyAudio
                });
                const audioResponseTime = Date.now() - audioTestStart;
                
                console.log(`- Audio endpoint response time: ${audioResponseTime}ms`);
                console.log(`- Audio endpoint status: ${audioResponse.status} ${audioResponse.statusText}`);
                
                if (audioResponse.ok) {
                    const audioResult = await audioResponse.json();
                    console.log('- Audio endpoint response:', audioResult);
                    this.showMessage('Backend connection test successful!', 'info');
                } else {
                    const errorText = await audioResponse.text();
                    console.log('- Audio endpoint error:', errorText);
                    this.showMessage('Backend connection OK, but audio endpoint has issues', 'warning');
                }
            } else {
                this.showMessage('Backend connection failed', 'error');
            }
            
        } catch (error) {
            console.error('Backend connection test failed:', error);
            this.showMessage('Backend connection test failed: ' + error.message, 'error');
        }
    }

    // Cleanup method for when the app is closing
    async cleanup() {
        console.log('Cleaning up Mira Desktop App...');

        // Stop VAD audio capture if active
        if (this.isRecording && this.micVAD) {
            await this.stopAudioCapture();
        }

        // Clear intervals
        if (this.connectionCheckInterval) {
            clearInterval(this.connectionCheckInterval);
        }

        if (this.transcriptionInterval) {
            clearInterval(this.transcriptionInterval);
        }

        // Deregister client properly - make it synchronous for cleanup
        if (this.isRegistered) {
            try {
                await this.deregisterClient();
            } catch (error) {
                console.error('Error during cleanup deregistration:', error);
            }
        }
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.miraApp = new MiraDesktop();

    // Handle cleanup signal from main process
    if (window.electronAPI) {
        window.electronAPI.onAppClosing(() => {
            if (window.miraApp) {
                window.miraApp.cleanup();
            }
        });
    }

    // Handle app cleanup on window close - simplified to prevent multiple deregistration attempts
    window.addEventListener('beforeunload', async () => {
        if (window.miraApp && window.miraApp.isRegistered && !window.miraApp._deregistrationAttempted) {
            // Use navigator.sendBeacon for reliable cleanup during page unload
            const url = `${window.miraApp.baseUrl}/deregister_client?client_id=${encodeURIComponent(window.miraApp.clientId)}`;
            navigator.sendBeacon(url, '');
            window.miraApp._deregistrationAttempted = true;
        }
    });

    // Also handle when the Electron app is about to quit - simplified to prevent duplicates
    window.addEventListener('unload', () => {
        if (window.miraApp && window.miraApp.isRegistered && !window.miraApp._deregistrationAttempted) {
            const url = `${window.miraApp.baseUrl}/deregister_client?client_id=${encodeURIComponent(window.miraApp.clientId)}`;
            navigator.sendBeacon(url, '');
            window.miraApp._deregistrationAttempted = true;
        }
    });
});

// Handle keyboard shortcuts globally
document.addEventListener('keydown', (e) => {
    // Space bar to toggle listening (when not in input field)
    if (e.code === 'Space' && !e.target.matches('input, textarea, [contenteditable]')) {
        e.preventDefault();
        if (window.miraApp && window.miraApp.isConnected) {
            window.miraApp.toggleListening();
        }
    }
    
    // Debug shortcuts (Ctrl+Shift+D for debug stats, Ctrl+Shift+M for debug mode toggle)
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
    
    // Backend connection test (Ctrl+Shift+T)
    if (e.ctrlKey && e.shiftKey && e.code === 'KeyT') {
        e.preventDefault();
        if (window.miraApp) {
            window.miraApp.testBackendConnection();
        }
    }
});