/**
 * JavaScript models corresponding to backend SQLAlchemy models
 * These models provide type definitions and validation for API responses
 */

/**
 * Person entity for speaker recognition and management
 */
export class Person {
    /**
     * @param {string} id - UUID primary key
     * @param {string|null} name - Person name (can be null for unidentified speakers)
     * @param {number} index - Original speaker number (1, 2, etc.)
     * @param {Array|null} voice_embedding - Voice embedding as JSON array
     * @param {number|null} cluster_id - DBSCAN cluster assignment
     * @param {string} created_at - ISO datetime string
     * @param {string} updated_at - ISO datetime string
     */
    constructor(id, name = null, index, voice_embedding = null, cluster_id = null, created_at, updated_at) {
        this.id = id;
        this.name = name;
        this.index = index;
        this.voice_embedding = voice_embedding;
        this.cluster_id = cluster_id;
        this.created_at = new Date(created_at);
        this.updated_at = new Date(updated_at);
    }

    /**
     * Create Person instance from API response
     * @param {Object} data - Raw API response data
     * @returns {Person}
     */
    static fromApiResponse(data) {
        return new Person(
            data.id,
            data.name,
            data.index,
            data.voice_embedding,
            data.cluster_id,
            data.created_at,
            data.updated_at
        );
    }

    /**
     * Convert to JSON object for API requests
     * @returns {Object}
     */
    toJson() {
        return {
            id: this.id,
            name: this.name,
            index: this.index,
            voice_embedding: this.voice_embedding,
            cluster_id: this.cluster_id,
            created_at: this.created_at.toISOString(),
            updated_at: this.updated_at.toISOString()
        };
    }
}

/**
 * Interaction entity for storing conversation interactions
 */
export class Interaction {
    /**
     * @param {string} id - UUID primary key
     * @param {string} text - Interaction text content
     * @param {string} timestamp - ISO datetime string
     * @param {string|null} conversation_id - UUID foreign key to conversation
     * @param {Array|null} voice_embedding - Voice embedding as JSON array
     * @param {string|null} speaker_id - UUID foreign key to person
     * @param {Array|null} entities - Named entities extracted from text
     * @param {Array|null} topics - Topic modeling results
     * @param {number|null} sentiment - Sentiment score
     */
    constructor(id, text, timestamp, conversation_id = null, voice_embedding = null, 
                speaker_id = null, entities = null, topics = null, sentiment = null) {
        this.id = id;
        this.text = text;
        this.timestamp = new Date(timestamp);
        this.conversation_id = conversation_id;
        this.voice_embedding = voice_embedding;
        this.speaker_id = speaker_id;
        this.entities = entities;
        this.topics = topics;
        this.sentiment = sentiment;
    }

    /**
     * Create Interaction instance from API response
     * @param {Object} data - Raw API response data
     * @returns {Interaction}
     */
    static fromApiResponse(data) {
        return new Interaction(
            data.id,
            data.text,
            data.timestamp,
            data.conversation_id,
            data.voice_embedding,
            data.speaker_id,
            data.entities,
            data.topics,
            data.sentiment
        );
    }

    /**
     * Convert to JSON object for API requests
     * @returns {Object}
     */
    toJson() {
        return {
            id: this.id,
            text: this.text,
            timestamp: this.timestamp.toISOString(),
            conversation_id: this.conversation_id,
            voice_embedding: this.voice_embedding,
            speaker_id: this.speaker_id,
            entities: this.entities,
            topics: this.topics,
            sentiment: this.sentiment
        };
    }
}

/**
 * Conversation entity for grouping interactions
 */
export class Conversation {
    /**
     * @param {string} id - UUID primary key
     * @param {string} user_ids - UUID for backward compatibility
     * @param {string|null} speaker_id - UUID foreign key to primary speaker
     * @param {string} start_of_conversation - ISO datetime string
     * @param {string|null} end_of_conversation - ISO datetime string
     * @param {string|null} topic_summary - AI-generated topic summary
     * @param {string|null} context_summary - Condensed long-term context
     * @param {Array|null} participants - List of person IDs in conversation
     */
    constructor(id, user_ids, speaker_id = null, start_of_conversation, 
                end_of_conversation = null, topic_summary = null, 
                context_summary = null, participants = null) {
        this.id = id;
        this.user_ids = user_ids;
        this.speaker_id = speaker_id;
        this.start_of_conversation = new Date(start_of_conversation);
        this.end_of_conversation = end_of_conversation ? new Date(end_of_conversation) : null;
        this.topic_summary = topic_summary;
        this.context_summary = context_summary;
        this.participants = participants;
    }

    /**
     * Create Conversation instance from API response
     * @param {Object} data - Raw API response data
     * @returns {Conversation}
     */
    static fromApiResponse(data) {
        return new Conversation(
            data.id,
            data.user_ids,
            data.speaker_id,
            data.start_of_conversation,
            data.end_of_conversation,
            data.topic_summary,
            data.context_summary,
            data.participants
        );
    }

    /**
     * Convert to JSON object for API requests
     * @returns {Object}
     */
    toJson() {
        return {
            id: this.id,
            user_ids: this.user_ids,
            speaker_id: this.speaker_id,
            start_of_conversation: this.start_of_conversation.toISOString(),
            end_of_conversation: this.end_of_conversation ? this.end_of_conversation.toISOString() : null,
            topic_summary: this.topic_summary,
            context_summary: this.context_summary,
            participants: this.participants
        };
    }
}

/**
 * Action entity for tracking user actions and tasks
 */
export class Action {
    /**
     * @param {string} id - UUID primary key
     * @param {string} user_id - UUID for backward compatibility
     * @param {string|null} person_id - UUID foreign key to person
     * @param {string} action_type - Type of action
     * @param {string|null} details - Additional action details
     * @param {string|null} interaction_id - UUID foreign key to interaction
     * @param {string|null} conversation_id - UUID foreign key to conversation
     * @param {string} status - Action status (pending, completed, failed)
     * @param {string|null} scheduled_time - ISO datetime string
     * @param {string|null} completed_time - ISO datetime string
     */
    constructor(id, user_id, person_id = null, action_type, details = null, 
                interaction_id = null, conversation_id = null, status = 'pending', 
                scheduled_time = null, completed_time = null) {
        this.id = id;
        this.user_id = user_id;
        this.person_id = person_id;
        this.action_type = action_type;
        this.details = details;
        this.interaction_id = interaction_id;
        this.conversation_id = conversation_id;
        this.status = status;
        this.scheduled_time = scheduled_time ? new Date(scheduled_time) : null;
        this.completed_time = completed_time ? new Date(completed_time) : null;
    }

    /**
     * Create Action instance from API response
     * @param {Object} data - Raw API response data
     * @returns {Action}
     */
    static fromApiResponse(data) {
        return new Action(
            data.id,
            data.user_id,
            data.person_id,
            data.action_type,
            data.details,
            data.interaction_id,
            data.conversation_id,
            data.status,
            data.scheduled_time,
            data.completed_time
        );
    }

    /**
     * Convert to JSON object for API requests
     * @returns {Object}
     */
    toJson() {
        return {
            id: this.id,
            user_id: this.user_id,
            person_id: this.person_id,
            action_type: this.action_type,
            details: this.details,
            interaction_id: this.interaction_id,
            conversation_id: this.conversation_id,
            status: this.status,
            scheduled_time: this.scheduled_time ? this.scheduled_time.toISOString() : null,
            completed_time: this.completed_time ? this.completed_time.toISOString() : null
        };
    }
}

/**
 * API Response wrapper for handling backend responses
 */
export class ApiResponse {
    /**
     * @param {boolean} success - Whether the request was successful
     * @param {any} data - Response data
     * @param {string|null} error - Error message if unsuccessful
     * @param {number} status - HTTP status code
     */
    constructor(success, data = null, error = null, status = 200) {
        this.success = success;
        this.data = data;
        this.error = error;
        this.status = status;
    }

    /**
     * Create successful response
     * @param {any} data - Response data
     * @param {number} status - HTTP status code
     * @returns {ApiResponse}
     */
    static success(data, status = 200) {
        return new ApiResponse(true, data, null, status);
    }

    /**
     * Create error response
     * @param {string} error - Error message
     * @param {number} status - HTTP status code
     * @returns {ApiResponse}
     */
    static error(error, status = 500) {
        return new ApiResponse(false, null, error, status);
    }
}