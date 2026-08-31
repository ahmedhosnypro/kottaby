# Redis Service Architecture

This module provides a clean, adapter-based architecture for Redis integration with support for multiple providers.

## Overview

The Redis service uses the **Adapter Pattern** to provide a unified interface for different Redis implementations:

- **Local Redis** (ioredis) - For development and self-hosted production
- **Upstash Redis** - For serverless production deployments

## Architecture

```
┌─────────────────────────────────────────────────┐
│           IRedisService (Interface)              │
│  - get(), set(), incr(), del()                  │
│  - expire(), ttl(), pipeline()                  │
│  - ping(), disconnect()                         │
└────────────┬────────────────────────────────────┘
             │
             │ implements
             │
     ┌───────┴────────┐
     │                │
     ▼                ▼
┌─────────────┐  ┌──────────────┐
│   Local     │  │   Upstash    │
│  Adapter    │  │   Adapter    │
│  (ioredis)  │  │  (@upstash)  │
└─────────────┘  └──────────────┘
     │                │
     │                │
     ▼                ▼
┌─────────────┐  ┌──────────────┐
│ Local Redis │  │Upstash Cloud │
│ (Docker)    │  │ (Serverless) │
└─────────────┘  └──────────────┘
```

## Provider Selection

The provider is selected via the `REDIS_PROVIDER` environment variable:

```bash
# Local Redis (development/self-hosted)
REDIS_PROVIDER=local
REDIS_URL=redis://localhost:6379

# Upstash Redis (serverless production)
REDIS_PROVIDER=upstash
UPSTASH_REDIS_REST_URL=https://your-redis.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

## Files Structure

```
backend/services/redis/
├── IRedisService.ts           # Interface definition
├── LocalRedisAdapter.ts       # Local Redis implementation
├── UpstashRedisAdapter.ts     # Upstash implementation
├── RedisServiceFactory.ts     # Factory + singleton
├── index.ts                   # Public exports
└── README.md                  # This file
```

## Usage

### Basic Usage

```typescript
import { redisService } from "@/backend/services/redis";

// Set a value
await redisService.set("user:123", "John Doe", { ex: 3600 });

// Get a value
const name = await redisService.get("user:123");

// Increment counter
const count = await redisService.incr("page:views");

// Delete a key
await redisService.del("user:123");
```

### Rate Limiting Example

```typescript
import { redisService } from "@/backend/services/redis";

async function checkRateLimit(userId: string): Promise<boolean> {
  const key = `ratelimit:${userId}`;
  const current = await redisService.get(key);

  if (!current) {
    await redisService.set(key, "1", { ex: 60 });
    return true;
  }

  const count = Number.parseInt(current, 10);
  if (count >= 100) {
    return false; // Rate limit exceeded
  }

  await redisService.incr(key);
  return true;
}
```

### Caching Example

```typescript
import { redisService } from "@/backend/services/redis";

async function getCachedData(key: string) {
  // Try cache first
  const cached = await redisService.get(`cache:${key}`);
  if (cached) {
    return JSON.parse(cached);
  }

  // Fetch from database
  const data = await fetchFromDatabase(key);

  // Cache for 1 hour
  await redisService.set(`cache:${key}`, JSON.stringify(data), { ex: 3600 });

  return data;
}
```

### Pipeline Operations

```typescript
import { redisService } from "@/backend/services/redis";

// Execute multiple commands atomically
await redisService.pipeline([
  { command: "set", args: ["key1", "value1"] },
  { command: "set", args: ["key2", "value2"] },
  { command: "incr", args: ["counter"] },
]);
```

## Local Redis Setup

### Using Docker (Recommended)

```bash
# Navigate to Redis container directory
cd containers/redis

# Start Redis
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f

# Stop Redis
docker compose down
```

### Configuration

Edit `containers/redis/redis.conf` to customize:

- Memory limits
- Eviction policies
- Persistence settings
- Security options

## Upstash Redis Setup

### 1. Create Account

Visit https://console.upstash.com/

### 2. Create Database

1. Click "Create Database"
2. Choose region closest to your deployment
3. Copy REST URL and Token

### 3. Configure Environment

```bash
REDIS_PROVIDER=upstash
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token-here
```

### 4. Deploy

Upstash works seamlessly with:

- Vercel
- Netlify
- AWS Lambda
- Cloudflare Workers

## API Reference

### IRedisService

```typescript
interface IRedisService {
  // Get a value
  get(key: string): Promise<string | null>;

  // Set a value with optional expiration
  set(
    key: string,
    value: string,
    options?: {
      ex?: number; // Expiration in seconds
      px?: number; // Expiration in milliseconds
    }
  ): Promise<void>;

  // Increment a numeric value
  incr(key: string): Promise<number>;

  // Set expiration on existing key
  expire(key: string, seconds: number): Promise<void>;

  // Get time-to-live
  ttl(key: string): Promise<number>;

  // Delete a key
  del(key: string): Promise<void>;

  // Execute pipeline of commands
  pipeline(
    commands: Array<{
      command: string;
      args: string[] | number[];
    }>
  ): Promise<unknown[]>;

  // Health check
  ping(): Promise<boolean>;

  // Close connection
  disconnect(): Promise<void>;
}
```

## Provider Comparison

| Feature         | Local Redis                   | Upstash Redis             |
| --------------- | ----------------------------- | ------------------------- |
| **Setup**       | Docker required               | Cloud-based               |
| **Cost**        | Free (self-hosted)            | Free tier + pay-as-you-go |
| **Latency**     | Low (local)                   | Medium (REST API)         |
| **Scalability** | Manual                        | Auto-scaling              |
| **Maintenance** | Self-managed                  | Fully managed             |
| **Best For**    | Development, self-hosted prod | Serverless deployments    |
| **Connection**  | TCP (persistent)              | REST API (stateless)      |

## Best Practices

### 1. Key Naming

Use consistent prefixes:

```typescript
const userKey = `user:${userId}`;
const cacheKey = `cache:templates:${id}`;
const rateLimitKey = `ratelimit:api:${ip}`;
```

### 2. Expiration

Always set TTL for temporary data:

```typescript
await redisService.set(key, value, { ex: 3600 });
```

### 3. Error Handling

Handle Redis failures gracefully:

```typescript
try {
  const value = await redisService.get(key);
} catch (error) {
  logger.error("Redis error:", error);
  // Fallback to database or return default
}
```

### 4. Testing

Mock the Redis service in tests:

```typescript
jest.mock("@/backend/services/redis", () => ({
  redisService: {
    get: jest.fn(),
    set: jest.fn(),
    // ... other methods
  },
}));
```

## Monitoring

### Health Check

```typescript
import { RedisServiceFactory } from "@/backend/services/redis";

const isHealthy = await RedisServiceFactory.healthCheck();
```

### Connection Status

```typescript
const isPong = await redisService.ping();
console.log("Redis connected:", isPong);
```

## Troubleshooting

### Local Redis Not Connecting

1. Check if Docker is running:

   ```bash
   docker ps | grep redis
   ```

2. Check logs:

   ```bash
   docker compose logs redis
   ```

3. Verify port not in use:
   ```bash
   lsof -i :6379
   ```

### Upstash Connection Issues

1. Verify URL starts with `https://`
2. Check token is correct
3. Ensure region is accessible
4. Check Upstash dashboard for status

### Performance Issues

1. Monitor memory usage
2. Check eviction policy
3. Use pipelines for bulk operations
4. Consider connection pooling

## Migration Guide

### From Upstash to Local

```bash
# Change provider
REDIS_PROVIDER=local
REDIS_URL=redis://localhost:6379

# Remove Upstash credentials (optional)
# UPSTASH_REDIS_REST_URL=
# UPSTASH_REDIS_REST_TOKEN=
```

### From Local to Upstash

```bash
# Change provider
REDIS_PROVIDER=upstash
UPSTASH_REDIS_REST_URL=https://your-endpoint.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token
```

No code changes needed! The factory handles adapter selection automatically.

## Contributing

When adding new Redis operations:

1. Add method to `IRedisService` interface
2. Implement in both adapters
3. Update this README
4. Add tests

## License

Part of the Kottaby project.
