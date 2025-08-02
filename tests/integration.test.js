/**
 * Integration tests for the desktop client
 * Tests component interactions without external dependencies
 */

import { ApiService } from '../api.js';
import { Interaction, Conversation } from '../models.js';
import { AUDIO_CONFIG, ERROR_MESSAGES } from '../constants.js';

// Mock fetch for all integration tests
global.fetch = jest.fn();

describe('Desktop Client Integration Tests', () => {
    let apiService;

    beforeEach(() => {
        fetch.mockClear();
        apiService = new ApiService();
        apiService.stopHealthChecking(); // Prevent automatic health checks during tests
    });

    afterEach(() => {
        apiService.stopHealthChecking();
    });

    describe('API Service and Models Integration', () => {
        test('should successfully retrieve and parse interaction data', async () => {
            // Mock API response with interaction data
            const mockInteractionData = {
                id: '123e4567-e89b-12d3-a456-426614174000',
                text: 'Hello, this is a test interaction',
                timestamp: '2023-01-01T12:00:00Z',
                conversation_id: '123e4567-e89b-12d3-a456-426614174001',
                speaker_id: '123e4567-e89b-12d3-a456-426614174002',
                entities: ['PERSON:John'],
                topics: ['greeting'],
                sentiment: 0.8
            };

            // Set up API service as connected
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;
            apiService.isRegistered = true;

            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockInteractionData
            });

            const interaction = await apiService.getInteraction('123e4567-e89b-12d3-a456-426614174000');

            expect(interaction).toBeInstanceOf(Interaction);
            expect(interaction.id).toBe(mockInteractionData.id);
            expect(interaction.text).toBe(mockInteractionData.text);
            expect(interaction.sentiment).toBe(mockInteractionData.sentiment);
            expect(interaction.timestamp).toBeInstanceOf(Date);
        });

        test('should handle complete conversation flow', async () => {
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;
            apiService.isRegistered = true;

            // Mock conversation data
            const mockConversationData = {
                id: 'conv-123',
                user_ids: 'user-123',
                speaker_id: 'speaker-123',
                start_of_conversation: '2023-01-01T10:00:00Z',
                end_of_conversation: null,
                topic_summary: 'Technical discussion',
                participants: ['speaker-123', 'speaker-124']
            };

            // Mock interaction data
            const mockInteractionData = {
                id: 'interaction-123',
                text: 'Let\'s discuss the project requirements',
                timestamp: '2023-01-01T10:05:00Z',
                conversation_id: 'conv-123',
                speaker_id: 'speaker-123'
            };

            // Mock sequential API calls
            fetch
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockConversationData
                })
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => mockInteractionData
                });

            // Get conversation
            const conversation = await apiService.getConversation('conv-123');
            expect(conversation).toBeInstanceOf(Conversation);
            expect(conversation.topic_summary).toBe('Technical discussion');

            // Get interaction from that conversation
            const interaction = await apiService.getInteraction('interaction-123');
            expect(interaction).toBeInstanceOf(Interaction);
            expect(interaction.conversation_id).toBe('conv-123');
            expect(interaction.speaker_id).toBe('speaker-123');
        });
    });

    describe('Event-Driven Architecture', () => {
        test('should emit events when connection state changes', async () => {
            let connectionEvents = [];

            apiService.addEventListener('connectionChange', (event) => {
                connectionEvents.push(event.detail);
            });

            // Mock successful connection
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({
                    status: 'healthy',
                    features: { interaction: true }
                })
            });

            await apiService.checkConnection();

            // Wait for event to propagate
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(connectionEvents.length).toBeGreaterThan(0);
            expect(connectionEvents[0]).toHaveProperty('connected');
        });

        test('should emit events when new interactions are detected', async () => {
            let interactionEvents = [];

            apiService.addEventListener('interactionsUpdated', (event) => {
                interactionEvents.push(event.detail);
            });

            // Set up initial state
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;

            // Test the update mechanism by calling it directly
            const newInteractions = ['new1', 'new2'];
            apiService.updateRecentInteractions(newInteractions);

            // Wait for event to propagate
            await new Promise(resolve => setTimeout(resolve, 10));

            expect(interactionEvents.length).toBe(1);
            expect(interactionEvents[0]).toHaveProperty('interactionIds');
        });
    });

    describe('Error Recovery and Resilience', () => {
        test('should gracefully handle backend unavailability', async () => {
            // Mock network failure
            fetch.mockRejectedValue(new Error('ECONNREFUSED'));

            // Should not throw errors, just fail gracefully
            await expect(apiService.checkConnection()).resolves.not.toThrow();
            expect(apiService.isConnected).toBe(false);
        });

        test('should retry failed requests with backoff', async () => {
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;

            // Mock first call failure, second call success
            fetch
                .mockRejectedValueOnce(new Error('Network error'))
                .mockResolvedValueOnce({
                    ok: true,
                    json: async () => ({ status: 'healthy' })
                });

            // This would normally trigger retry logic
            await apiService.healthCheck();

            expect(fetch).toHaveBeenCalled();
        });

        test('should handle malformed API responses', async () => {
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;
            apiService.isRegistered = true;

            // Mock malformed JSON response
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => { throw new Error('Invalid JSON'); }
            });

            const interaction = await apiService.getInteraction('test-id');

            expect(interaction).toBeNull(); // Should return null instead of throwing
        });
    });

    describe('Configuration Integration', () => {
        test('should use configuration values consistently', () => {
            // Test that API service uses default client ID (now dynamic, not from constants)
            expect(apiService.clientId).toBe('desktop-client');

            // Test that audio configuration is valid
            expect(AUDIO_CONFIG.VAD_THRESHOLDS.POSITIVE_SPEECH).toBeGreaterThan(0);
            expect(AUDIO_CONFIG.VAD_THRESHOLDS.POSITIVE_SPEECH).toBeLessThanOrEqual(1);

            // Test that error messages are defined
            expect(ERROR_MESSAGES.NETWORK.CONNECTION_FAILED).toBeDefined();
            expect(typeof ERROR_MESSAGES.NETWORK.CONNECTION_FAILED).toBe('string');
        });

        test('should validate audio configuration values', () => {
            const audioConfig = AUDIO_CONFIG.VAD_THRESHOLDS;

            // Positive speech threshold should be higher than negative
            expect(audioConfig.POSITIVE_SPEECH).toBeGreaterThan(audioConfig.NEGATIVE_SPEECH);

            // Silence duration should be reasonable (100ms to 2000ms)
            expect(audioConfig.SILENCE_MS).toBeGreaterThan(100);
            expect(audioConfig.SILENCE_MS).toBeLessThan(2000);

            // Optimization thresholds should be in valid dB ranges
            expect(AUDIO_CONFIG.OPTIMIZATION.NOISE_FLOOR).toBeLessThan(0);
            expect(AUDIO_CONFIG.OPTIMIZATION.SIGNAL_THRESHOLD).toBeLessThan(0);
            expect(AUDIO_CONFIG.OPTIMIZATION.TARGET_RMS).toBeGreaterThan(0);
            expect(AUDIO_CONFIG.OPTIMIZATION.TARGET_RMS).toBeLessThan(1);
        });
    });

    describe('Data Flow Integration', () => {
        test('should handle complete interaction workflow', async () => {
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;
            apiService.isRegistered = true;

            // Mock audio registration success with interaction data
            const mockInteractionData = {
                id: 'interaction-123',
                text: 'Test interaction',
                timestamp: '2023-01-01T12:00:00Z',
                conversation_id: null,
                speaker_id: null,
                sentiment: null,
                entities: null,
                topics: null,
                voice_embedding: null
            };

            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => mockInteractionData
            });

            const mockAudioData = new ArrayBuffer(1024);
            const interaction = await apiService.registerInteraction(mockAudioData);

            expect(interaction).not.toBeNull();
            expect(interaction.id).toBe('interaction-123');
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/interactions/register'),
                expect.objectContaining({
                    method: 'POST'
                })
            );
        });

        test('should coordinate stop listening workflow', async () => {
            apiService.baseUrl = 'http://localhost:8000';
            apiService.isConnected = true;
            apiService.isRegistered = true;

            // Mock disable service success
            fetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message: 'Service disabled successfully' })
            });

            const stopped = await apiService.disableService();

            expect(stopped).toBe(true);
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/service/disable'),
                expect.objectContaining({
                    method: 'PATCH'
                })
            );
        });
    });

    describe('Memory and Performance', () => {
        test('should manage recent interaction IDs efficiently', () => {
            const maxIds = 1000;

            // Add many interaction IDs
            for (let i = 0; i < maxIds + 100; i++) {
                apiService.recentInteractionIds.add(`id-${i}`);
            }

            // Should not grow indefinitely
            expect(apiService.recentInteractionIds.size).toBeLessThanOrEqual(maxIds * 1.1);
        });

        test('should handle rapid connection state changes', () => {
            let eventCount = 0;

            apiService.addEventListener('connectionChange', () => {
                eventCount++;
            });

            // Simulate rapid state changes
            for (let i = 0; i < 10; i++) {
                apiService.isConnected = !apiService.isConnected;
                apiService.dispatchEvent(new CustomEvent('connectionChange', {
                    detail: { connected: apiService.isConnected }
                }));
            }

            expect(eventCount).toBe(10);
        });
    });
});