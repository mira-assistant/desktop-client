// Mira Desktop Renderer Process
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

        // Audio capture properties
        this.mediaStream = null;
        this.audioContext = null;
        this.audioProcessor = null;
        this.audioChunks = [];
        this.isRecording = false;
        this.lastAudioSent = 0; // Timestamp of last audio send
        this.audioSendThrottle = 500; // Throttle for audio sending

        this.initializeElements();
        this.setupEventListeners();
        this.startConnectionCheck();
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
            return;
        }

        this.isToggling = true;

        try {
            // Provide immediate UI feedback
            this.micButton.disabled = true;
            this.micStatusText.textContent = this.isListening ? 'Stopping...' : 'Starting...';

            if (this.isListening) {
                await this.stopListening();
            } else {
                await this.startListening();
            }
        } catch (error) {
            console.error('Error toggling listening:', error);
            this.showMessage('Error: ' + error.message);
            // Reset UI state on error
            this.updateListeningUI(this.isListening);
        } finally {
            this.isToggling = false;
            this.micButton.disabled = false;
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

            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            console.log('Microphone access granted, setting up audio processing...');

            // Create audio context
            this.audioContext = new AudioContext({ sampleRate: 16000 });
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Create a script processor for audio data - using 4096 buffer for stable capture
            this.audioProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);

            this.audioChunks = [];
            this.isRecording = true;

            // Simple time-based audio processing without complex VAD
            this.audioProcessor.onaudioprocess = (event) => {
                if (this.isRecording) {
                    const inputData = event.inputBuffer.getChannelData(0);

                    // Convert to 16-bit PCM
                    const pcmData = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                    }

                    // Always add to audio chunks
                    this.audioChunks.push(pcmData);

                    // Check if we have enough audio data to send (about 2 seconds worth)
                    const totalSamples = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                    const durationSeconds = totalSamples / 16000;

                    // Send audio when we have at least 2 seconds of data
                    if (durationSeconds >= 2.0) {
                        console.log(`Sending ${durationSeconds.toFixed(2)}s of audio to backend`);
                        this.sendAudioToBackend();
                    }
                }
            };

            // Connect the audio pipeline
            source.connect(this.audioProcessor);
            this.audioProcessor.connect(this.audioContext.destination);

            console.log('Audio capture started successfully');
        } catch (error) {
            console.error('Error starting audio capture:', error);
            this.showMessage('Microphone access denied. Please allow microphone access and try again.');
            throw error;
        }
    }

    async stopAudioCapture() {
        try {
            this.isRecording = false;

            // Send any remaining audio data if we have some
            if (this.audioChunks.length > 0) {
                await this.sendAudioToBackend();
            }

            // Clean up audio resources
            if (this.audioProcessor) {
                this.audioProcessor.disconnect();
                this.audioProcessor = null;
            }

            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
            }

            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
                this.mediaStream = null;
            }

            this.audioChunks = [];
            console.log('Audio capture stopped');
        } catch (error) {
            console.error('Error stopping audio capture:', error);
        }
    }

    async sendAudioToBackend() {
        if (this.audioChunks.length === 0 || this.isProcessingAudio) return;

        // Light throttle to prevent overwhelming the backend
        const now = Date.now();
        if (now - this.lastAudioSent < this.audioSendThrottle) {
            return;
        }

        this.isProcessingAudio = true;
        this.lastAudioSent = now;

        const chunksToProcess = this.audioChunks.length;
        console.log(`Sending ${chunksToProcess} audio chunks to backend (${now})...`);

        try {
            // Combine all audio chunks into a single buffer
            const totalLength = this.audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
            const combinedBuffer = new Int16Array(totalLength);
            let offset = 0;

            for (const chunk of this.audioChunks) {
                combinedBuffer.set(chunk, offset);
                offset += chunk.length;
            }

            // Convert to bytes for backend
            const audioBytes = new Uint8Array(combinedBuffer.buffer);
            console.log(`Sending ${audioBytes.length} bytes of audio data to backend`);

            // Clear processed chunks immediately to prevent reprocessing
            this.audioChunks = [];

            // Send to backend with optimized fetch options
            const response = await fetch(`${this.baseUrl}/register_interaction`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: audioBytes,
                // Add performance optimizations
                keepalive: true,
                cache: 'no-cache'
            });

            if (response.ok) {
                const result = await response.json();
                if (result.message !== "Duplicate transcription skipped") {
                    console.log('Audio processed successfully:', result);
                } else {
                    console.log('Duplicate transcription was skipped');
                }
                // The transcription polling will pick up any new interactions
            } else {
                const errorText = await response.text();
                console.error('Failed to process audio:', response.status, response.statusText, errorText);
            }

        } catch (error) {
            console.error('Error sending audio to backend:', error);
        } finally {
            this.isProcessingAudio = false;
        }
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

    showMessage(message) {
        // Simple message display - could be enhanced with toast notifications
        console.log('Message:', message);
        // You could add a toast notification system here
    }

    startConnectionCheck() {
        // Initial connection check
        this.checkConnection();

        // Check connection every 5 seconds
        this.connectionCheckInterval = setInterval(() => {
            this.checkConnection();
        }, 5000);
    }

    // Cleanup method for when the app is closing
    async cleanup() {
        console.log('Cleaning up Mira Desktop App...');

        // Stop audio capture if active
        if (this.isRecording) {
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
});