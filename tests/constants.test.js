/**
 * Unit tests for constants.js
 * Tests configuration values and constant definitions
 */

import { API_CONFIG, AUDIO_CONFIG, UI_CONFIG, ERROR_MESSAGES, DEBUG_CONFIG } from '../constants.js';

describe('Constants Configuration', () => {
    describe('API_CONFIG', () => {
        test('should have valid base URLs', () => {
            expect(API_CONFIG.BASE_URLS).toBeInstanceOf(Map);
            expect(API_CONFIG.BASE_URLS.size).toBeGreaterThan(0);
            
            // Check localhost URL
            expect(API_CONFIG.BASE_URLS.has('localhost')).toBe(true);
            expect(API_CONFIG.BASE_URLS.get('localhost')).toMatch(/^https?:\/\//);
        });

        test('should have valid client ID', () => {
            expect(API_CONFIG.CLIENT_ID).toBeDefined();
            expect(typeof API_CONFIG.CLIENT_ID).toBe('string');
            expect(API_CONFIG.CLIENT_ID.length).toBeGreaterThan(0);
        });

        test('should have valid timeout configurations', () => {
            expect(API_CONFIG.TIMEOUTS).toBeDefined();
            expect(API_CONFIG.TIMEOUTS.DEFAULT_REQUEST).toBeGreaterThan(0);
            expect(API_CONFIG.TIMEOUTS.VAD_LIBRARY_LOAD).toBeGreaterThan(0);
            expect(API_CONFIG.TIMEOUTS.BACKEND_STOP_REQUEST).toBeGreaterThan(0);
        });

        test('should have valid retry configuration', () => {
            expect(API_CONFIG.RETRY_CONFIG).toBeDefined();
            expect(API_CONFIG.RETRY_CONFIG.MAX_RETRIES).toBeGreaterThanOrEqual(0);
            expect(API_CONFIG.RETRY_CONFIG.BACKOFF_DELAY).toBeGreaterThan(0);
        });
    });

    describe('AUDIO_CONFIG', () => {
        test('should have valid VAD thresholds', () => {
            expect(AUDIO_CONFIG.VAD_THRESHOLDS).toBeDefined();
            expect(AUDIO_CONFIG.VAD_THRESHOLDS.POSITIVE_SPEECH).toBeGreaterThan(0);
            expect(AUDIO_CONFIG.VAD_THRESHOLDS.POSITIVE_SPEECH).toBeLessThanOrEqual(1);
            expect(AUDIO_CONFIG.VAD_THRESHOLDS.NEGATIVE_SPEECH).toBeGreaterThan(0);
            expect(AUDIO_CONFIG.VAD_THRESHOLDS.NEGATIVE_SPEECH).toBeLessThanOrEqual(1);
            expect(AUDIO_CONFIG.VAD_THRESHOLDS.SILENCE_MS).toBeGreaterThan(0);
        });

        test('should have valid optimization settings', () => {
            expect(AUDIO_CONFIG.OPTIMIZATION).toBeDefined();
            expect(AUDIO_CONFIG.OPTIMIZATION.NOISE_FLOOR).toBeLessThan(0);
            expect(AUDIO_CONFIG.OPTIMIZATION.SIGNAL_THRESHOLD).toBeLessThan(0);
            expect(AUDIO_CONFIG.OPTIMIZATION.TARGET_RMS).toBeGreaterThan(0);
            expect(AUDIO_CONFIG.OPTIMIZATION.MIN_SNR_DB).toBeLessThan(0);
        });

        test('should have valid audio constraints', () => {
            expect(AUDIO_CONFIG.CONSTRAINTS).toBeDefined();
            expect(typeof AUDIO_CONFIG.CONSTRAINTS).toBe('object');
        });
    });

    describe('UI_CONFIG', () => {
        test('should have valid opacity settings', () => {
            expect(UI_CONFIG.OPACITY).toBeDefined();
            expect(UI_CONFIG.OPACITY.DISABLED).toBeDefined();
            expect(UI_CONFIG.OPACITY.ENABLED).toBeDefined();
        });

        test('should have valid message settings', () => {
            expect(UI_CONFIG.MESSAGES).toBeDefined();
            expect(UI_CONFIG.MESSAGES.FADE_DURATION).toBeGreaterThan(0);
        });

        test('should have valid color settings', () => {
            expect(UI_CONFIG.COLORS).toBeDefined();
            expect(UI_CONFIG.COLORS.SUCCESS).toBeDefined();
            expect(UI_CONFIG.COLORS.ERROR).toBeDefined();
        });
    });

    describe('ERROR_MESSAGES', () => {
        test('should have defined error message categories', () => {
            expect(ERROR_MESSAGES).toBeDefined();
            expect(typeof ERROR_MESSAGES).toBe('object');
            
            // Check for some expected error message categories
            expect(ERROR_MESSAGES.NETWORK).toBeDefined();
            expect(ERROR_MESSAGES.AUDIO).toBeDefined();
        });

        test('should have specific error messages', () => {
            expect(ERROR_MESSAGES.NETWORK.CONNECTION_FAILED).toBeDefined();
            expect(typeof ERROR_MESSAGES.NETWORK.CONNECTION_FAILED).toBe('string');
            expect(ERROR_MESSAGES.AUDIO.PERMISSION_DENIED).toBeDefined();
            expect(typeof ERROR_MESSAGES.AUDIO.PERMISSION_DENIED).toBe('string');
        });
    });

    describe('DEBUG_CONFIG', () => {
        test('should have valid log levels', () => {
            expect(DEBUG_CONFIG.LOG_LEVELS).toBeDefined();
            expect(typeof DEBUG_CONFIG.LOG_LEVELS).toBe('object');
            expect(DEBUG_CONFIG.LOG_LEVELS.ERROR).toBeDefined();
            expect(DEBUG_CONFIG.LOG_LEVELS.WARN).toBeDefined();
            expect(DEBUG_CONFIG.LOG_LEVELS.INFO).toBeDefined();
            expect(DEBUG_CONFIG.LOG_LEVELS.DEBUG).toBeDefined();
        });

        test('should have valid performance settings', () => {
            expect(DEBUG_CONFIG.PERFORMANCE).toBeDefined();
            expect(DEBUG_CONFIG.PERFORMANCE.AUDIO_STATS_INTERVAL).toBeGreaterThan(0);
            expect(DEBUG_CONFIG.PERFORMANCE.MEMORY_CHECK_INTERVAL).toBeGreaterThan(0);
        });
    });
});