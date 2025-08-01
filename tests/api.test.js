/**
 * Unit tests for api.js
 * Tests API service functionality with mocked HTTP requests
 */

import { ApiService } from '../api.js';

// Mock fetch globally for all tests
global.fetch = jest.fn();

describe('ApiService', () => {
    let apiService;

    beforeEach(() => {
        // Reset fetch mock before each test
        fetch.mockClear();
        
        // Create fresh API service instance
        apiService = new ApiService();
        
        // Stop health checking to prevent interference with tests
        apiService.stopHealthChecking();
    });

    afterEach(() => {
        // Clean up after each test
        apiService.stopHealthChecking();
    });

    describe('Constructor and Initialization', () => {
        test('should initialize with default values', () => {
            expect(apiService.baseUrl).toBeNull();
            expect(apiService.clientId).toBe('Mira Desktop App');
            expect(apiService.isConnected).toBe(false);
            expect(apiService.isRegistered).toBe(false);
            expect(apiService.recentInteractionIds).toBeInstanceOf(Set);
            expect(apiService.features).toEqual({});
        });

        test('should extend EventTarget', () => {
            expect(apiService).toBeInstanceOf(EventTarget);
            expect(typeof apiService.addEventListener).toBe('function');
            expect(typeof apiService.removeEventListener).toBe('function');
            expect(typeof apiService.dispatchEvent).toBe('function');
        });
    });

    describe('Health Check and Connection', () => {
        test('should attempt connection to available servers', async () => {
            // Mock successful health check response
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: 'healthy',
                    features: { transcription: true, voice_analysis: true }
                })
            });

            await apiService.checkConnection();

            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/'),
                expect.objectContaining({
                    method: 'GET'
                })
            );
        });

        test('should handle failed connection attempts gracefully', async () => {
            // Mock failed fetch
            fetch.mockRejectedValueOnce(new Error('Network error'));

            // Should not throw
            await expect(apiService.checkConnection()).resolves.not.toThrow();
        });

        test('should emit connection change events', async () => {
            let eventFired = false;
            
            apiService.addEventListener('connectionChange', (event) => {
                eventFired = true;
                expect(event.detail).toHaveProperty('connected');
            });

            // Mock successful connection
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ status: 'healthy', features: {} })
            });

            await apiService.checkConnection();
            
            // Give time for event to fire
            await new Promise(resolve => setTimeout(resolve, 10));
            
            expect(eventFired).toBe(true);
        });
    });

    describe('API Methods', () => {
        beforeEach(() => {
            // Set up connected state for API method tests
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;
        });

        describe('getInteraction', () => {
            test('should retrieve interaction successfully', async () => {
                const mockInteraction = {
                    id: '123',
                    text: 'Test interaction',
                    timestamp: '2023-01-01T12:00:00Z',
                    conversation_id: 'conv-123',
                    speaker_id: 'speaker-123',
                    sentiment: 0.8
                };

                fetch.mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockInteraction
                });

                const interaction = await apiService.getInteraction('123');

                expect(interaction).toBeDefined();
                expect(interaction.id).toBe('123');
                expect(interaction.text).toBe('Test interaction');
            });

            test('should return null for non-existent interaction', async () => {
                fetch.mockResolvedValueOnce({
                    ok: false,
                    status: 404
                });

                const interaction = await apiService.getInteraction('nonexistent');

                expect(interaction).toBeNull();
            });

            test('should handle network errors gracefully', async () => {
                fetch.mockRejectedValueOnce(new Error('Network error'));

                const interaction = await apiService.getInteraction('123');

                expect(interaction).toBeNull();
            });
        });

        describe('registerClient', () => {
            test('should register client successfully', async () => {
                fetch.mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ message: 'Client registered successfully' })
                });

                const result = await apiService.registerClient();

                expect(result).toBe(true);
                expect(apiService.isRegistered).toBe(true);
                expect(fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/service/client/register'),
                    expect.objectContaining({
                        method: 'POST'
                    })
                );
            });

            test('should handle registration failure', async () => {
                fetch.mockRejectedValueOnce(new Error('Registration failed'));

                const result = await apiService.registerClient();

                expect(result).toBe(false);
                expect(apiService.isRegistered).toBe(false);
            });
        });

        describe('healthCheck', () => {
            test('should perform health check', async () => {
                fetch.mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ status: 'healthy' })
                });

                const result = await apiService.healthCheck();

                expect(result).toBeDefined();
                expect(fetch).toHaveBeenCalledWith(
                    expect.stringContaining('/'),
                    expect.objectContaining({
                        method: 'GET'
                    })
                );
            });
        });
    });

    describe('Request Handling', () => {
        beforeEach(() => {
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;
        });

        test('should handle successful requests', async () => {
            const mockData = { test: 'data' };
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockData
            });

            const result = await apiService.makeRequest('/test', { method: 'GET' });

            expect(result.success).toBe(true);
            expect(result.data).toEqual(mockData);
        });

        test('should handle HTTP error responses', async () => {
            fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            });

            const result = await apiService.makeRequest('/test', { method: 'GET' });

            expect(result.success).toBe(false);
            expect(result.status).toBe(500);
        });

        test('should handle network errors', async () => {
            fetch.mockRejectedValueOnce(new Error('Network error'));

            const result = await apiService.makeRequest('/test', { method: 'GET' });

            expect(result.success).toBe(false);
            expect(result.error).toContain('Network error');
        });
    });

    describe('Status Change Detection', () => {
        test('should emit statusChange event when service status changes', async () => {
            let statusChangeEventReceived = false;
            let receivedStatus = null;
            
            // Listen for statusChange events
            apiService.addEventListener('statusChange', (event) => {
                statusChangeEventReceived = true;
                receivedStatus = event.detail.enabled;
            });

            // First call establishes serviceEnabled = true
            fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    enabled: true,
                    recent_interactions: [],
                    features: {}
                })
            });

            await apiService.checkConnection();
            expect(apiService.serviceEnabled).toBe(true);
            expect(statusChangeEventReceived).toBe(false); // No event on first call

            // Second call changes serviceEnabled from true to false (should trigger event)
            fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    enabled: false,
                    recent_interactions: [],
                    features: {}
                })
            });

            await apiService.checkConnection();
            expect(apiService.serviceEnabled).toBe(false);
            expect(statusChangeEventReceived).toBe(true);
            expect(receivedStatus).toBe(false);
        });

        test('should track service enabled state correctly', async () => {
            // Mock health response with enabled: true
            fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    enabled: true,
                    recent_interactions: [],
                    features: {}
                })
            });

            await apiService.checkConnection();
            expect(apiService.serviceEnabled).toBe(true);

            // Mock health response with enabled: false
            fetch.mockResolvedValueOnce({
                ok: true,
                json: () => Promise.resolve({ 
                    enabled: false,
                    recent_interactions: [],
                    features: {}
                })
            });

            await apiService.checkConnection();
            expect(apiService.serviceEnabled).toBe(false);
        });

        test('should not emit statusChange event when status remains the same', async () => {
            let eventEmitted = false;
            
            // Listen for statusChange events
            apiService.addEventListener('statusChange', () => {
                eventEmitted = true;
            });

            // Mock health check responses with same status
            fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ 
                        enabled: true,
                        recent_interactions: [],
                        features: {}
                    })
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: () => Promise.resolve({ 
                        enabled: true,  // Same status, no event should be emitted
                        recent_interactions: [],
                        features: {}
                    })
                });

            await apiService.checkConnection();
            await apiService.checkConnection();
            
            expect(eventEmitted).toBe(false);
        });
    });

    describe('Cleanup', () => {
        test('should properly clean up resources', () => {
            // Stop health checking is equivalent to cleanup
            apiService.stopHealthChecking();
            
            expect(apiService.healthCheckInterval).toBeNull();
        });
    });
});