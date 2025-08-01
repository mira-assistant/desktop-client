/**
 * Unit tests for models.js
 * Tests data model classes and their methods
 */

import { Person, Interaction, Conversation, Action, ApiResponse } from '../models.js';

describe('Data Models', () => {
    describe('Person Model', () => {
        const samplePersonData = {
            id: '123e4567-e89b-12d3-a456-426614174000',
            name: 'John Doe',
            index: 1,
            voice_embedding: [0.1, 0.2, 0.3],
            cluster_id: 5,
            created_at: '2023-01-01T00:00:00Z',
            updated_at: '2023-01-01T00:00:00Z'
        };

        test('should create Person instance with all parameters', () => {
            const person = new Person(
                samplePersonData.id,
                samplePersonData.name,
                samplePersonData.index,
                samplePersonData.voice_embedding,
                samplePersonData.cluster_id,
                samplePersonData.created_at,
                samplePersonData.updated_at
            );

            expect(person.id).toBe(samplePersonData.id);
            expect(person.name).toBe(samplePersonData.name);
            expect(person.index).toBe(samplePersonData.index);
            expect(person.voice_embedding).toEqual(samplePersonData.voice_embedding);
            expect(person.cluster_id).toBe(samplePersonData.cluster_id);
            expect(person.created_at).toBeInstanceOf(Date);
            expect(person.updated_at).toBeInstanceOf(Date);
        });

        test('should create Person from API response', () => {
            const person = Person.fromApiResponse(samplePersonData);
            
            expect(person).toBeInstanceOf(Person);
            expect(person.id).toBe(samplePersonData.id);
            expect(person.name).toBe(samplePersonData.name);
            expect(person.index).toBe(samplePersonData.index);
        });

        test('should convert Person to JSON', () => {
            const person = Person.fromApiResponse(samplePersonData);
            const json = person.toJson();
            
            expect(typeof json).toBe('object');
            expect(json.id).toBe(samplePersonData.id);
            expect(json.name).toBe(samplePersonData.name);
            expect(json.index).toBe(samplePersonData.index);
        });

        test('should handle null name and optional fields', () => {
            const personWithNulls = new Person(
                samplePersonData.id,
                null, // name can be null
                samplePersonData.index,
                null, // voice_embedding can be null
                null, // cluster_id can be null
                samplePersonData.created_at,
                samplePersonData.updated_at
            );

            expect(personWithNulls.name).toBeNull();
            expect(personWithNulls.voice_embedding).toBeNull();
            expect(personWithNulls.cluster_id).toBeNull();
        });
    });

    describe('Interaction Model', () => {
        const sampleInteractionData = {
            id: '123e4567-e89b-12d3-a456-426614174001',
            text: 'Hello, this is a test interaction',
            timestamp: '2023-01-01T12:00:00Z',
            conversation_id: '123e4567-e89b-12d3-a456-426614174002',
            voice_embedding: [0.4, 0.5, 0.6],
            speaker_id: '123e4567-e89b-12d3-a456-426614174000',
            entities: ['PERSON:John', 'LOCATION:New York'],
            topics: ['greeting', 'introduction'],
            sentiment: 0.8
        };

        test('should create Interaction instance', () => {
            const interaction = new Interaction(
                sampleInteractionData.id,
                sampleInteractionData.text,
                sampleInteractionData.timestamp,
                sampleInteractionData.conversation_id,
                sampleInteractionData.voice_embedding,
                sampleInteractionData.speaker_id,
                sampleInteractionData.entities,
                sampleInteractionData.topics,
                sampleInteractionData.sentiment
            );

            expect(interaction.id).toBe(sampleInteractionData.id);
            expect(interaction.text).toBe(sampleInteractionData.text);
            expect(interaction.timestamp).toBeInstanceOf(Date);
            expect(interaction.conversation_id).toBe(sampleInteractionData.conversation_id);
            expect(interaction.voice_embedding).toEqual(sampleInteractionData.voice_embedding);
            expect(interaction.speaker_id).toBe(sampleInteractionData.speaker_id);
            expect(interaction.entities).toEqual(sampleInteractionData.entities);
            expect(interaction.topics).toEqual(sampleInteractionData.topics);
            expect(interaction.sentiment).toBe(sampleInteractionData.sentiment);
        });

        test('should create Interaction from API response', () => {
            const interaction = Interaction.fromApiResponse(sampleInteractionData);
            
            expect(interaction).toBeInstanceOf(Interaction);
            expect(interaction.text).toBe(sampleInteractionData.text);
            expect(interaction.sentiment).toBe(sampleInteractionData.sentiment);
        });

        test('should convert Interaction to JSON', () => {
            const interaction = Interaction.fromApiResponse(sampleInteractionData);
            const json = interaction.toJson();
            
            expect(typeof json).toBe('object');
            expect(json.text).toBe(sampleInteractionData.text);
            expect(json.sentiment).toBe(sampleInteractionData.sentiment);
        });
    });

    describe('Conversation Model', () => {
        const sampleConversationData = {
            id: '123e4567-e89b-12d3-a456-426614174002',
            user_ids: '123e4567-e89b-12d3-a456-426614174000',
            speaker_id: '123e4567-e89b-12d3-a456-426614174000',
            start_of_conversation: '2023-01-01T10:00:00Z',
            end_of_conversation: '2023-01-01T11:00:00Z',
            topic_summary: 'Discussion about project requirements',
            context_summary: 'Meeting to discuss Q1 project goals',
            participants: ['123e4567-e89b-12d3-a456-426614174000', '123e4567-e89b-12d3-a456-426614174001']
        };

        test('should create Conversation instance', () => {
            const conversation = new Conversation(
                sampleConversationData.id,
                sampleConversationData.user_ids,
                sampleConversationData.speaker_id,
                sampleConversationData.start_of_conversation,
                sampleConversationData.end_of_conversation,
                sampleConversationData.topic_summary,
                sampleConversationData.context_summary,
                sampleConversationData.participants
            );

            expect(conversation.id).toBe(sampleConversationData.id);
            expect(conversation.user_ids).toBe(sampleConversationData.user_ids);
            expect(conversation.speaker_id).toBe(sampleConversationData.speaker_id);
            expect(conversation.start_of_conversation).toBeInstanceOf(Date);
            expect(conversation.topic_summary).toBe(sampleConversationData.topic_summary);
            expect(conversation.participants).toEqual(sampleConversationData.participants);
        });

        test('should create Conversation from API response', () => {
            const conversation = Conversation.fromApiResponse(sampleConversationData);
            
            expect(conversation).toBeInstanceOf(Conversation);
            expect(conversation.topic_summary).toBe(sampleConversationData.topic_summary);
        });
    });

    describe('Action Model', () => {
        const sampleActionData = {
            id: '123e4567-e89b-12d3-a456-426614174003',
            user_id: '123e4567-e89b-12d3-a456-426614174000',
            person_id: '123e4567-e89b-12d3-a456-426614174000',
            action_type: 'reminder',
            details: 'Set reminder for meeting',
            interaction_id: '123e4567-e89b-12d3-a456-426614174001',
            conversation_id: '123e4567-e89b-12d3-a456-426614174002',
            status: 'pending',
            scheduled_time: '2023-01-02T09:00:00Z',
            completed_time: null
        };

        test('should create Action instance', () => {
            const action = new Action(
                sampleActionData.id,
                sampleActionData.user_id,
                sampleActionData.person_id,
                sampleActionData.action_type,
                sampleActionData.details,
                sampleActionData.interaction_id,
                sampleActionData.conversation_id,
                sampleActionData.status,
                sampleActionData.scheduled_time,
                sampleActionData.completed_time
            );

            expect(action.id).toBe(sampleActionData.id);
            expect(action.action_type).toBe(sampleActionData.action_type);
            expect(action.status).toBe(sampleActionData.status);
            expect(action.details).toBe(sampleActionData.details);
        });

        test('should create Action from API response', () => {
            const action = Action.fromApiResponse(sampleActionData);
            
            expect(action).toBeInstanceOf(Action);
            expect(action.action_type).toBe(sampleActionData.action_type);
            expect(action.status).toBe(sampleActionData.status);
        });
    });

    describe('ApiResponse Model', () => {
        test('should create ApiResponse with success', () => {
            const data = { test: 'data' };
            const response = new ApiResponse(true, data, null);

            expect(response.success).toBe(true);
            expect(response.data).toEqual(data);
            expect(response.error).toBeNull();
            expect(response.status).toBe(200);
        });

        test('should create ApiResponse with error', () => {
            const error = 'Test error';
            const response = new ApiResponse(false, null, error, 500);

            expect(response.success).toBe(false);
            expect(response.data).toBeNull();
            expect(response.error).toBe(error);
            expect(response.status).toBe(500);
        });

        test('should create success response using static method', () => {
            const data = { result: 'ok' };
            const response = ApiResponse.success(data);

            expect(response.success).toBe(true);
            expect(response.data).toEqual(data);
            expect(response.error).toBeNull();
            expect(response.status).toBe(200);
        });

        test('should create error response using static method', () => {
            const error = 'Network error';
            const response = ApiResponse.error(error, 500);

            expect(response.success).toBe(false);
            expect(response.error).toBe(error);
            expect(response.status).toBe(500);
            expect(response.data).toBeNull();
        });
    });
});