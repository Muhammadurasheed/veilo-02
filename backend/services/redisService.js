const redis = require('redis');

class RedisService {
  constructor() {
    this.client = null;
    this.publisher = null;
    this.subscriber = null;
    this.isConnected = false;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.fallbackStore = new Map(); // In-memory fallback
    
    this.init();
  }

  async init() {
    try {
      console.log('🔄 Initializing Redis connection...');
      
      const redisConfig = {
        url: process.env.REDIS_URL,
        password: process.env.REDIS_PASSWORD,
        socket: {
          connectTimeout: 60000,
          lazyConnect: true,
          reconnectStrategy: (retries) => {
            if (retries > this.maxRetries) {
              console.error('❌ Redis max retries exceeded');
              return false;
            }
            console.log(`🔄 Redis retry attempt ${retries}/${this.maxRetries}`);
            return Math.min(retries * 100, 3000);
          }
        }
      };

      // Main client for general operations
      this.client = redis.createClient(redisConfig);
      
      // Publisher for real-time events
      this.publisher = redis.createClient(redisConfig);
      
      // Subscriber for real-time events
      this.subscriber = redis.createClient(redisConfig);

      // Setup error handlers
      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err.message);
        this.isConnected = false;
        this.enableFallbackMode();
      });

      this.publisher.on('error', (err) => {
        console.error('❌ Redis Publisher Error:', err.message);
      });

      this.subscriber.on('error', (err) => {
        console.error('❌ Redis Subscriber Error:', err.message);
      });

      // Setup connection handlers
      this.client.on('connect', () => {
        console.log('✅ Redis client connected');
        this.isConnected = true;
        this.retryCount = 0;
      });

      this.client.on('ready', () => {
        console.log('✅ Redis client ready');
      });

      this.client.on('end', () => {
        console.log('🔌 Redis client connection ended');
        this.isConnected = false;
        this.enableFallbackMode();
      });

      // Connect all clients
      await Promise.all([
        this.client.connect(),
        this.publisher.connect(),
        this.subscriber.connect()
      ]);

      console.log('✅ All Redis connections established');

    } catch (error) {
      console.error('❌ Redis initialization failed:', error.message);
      this.isConnected = false;
      
      // Enable fallback mode immediately
      this.enableFallbackMode();
    }
  }

  enableFallbackMode() {
    console.log('⚠️ Redis fallback mode enabled - using in-memory storage');
    this.isConnected = false;
  }

  // Session State Management with fallback
  async setSessionState(sessionId, state, expireSeconds = 3600) {
    try {
      if (!this.isConnected) {
        // Fallback to in-memory storage
        this.fallbackStore.set(`session:${sessionId}`, { 
          data: state, 
          expires: Date.now() + (expireSeconds * 1000) 
        });
        console.log(`💾 [Fallback] Session state stored: ${sessionId}`);
        return true;
      }
      
      const key = `session:${sessionId}`;
      await this.client.setEx(key, expireSeconds, JSON.stringify(state));
      console.log(`💾 Session state saved: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Redis setSessionState error:', error);
      // Fallback to in-memory storage
      this.fallbackStore.set(`session:${sessionId}`, { 
        data: state, 
        expires: Date.now() + (expireSeconds * 1000) 
      });
      return true;
    }
  }

  async getSessionState(sessionId) {
    try {
      if (!this.isConnected) {
        // Fallback to in-memory storage
        const stored = this.fallbackStore.get(`session:${sessionId}`);
        if (stored && stored.expires > Date.now()) {
          return stored.data;
        }
        this.fallbackStore.delete(`session:${sessionId}`);
        return null;
      }
      
      const key = `session:${sessionId}`;
      const state = await this.client.get(key);
      return state ? JSON.parse(state) : null;
    } catch (error) {
      console.error('❌ Redis getSessionState error:', error);
      // Try fallback
      const stored = this.fallbackStore.get(`session:${sessionId}`);
      if (stored && stored.expires > Date.now()) {
        return stored.data;
      }
      return null;
    }
  }

  async deleteSessionState(sessionId) {
    try {
      if (!this.isConnected) {
        this.fallbackStore.delete(`session:${sessionId}`);
        console.log(`🗑️ [Fallback] Session state deleted: ${sessionId}`);
        return true;
      }
      
      const key = `session:${sessionId}`;
      await this.client.del(key);
      console.log(`🗑️ Session state deleted: ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Redis deleteSessionState error:', error);
      this.fallbackStore.delete(`session:${sessionId}`);
      return true;
    }
  }

  // Participant Management with fallback
  async addParticipant(sessionId, participant) {
    try {
      if (!this.isConnected) {
        const key = `participants:${sessionId}`;
        const stored = this.fallbackStore.get(key) || [];
        const updated = stored.filter(p => p.id !== participant.id);
        updated.push(participant);
        this.fallbackStore.set(key, updated);
        console.log(`👤 [Fallback] Participant added: ${participant.id} to ${sessionId}`);
        return true;
      }
      
      const key = `participants:${sessionId}`;
      await this.client.hSet(key, participant.id, JSON.stringify(participant));
      await this.client.expire(key, 3600); // Expire in 1 hour
      
      console.log(`👤 Participant added: ${participant.id} to ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Redis addParticipant error:', error);
      // Fallback
      const key = `participants:${sessionId}`;
      const stored = this.fallbackStore.get(key) || [];
      const updated = stored.filter(p => p.id !== participant.id);
      updated.push(participant);
      this.fallbackStore.set(key, updated);
      return true;
    }
  }

  async removeParticipant(sessionId, participantId) {
    try {
      if (!this.isConnected) {
        const key = `participants:${sessionId}`;
        const stored = this.fallbackStore.get(key) || [];
        const updated = stored.filter(p => p.id !== participantId);
        this.fallbackStore.set(key, updated);
        console.log(`👤 [Fallback] Participant removed: ${participantId} from ${sessionId}`);
        return true;
      }
      
      const key = `participants:${sessionId}`;
      await this.client.hDel(key, participantId);
      
      console.log(`👤 Participant removed: ${participantId} from ${sessionId}`);
      return true;
    } catch (error) {
      console.error('❌ Redis removeParticipant error:', error);
      // Fallback
      const key = `participants:${sessionId}`;
      const stored = this.fallbackStore.get(key) || [];
      const updated = stored.filter(p => p.id !== participantId);
      this.fallbackStore.set(key, updated);
      return true;
    }
  }

  async getParticipants(sessionId) {
    try {
      if (!this.isConnected) {
        return this.fallbackStore.get(`participants:${sessionId}`) || [];
      }
      
      const key = `participants:${sessionId}`;
      const participants = await this.client.hGetAll(key);
      
      return Object.values(participants).map(p => JSON.parse(p));
    } catch (error) {
      console.error('❌ Redis getParticipants error:', error);
      return this.fallbackStore.get(`participants:${sessionId}`) || [];
    }
  }

  // Real-time Event Broadcasting with fallback
  async publishEvent(channel, event, data) {
    try {
      if (!this.isConnected) {
        console.log(`📡 [Fallback] Event would be published to ${channel}: ${event}`);
        return true;
      }
      
      const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
      await this.publisher.publish(channel, message);
      
      console.log(`📡 Event published to ${channel}: ${event}`);
      return true;
    } catch (error) {
      console.error('❌ Redis publishEvent error:', error);
      console.log(`📡 [Fallback] Event would be published to ${channel}: ${event}`);
      return true;
    }
  }

  async subscribeToEvents(channel, callback) {
    try {
      if (!this.isConnected) {
        console.log(`📡 [Fallback] Would subscribe to channel: ${channel}`);
        return true;
      }
      
      const subscriber = this.subscriber.duplicate();
      await subscriber.subscribe(channel, (message) => {
        try {
          const parsed = JSON.parse(message);
          callback(parsed);
        } catch (error) {
          console.error('❌ Redis message parse error:', error);
        }
      });
      
      console.log(`📡 Subscribed to channel: ${channel}`);
      return subscriber;
    } catch (error) {
      console.error('❌ Redis subscribeToEvents error:', error);
      console.log(`📡 [Fallback] Would subscribe to channel: ${channel}`);
      return null;
    }
  }

  // Health check
  async healthCheck() {
    try {
      if (!this.isConnected) {
        return { status: 'fallback', mode: 'in-memory', connected: false };
      }

      const result = await this.client.ping();
      return {
        status: result === 'PONG' ? 'connected' : 'error',
        mode: 'redis',
        connected: this.isConnected
      };
    } catch (error) {
      return {
        status: 'fallback',
        mode: 'in-memory', 
        connected: false,
        error: error.message
      };
    }
  }

  // Cleanup with fallback support
  async disconnect() {
    try {
      if (this.client) await this.client.disconnect();
      if (this.publisher) await this.publisher.disconnect();
      if (this.subscriber) await this.subscriber.disconnect();
      
      console.log('🔌 Redis connections closed');
    } catch (error) {
      console.error('❌ Error closing Redis connections:', error.message);
    }
    
    // Clear fallback store
    this.fallbackStore.clear();
  }
}

// Create singleton instance
const redisService = new RedisService();

// Initialize Redis connection automatically
console.log('🚀 Redis service initializing...');

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🔄 Shutting down Redis service...');
  await redisService.disconnect();
});

process.on('SIGINT', async () => {
  console.log('🔄 Shutting down Redis service...');
  await redisService.disconnect();
  process.exit(0);
});

module.exports = redisService;