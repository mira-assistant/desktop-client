/**
 * API Service for Mira Desktop Application
 * Self-managing service that handles all HTTP requests and maintains connection state
 * @extends EventTarget
 */

import { API_CONFIG, API_ENDPOINTS, ERROR_MESSAGES } from './constants.js';
import { ApiResponse, Person, Interaction, Conversation, Action } from './models.js';

export class ApiService extends EventTarget {
    /**
     * Initialize API service with automatic health checking and connection management
     */
    constructor() {
        super();
        this.baseUrl = null;
        this.clientId = 'desktop-client'; // Default client ID
        this.isConnected = false;
        this.isRegistered = false;
        this.recentInteractionIds = new Set();
        this.healthCheckInterval = null;
        this.serviceEnabled = null; // Track service enabled state
        
        /** Start automatic health checking */
        this.startHealthChecking();
    }

    /**
     * Start automatic health checking that runs every second
     * Attempts to connect to available servers and maintains connection state
     */
    startHealthChecking() {
        this.checkConnection();
        this.healthCheckInterval = setInterval(() => {
            this.checkConnection();
        }, API_CONFIG.TIMEOUTS.HEALTH_CHECK_INTERVAL);
    }

    /**
     * Stop automatic health checking
     */
    stopHealthChecking() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    /**
     * Check connection to available servers and establish connection
     * Emits 'connectionChange' event when connection status changes
     * Emits 'statusChange' event when service enabled status changes
     */
    async checkConnection() {
        let urls = Object.fromEntries(API_CONFIG.BASE_URLS);

        if (this.baseUrl) {
            urls = { "cachedUrl": this.baseUrl, ...urls };
        }

        let connected = false;

        for (const [hostName, url] of Object.entries(urls)) {
            try {
                const tempBaseUrl = this.baseUrl;
                this.baseUrl = url;
                
                const healthData = await this.healthCheck();
                
                if (healthData) {
                    this.baseUrl = url;
                    const wasConnected = this.isConnected;
                    this.isConnected = true;

                    if (!this.isRegistered) {
                        await this.registerClient();
                    }

                    /** Check for new interactions and emit event if changed */
                    if (healthData.recent_interactions) {
                        this.updateRecentInteractions(healthData.recent_interactions);
                    }

                    /** Check for service status changes and emit event if changed */
                    const currentServiceEnabled = healthData.enabled !== undefined ? healthData.enabled : true;
                    if (this.serviceEnabled !== null && this.serviceEnabled !== currentServiceEnabled) {
                        this.dispatchEvent(new CustomEvent('statusChange', {
                            detail: { enabled: currentServiceEnabled }
                        }));
                    }
                    this.serviceEnabled = currentServiceEnabled;

                    /** Emit connection change event if status changed */
                    if (!wasConnected) {
                        this.dispatchEvent(new CustomEvent('connectionChange', {
                            detail: { connected: true, hostName, url }
                        }));
                    }

                    connected = true;
                    break;
                } else {
                    this.baseUrl = tempBaseUrl;
                }
            } catch {
                /** Continue to next URL */
            }
        }

        if (!connected && this.isConnected) {
            this.isConnected = false;
            this.isRegistered = false;
            this.serviceEnabled = null; // Reset service status when disconnected
            this.dispatchEvent(new CustomEvent('connectionChange', {
                detail: { connected: false }
            }));
        }
    }

    /**
     * Update recent interactions and emit event if changed
     * @param {Array} interactions - Array of interaction IDs
     */
    updateRecentInteractions(interactions) {
        const newIds = new Set(interactions);
        const hasChanges = newIds.size !== this.recentInteractionIds.size || 
                          [...newIds].some(id => !this.recentInteractionIds.has(id));

        if (hasChanges) {
            this.recentInteractionIds = newIds;
            this.dispatchEvent(new CustomEvent('interactionsUpdated', {
                detail: { interactionIds: Array.from(interactions) }
            }));
        }
    }

    /**
     * Make HTTP request with timeout and error handling
     * @param {string} endpoint - API endpoint path
     * @param {Object} options - Fetch options
     * @param {number} timeout - Request timeout in milliseconds
     * @returns {Promise<ApiResponse>}
     */
    async makeRequest(endpoint, options = {}, timeout = API_CONFIG.TIMEOUTS.DEFAULT_REQUEST) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            controller.abort();
        }, timeout);

        try {
            const url = `${this.baseUrl}${endpoint}`;
            
            /** Log attempted URL if in debug mode */
            if (typeof window !== 'undefined' && window.miraApp && window.miraApp.debugMode) {
                console.log(`[API DEBUG] Attempting request to: ${url}`, {
                    method: options.method || 'GET',
                    endpoint: endpoint,
                    baseUrl: this.baseUrl
                });
            }
            
            const response = await fetch(url, {
                ...options,
                signal: controller.signal,
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                }
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                return ApiResponse.error(
                    `HTTP ${response.status}: ${response.statusText}`,
                    response.status
                );
            }

            const data = await response.json();
            return ApiResponse.success(data, response.status);

        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === 'AbortError') {
                return ApiResponse.error(ERROR_MESSAGES.NETWORK.TIMEOUT, 408);
            }
            
            return ApiResponse.error(
                error.message || ERROR_MESSAGES.NETWORK.CONNECTION_FAILED,
                0
            );
        }
    }

    /**
     * Check server health status
     * @returns {Promise<Object|null>} Health data or null if failed
     */
    async healthCheck() {
        const response = await this.makeRequest(API_ENDPOINTS.HEALTH_CHECK, { method: 'GET' });
        return response.success ? response.data : null;
    }

    /**
     * Update client ID with proper deregistration and re-registration
     * @param {string} newClientId - New client identifier
     * @returns {Promise<boolean>} True if client ID updated successfully
     */
    async updateClientId(newClientId) {
        if (!newClientId || newClientId.trim() === '') {
            return false;
        }

        const oldClientId = this.clientId;
        /** Sanitize client ID: convert special characters to dashes and trim */
        const sanitizedClientId = newClientId.trim()
            .replace(/[^a-zA-Z0-9\-_]/g, '-')  // Replace special chars with dashes
            .replace(/-+/g, '-')                // Replace multiple dashes with single dash
            .replace(/^-|-$/g, '');             // Remove leading/trailing dashes
        
        /** No change needed */
        if (sanitizedClientId === oldClientId) {
            return true;
        }

        try {
            /** If currently registered, deregister old client first */
            if (this.isRegistered && this.isConnected) {
                await this.deregisterClient();
            }

            /** Update to new client ID */
            this.clientId = sanitizedClientId;

            /** If connected, register with new client ID */
            if (this.isConnected) {
                const registered = await this.registerClient();
                if (registered) {
                    this.dispatchEvent(new CustomEvent('clientIdChanged', {
                        detail: { oldClientId, newClientId: sanitizedClientId }
                    }));
                    return true;
                }
            } else {
                /** Not connected, just update the ID */
                this.dispatchEvent(new CustomEvent('clientIdChanged', {
                    detail: { oldClientId, newClientId: sanitizedClientId }
                }));
                return true;
            }
        } catch (error) {
            /** Revert on failure */
            this.clientId = oldClientId;
            console.warn('Failed to update client ID:', error.message);
            return false;
        }

        return false;
    }

    /**
     * Register client with backend
     * @returns {Promise<boolean>} True if registration successful
     */
    async registerClient() {
        const endpoint = `${API_ENDPOINTS.CLIENT_REGISTER}/${encodeURIComponent(this.clientId)}`;
        const response = await this.makeRequest(endpoint, { method: 'POST' });
        if (response.success) {
            this.isRegistered = true;
            return true;
        }
        return false;
    }

    /**
     * Deregister client from backend
     * @returns {Promise<boolean>} True if deregistration successful
     */
    async deregisterClient() {
        const endpoint = `${API_ENDPOINTS.CLIENT_DEREGISTER}/${encodeURIComponent(this.clientId)}`;
        const response = await this.makeRequest(endpoint, { method: 'POST' });
        if (response.success) {
            this.isRegistered = false;
            return true;
        }
        return false;
    }

    /**
     * Enable listening service
     * @returns {Promise<boolean>} True if service enabled successfully
     */
    async enableService() {
        const response = await this.makeRequest(API_ENDPOINTS.SERVICE_ENABLE, {
            method: 'POST',
            body: JSON.stringify({ client_id: this.clientId })
        });
        return response.success;
    }

    /**
     * Disable listening service with retry logic
     * @param {number} maxRetries - Maximum number of retry attempts
     * @param {number} timeout - Request timeout
     * @returns {Promise<boolean>} True if service disabled successfully
     */
    async disableService(maxRetries = API_CONFIG.RETRY_CONFIG.MAX_RETRIES, timeout = API_CONFIG.TIMEOUTS.BACKEND_STOP_REQUEST) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const response = await this.makeRequest(API_ENDPOINTS.SERVICE_DISABLE, {
                method: 'POST',
                body: JSON.stringify({ client_id: this.clientId })
            }, timeout);

            if (response.success) {
                return true;
            }

            if (attempt < maxRetries) {
                /** Exponential backoff delay */
                const delay = API_CONFIG.RETRY_CONFIG.BACKOFF_DELAY * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        return false;
    }

    /**
     * Register audio interaction
     * @param {ArrayBuffer} audioData - Audio data buffer
     * @param {string} format - Audio format (e.g., 'wav')
     * @returns {Promise<Interaction|null>} Interaction object or null if failed
     */
    async registerInteraction(audioData, format = 'wav') {
        const formData = new FormData();
        const audioBlob = new Blob([audioData], { type: `audio/${format}` });
        formData.append('audio', audioBlob, `audio.${format}`);
        formData.append('client_id', this.clientId);

        const response = await this.makeRequest(API_ENDPOINTS.INTERACTIONS_REGISTER, {
            method: 'POST',
            body: formData,
            headers: {} // Remove Content-Type to let browser set it for FormData
        });

        return response.success && response.data ? Interaction.fromApiResponse(response.data) : null;
    }

    /**
     * Get interaction by ID
     * @param {string} interactionId - Interaction UUID
     * @returns {Promise<Interaction|null>} Interaction object or null if not found
     */
    async getInteraction(interactionId) {
        const endpoint = `${API_ENDPOINTS.INTERACTIONS}/${interactionId}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        return response.success && response.data ? Interaction.fromApiResponse(response.data) : null;
    }

    /**
     * Get all interactions with optional filtering
     * @param {Object} filters - Query filters
     * @returns {Promise<Array<Interaction>>} Array of interaction objects
     */
    async getInteractions(filters = {}) {
        const queryParams = new URLSearchParams(filters);
        const endpoint = `${API_ENDPOINTS.INTERACTIONS}?${queryParams}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        if (response.success && response.data && Array.isArray(response.data)) {
            return response.data.map(item => Interaction.fromApiResponse(item));
        }
        
        return [];
    }

    /**
     * Delete interaction by ID
     * @param {string} interactionId - Interaction UUID
     * @returns {Promise<boolean>} True if deletion successful
     */
    async deleteInteraction(interactionId) {
        const endpoint = `${API_ENDPOINTS.INTERACTIONS}/${interactionId}`;
        const response = await this.makeRequest(endpoint, { method: 'DELETE' });
        return response.success;
    }

    /**
     * Delete all interactions
     * @returns {Promise<boolean>} True if deletion successful
     */
    async deleteAllInteractions() {
        const response = await this.makeRequest(API_ENDPOINTS.INTERACTIONS, { method: 'DELETE' });
        return response.success;
    }

    /**
     * Get person by ID
     * @param {string} personId - Person UUID
     * @returns {Promise<Person|null>} Person object or null if not found
     */
    async getPerson(personId) {
        const endpoint = `${API_ENDPOINTS.SPEAKERS}/${personId}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        return response.success && response.data ? Person.fromApiResponse(response.data) : null;
    }

    /**
     * Get all persons
     * @returns {Promise<Array<Person>>} Array of person objects
     */
    async getPersons() {
        const response = await this.makeRequest(API_ENDPOINTS.SPEAKERS, { method: 'GET' });
        
        if (response.success && response.data && Array.isArray(response.data)) {
            return response.data.map(item => Person.fromApiResponse(item));
        }
        
        return [];
    }

    /**
     * Get conversation by ID
     * @param {string} conversationId - Conversation UUID
     * @returns {Promise<Conversation|null>} Conversation object or null if not found
     */
    async getConversation(conversationId) {
        const endpoint = `${API_ENDPOINTS.CONVERSATIONS}/${conversationId}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        return response.success && response.data ? Conversation.fromApiResponse(response.data) : null;
    }

    /**
     * Get all conversations
     * @returns {Promise<Array<Conversation>>} Array of conversation objects
     */
    async getConversations() {
        const response = await this.makeRequest(API_ENDPOINTS.CONVERSATIONS, { method: 'GET' });
        
        if (response.success && response.data && Array.isArray(response.data)) {
            return response.data.map(item => Conversation.fromApiResponse(item));
        }
        
        return [];
    }

    /**
     * Get action by ID
     * @param {string} actionId - Action UUID
     * @returns {Promise<Action|null>} Action object or null if not found
     */
    async getAction(actionId) {
        const endpoint = `${API_ENDPOINTS.ACTIONS}/${actionId}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        return response.success && response.data ? Action.fromApiResponse(response.data) : null;
    }

    /**
     * Get all actions
     * @returns {Promise<Array<Action>>} Array of action objects
     */
    async getActions() {
        const response = await this.makeRequest(API_ENDPOINTS.ACTIONS, { method: 'GET' });
        
        if (response.success && response.data && Array.isArray(response.data)) {
            return response.data.map(item => Action.fromApiResponse(item));
        }
        
        return [];
    }

    /**
     * Update action status
     * @param {string} actionId - Action UUID
     * @param {string} status - New status
     * @returns {Promise<Action|null>} Updated action object or null if failed
     */
    async updateActionStatus(actionId, status) {
        const response = await this.makeRequest(`/actions/${actionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        
        return response.success && response.data ? Action.fromApiResponse(response.data) : null;
    }

    /**
     * Clean up API service resources
     */
    destroy() {
        this.stopHealthChecking();
        this.isConnected = false;
        this.isRegistered = false;
        this.recentInteractionIds.clear();
    }
}