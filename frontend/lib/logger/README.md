# Client Logger

A comprehensive client-side logging system with color support, timestamps, caller detection, and API persistence.

## Features

- **Color-coded log levels** in browser console
- **Automatic timestamps** with millisecond precision
- **Caller detection** - automatically detects which file/line called the logger
- **Session-based log files** - creates unique log files per session
- **API persistence** - sends logs to `/api/logs` endpoint for file storage
- **Development only** - automatically disabled in production
- **Silent fallback** - gracefully handles API failures

## Usage

```typescript
import logger from "@/client/lib/logger";

// Basic logging
logger.log("This is a log message");
logger.info("Information message");
logger.warn("Warning message");
logger.error("Error message");
logger.debug("Debug message");

// Logging objects
logger.info("User data:", { id: 1, name: "John" });

// Multiple arguments
logger.warn("Multiple", "arguments", "supported");
```

## Log Levels

- `log` - Default/gray color
- `info` - Blue color
- `warn` - Orange/yellow color
- `error` - Red color
- `debug` - Purple color

## Session Files

Log files are created in the `logs/` directory with the format:

- **Client logs**: `client_YYYY-MM-DD_HH-mm-ss.log` (e.g., `client_2025-10-19_14-30-45.log`)
- **Server logs**: `server_YYYY-MM-DD_HH-mm-ss.log` (e.g., `server_2025-10-19_14-30-45.log`)

## API Endpoint

The logger sends logs to `/api/logs` which:

- Only works in development mode (returns 404 in production)
- Creates session-based log files
- Appends to existing session files
- Handles errors gracefully

## Configuration

The logger automatically:

- Enables only in development (`NODE_ENV === 'development'`)
- Generates a unique session ID on first use
- Detects caller information from stack traces
- Sends logs immediately to the API
