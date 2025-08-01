/**
 * API Service for Mira Desktop Application
 * Handles all HTTP requests to the backend server
 */

import { API_CONFIG, API_ENDPOINTS, ERROR_MESSAGES } from './constants.js';
import { ApiResponse, Person, Interaction, Conversation, Action } from './models.js';

export class ApiService {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        this.clientId = API_CONFIG.CLIENT_ID;
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
            const response = await fetch(url, {
                ...options,
                signal: controller.abort,
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
     * @returns {Promise<ApiResponse>}
     */
    async healthCheck() {
        return await this.makeRequest(API_ENDPOINTS.HEALTH_CHECK, { method: 'GET' });
    }

    /**
     * Register client with backend
     * @returns {Promise<ApiResponse>}
     */
    async registerClient() {
        const endpoint = `${API_ENDPOINTS.CLIENT_REGISTER}/${encodeURIComponent(this.clientId)}`;
        return await this.makeRequest(endpoint, { method: 'POST' });
    }

    /**
     * Deregister client from backend
     * @returns {Promise<ApiResponse>}
     */
    async deregisterClient() {
        const endpoint = `${API_ENDPOINTS.CLIENT_DEREGISTER}/${encodeURIComponent(this.clientId)}`;
        return await this.makeRequest(endpoint, { method: 'POST' });
    }

    /**
     * Enable listening service
     * @returns {Promise<ApiResponse>}
     */
    async enableService() {
        return await this.makeRequest(API_ENDPOINTS.SERVICE_ENABLE, {
            method: 'POST',
            body: JSON.stringify({ client_id: this.clientId })
        });
    }

    /**
     * Disable listening service with retry logic
     * @param {number} maxRetries - Maximum number of retry attempts
     * @param {number} timeout - Request timeout
     * @returns {Promise<ApiResponse>}
     */
    async disableService(maxRetries = API_CONFIG.RETRY_CONFIG.MAX_RETRIES, timeout = API_CONFIG.TIMEOUTS.BACKEND_STOP_REQUEST) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const response = await this.makeRequest(API_ENDPOINTS.SERVICE_DISABLE, {
                method: 'POST',
                body: JSON.stringify({ client_id: this.clientId })
            }, timeout);

            if (response.success) {
                return response;
            }

            if (attempt < maxRetries) {
                /** Exponential backoff delay */
                const delay = API_CONFIG.RETRY_CONFIG.BACKOFF_DELAY * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        return ApiResponse.error('Failed to disable service after retries', 500);
    }

    /**
     * Register audio interaction
     * @param {ArrayBuffer} audioData - Audio data buffer
     * @param {string} format - Audio format (e.g., 'wav')
     * @returns {Promise<ApiResponse>}
     */
    async registerInteraction(audioData, format = 'wav') {
        const formData = new FormData();
        const audioBlob = new Blob([audioData], { type: `audio/${format}` });
        formData.append('audio', audioBlob, `audio.${format}`);
        formData.append('client_id', this.clientId);

        return await this.makeRequest(API_ENDPOINTS.INTERACTIONS_REGISTER, {
            method: 'POST',
            body: formData,
            headers: {} // Remove Content-Type to let browser set it for FormData
        });
    }

    /**
     * Get interaction by ID
     * @param {string} interactionId - Interaction UUID
     * @returns {Promise<ApiResponse>}
     */
    async getInteraction(interactionId) {
        const endpoint = `${API_ENDPOINTS.INTERACTIONS}/${interactionId}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        if (response.success && response.data) {
            response.data = Interaction.fromApiResponse(response.data);
        }
        
        return response;
    }

    /**
     * Get all interactions with optional filtering
     * @param {Object} filters - Query filters
     * @returns {Promise<ApiResponse>}
     */
    async getInteractions(filters = {}) {
        const queryParams = new URLSearchParams(filters);
        const endpoint = `${API_ENDPOINTS.INTERACTIONS}?${queryParams}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        if (response.success && response.data && Array.isArray(response.data)) {
            response.data = response.data.map(item => Interaction.fromApiResponse(item));
        }
        
        return response;
    }

    /**
     * Get speaker/person by ID
     * @param {string} speakerId - Speaker UUID
     * @returns {Promise<ApiResponse>}
     */
    async getSpeaker(speakerId) {
        const endpoint = `${API_ENDPOINTS.SPEAKERS}/${speakerId}`;
        const response = await this.makeRequest(endpoint, { method: 'GET' });
        
        if (response.success && response.data) {
            response.data = Person.fromApiResponse(response.data);
        }
        
        return response;
    }

    /**
     * Get all speakers/persons
     * @returns {Promise<ApiResponse>}
     */
    async getSpeakers() {
        const response = await this.makeRequest(API_ENDPOINTS.SPEAKERS, { method: 'GET' });
        
        if (response.success && response.data && Array.isArray(response.data)) {
            response.data = response.data.map(item => Person.fromApiResponse(item));
        }
        
        return response;
    }

    /**
     * Delete interaction by ID
     * @param {string} interactionId - Interaction UUID
     * @returns {Promise<ApiResponse>}
     */
    async deleteInteraction(interactionId) {
        const endpoint = `${API_ENDPOINTS.INTERACTIONS}/${interactionId}`;
        return await this.makeRequest(endpoint, { method: 'DELETE' });
    }

    /**
     * Delete speaker by ID
     * @param {string} speakerId - Speaker UUID
     * @returns {Promise<ApiResponse>}
     */
    async deleteSpeaker(speakerId) {
        const endpoint = `${API_ENDPOINTS.SPEAKERS}/${speakerId}`;
        return await this.makeRequest(endpoint, { method: 'DELETE' });
    }

    /**
     * Create new conversation
     * @param {Object} conversationData - Conversation data
     * @returns {Promise<ApiResponse>}
     */
    async createConversation(conversationData) {
        const response = await this.makeRequest('/conversations', {
            method: 'POST',
            body: JSON.stringify(conversationData)
        });
        
        if (response.success && response.data) {
            response.data = Conversation.fromApiResponse(response.data);
        }
        
        return response;
    }

    /**
     * Get conversation by ID
     * @param {string} conversationId - Conversation UUID
     * @returns {Promise<ApiResponse>}
     */
    async getConversation(conversationId) {
        const response = await this.makeRequest(`/conversations/${conversationId}`, { method: 'GET' });
        
        if (response.success && response.data) {
            response.data = Conversation.fromApiResponse(response.data);
        }
        
        return response;
    }

    /**
     * Create new action
     * @param {Object} actionData - Action data
     * @returns {Promise<ApiResponse>}
     */
    async createAction(actionData) {
        const response = await this.makeRequest('/actions', {
            method: 'POST',
            body: JSON.stringify(actionData)
        });
        
        if (response.success && response.data) {
            response.data = Action.fromApiResponse(response.data);
        }
        
        return response;
    }

    /**
     * Get action by ID
     * @param {string} actionId - Action UUID
     * @returns {Promise<ApiResponse>}
     */
    async getAction(actionId) {
        const response = await this.makeRequest(`/actions/${actionId}`, { method: 'GET' });
        
        if (response.success && response.data) {
            response.data = Action.fromApiResponse(response.data);
        }
        
        return response;
    }

    /**
     * Delete all interactions
     * @returns {Promise<ApiResponse>}
     */
    async deleteAllInteractions() {
        return await this.makeRequest(API_ENDPOINTS.INTERACTIONS, { method: 'DELETE' });
    }

    /**
     * Update action status
     * @param {string} actionId - Action UUID
     * @param {string} status - New status
     * @returns {Promise<ApiResponse>}
     */
    async updateActionStatus(actionId, status) {
        return await this.makeRequest(`/actions/${actionId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
    }
}