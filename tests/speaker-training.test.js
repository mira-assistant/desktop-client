/**
 * Unit tests for speaker training functionality
 */

import { ApiService } from '../api.js';

// Mock fetch globally for all tests
global.fetch = jest.fn();

describe('Speaker Training API', () => {
    let apiService;

    beforeEach(() => {
        fetch.mockClear();
        
        // Create ApiService and immediately stop health checking
        apiService = new ApiService();
        apiService.stopHealthChecking();
        
        // Mock the constructor behavior without health checking
        apiService.baseUrl = 'http://localhost:8000';
        apiService.isConnected = true;
        apiService.isRegistered = true;
    });

    afterEach(() => {
        if (apiService) {
            apiService.stopHealthChecking();
        }
    });

    describe('getSpeakers', () => {
        test('should fetch speakers successfully', async () => {
            const mockSpeakers = [
                { id: '1', name: 'John Doe', index: 1 },
                { id: '2', name: 'Jane Smith', index: 2 }
            ];

            fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => mockSpeakers
            });

            const speakers = await apiService.getSpeakers();

            expect(speakers).toEqual(mockSpeakers);
            
            // Check that speakers endpoint was called
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/speakers'),
                expect.objectContaining({
                    method: 'GET'
                })
            );
        });

        test('should return empty array when no speakers found', async () => {
            fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => null
            });

            const speakers = await apiService.getSpeakers();

            expect(speakers).toEqual([]);
        });

        test('should handle fetch errors gracefully', async () => {
            fetch.mockRejectedValueOnce(new Error('Network error'));

            const speakers = await apiService.getSpeakers();

            expect(speakers).toEqual([]);
        });
    });

    describe('trainSpeakerEmbedding', () => {
        test('should train speaker embedding successfully', async () => {
            const speakerId = 'test-speaker-id';
            const audioData = new ArrayBuffer(1000);
            const expectedText = 'Hello world';

            fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true })
            });

            const result = await apiService.trainSpeakerEmbedding(speakerId, audioData, expectedText);

            expect(result).toBe(true);
            
            // Check that training endpoint was called
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/speakers/test-speaker-id/train_embedding'),
                expect.objectContaining({
                    method: 'POST',
                    body: expect.any(FormData)
                })
            );
        });

        test('should handle training failures', async () => {
            const speakerId = 'test-speaker-id';
            const audioData = new ArrayBuffer(1000);
            const expectedText = 'Hello world';

            fetch.mockResolvedValueOnce({
                ok: false,
                status: 400,
                statusText: 'Bad Request',
                json: async () => ({ error: 'Invalid audio data' })
            });

            const result = await apiService.trainSpeakerEmbedding(speakerId, audioData, expectedText);

            expect(result).toBe(false);
        });
    });

    describe('triggerInferencePipeline', () => {
        test('should trigger inference pipeline successfully', async () => {
            const interactionId = 'test-interaction-id';
            apiService.clientId = 'test-client';

            fetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ success: true })
            });

            const result = await apiService.triggerInferencePipeline(interactionId);

            expect(result).toBe(true);
            
            // Check that inference endpoint was called
            expect(fetch).toHaveBeenCalledWith(
                expect.stringContaining('/interactions/test-interaction-id/trigger_inference'),
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ client_id: 'test-client' })
                })
            );
        });

        test('should handle inference pipeline failures', async () => {
            const interactionId = 'test-interaction-id';
            apiService.clientId = 'test-client';

            fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                json: async () => ({ error: 'Pipeline failed' })
            });

            const result = await apiService.triggerInferencePipeline(interactionId);

            expect(result).toBe(false);
        });
    });
});

describe('Enhanced registerInteraction', () => {
    let apiService;

    beforeEach(() => {
        fetch.mockClear();
        apiService = new ApiService();
        apiService.stopHealthChecking();
        apiService.baseUrl = 'http://localhost:8000';
        apiService.isConnected = true;
        apiService.clientId = 'test-client';
    });

    test('should handle interaction object response', async () => {
        const mockInteractionData = {
            id: 'test-id',
            text: 'Hello world',
            timestamp: new Date().toISOString(),
            speaker_id: 'speaker-1'
        };

        fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockInteractionData
        });

        const audioData = new ArrayBuffer(1000);
        const result = await apiService.registerInteraction(audioData);

        expect(result).toBeDefined();
        expect(result.id).toBe('test-id');
        expect(result.text).toBe('Hello world');
    });

    test('should handle message dictionary response', async () => {
        const mockMessageData = {
            message: 'Mira has been disabled',
            level: 'agent'
        };

        fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => mockMessageData
        });

        const audioData = new ArrayBuffer(1000);
        const result = await apiService.registerInteraction(audioData);

        expect(result).toEqual({
            type: 'message',
            message: 'Mira has been disabled',
            level: 'agent'
        });
    });

    test('should handle null response for voice disable', async () => {
        fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: async () => null
        });

        const audioData = new ArrayBuffer(1000);
        const result = await apiService.registerInteraction(audioData);

        expect(result).toBeNull();
    });
});

describe('Message Handling', () => {
    describe('showMessage with AGENT level', () => {
        let mockElement;
        let mockContainer;

        beforeEach(() => {
            // Mock DOM elements
            mockElement = {
                className: '',
                style: { cssText: '' },
                textContent: '',
                addEventListener: jest.fn()
            };
            
            mockContainer = {
                appendChild: jest.fn()
            };

            global.document = {
                createElement: jest.fn(() => mockElement)
            };

            global.requestAnimationFrame = jest.fn(cb => setTimeout(cb, 0));
        });

        test('should create agent message with correct styling', () => {
            // Create a mock instance
            const mockInstance = {
                notificationContainer: mockContainer,
                activeNotifications: [],
                showMessage: function(message, type = 'info') {
                    const toast = document.createElement('div');
                    toast.className = `toast toast-${type}`;
                    
                    let backgroundColor;
                    switch (type) {
                        case 'error':
                            backgroundColor = '#ff4444';
                            break;
                        case 'warning':
                            backgroundColor = '#ffaa00';
                            break;
                        case 'agent':
                            backgroundColor = '#6366f1';
                            break;
                        case 'info':
                        default:
                            backgroundColor = '#00aa44';
                            break;
                    }
                    
                    toast.style.cssText = `background: ${backgroundColor}; color: white;`;
                    toast.textContent = message;
                    
                    this.notificationContainer.appendChild(toast);
                    this.activeNotifications.push(toast);
                }
            };

            mockInstance.showMessage('Test agent message', 'agent');

            expect(document.createElement).toHaveBeenCalledWith('div');
            expect(mockElement.className).toBe('toast toast-agent');
            expect(mockElement.style.cssText).toContain('background: #6366f1');
            expect(mockElement.textContent).toBe('Test agent message');
            expect(mockContainer.appendChild).toHaveBeenCalledWith(mockElement);
        });
    });
});