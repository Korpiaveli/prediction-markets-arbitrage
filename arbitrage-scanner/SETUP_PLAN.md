# Unified Setup & Run System Plan

## Objective

Create a single-command system to setup, build, and run the arbitrage scanner with:
- Zero-config first-run experience
- Environment validation
- Service orchestration
- Hot-reload development mode
- Production deployment support

---

## Current Pain Points

1. **Multiple terminals required** - API, Web, CLI each need separate terminals
2. **Manual build order** - Must build packages before apps
3. **Environment setup** - No automated .env creation from templates
4. **No health checks** - Services start without validation
5. **No process management** - No way to stop/restart all services together
6. **Configuration scattered** - Settings in multiple locations

---

## Proposed Solution

### New CLI Commands

```bash
# One-command setup (first time)
npm run setup                  # Install, configure, build, validate

# One-command start (development)
npm run start:all              # Start API + Web + optional scanner

# One-command start (production)
npm run start:prod             # Build + start in production mode

# Service management
npm run status                 # Check all service health
npm run stop                   # Graceful shutdown all services
npm run restart                # Stop + start
npm run logs                   # Tail all service logs
```

---

## Implementation Phases

### Phase 1: Setup Script (`scripts/setup.ts`)

Creates a guided setup experience:

```typescript
// Responsibilities:
// 1. Check Node.js version (>=18)
// 2. Check npm version (>=9)
// 3. Run npm install
// 4. Create .env files from templates
// 5. Prompt for API keys (optional)
// 6. Build all packages
// 7. Validate build success
// 8. Run smoke tests
// 9. Print success message with next steps
```

**New files:**
- `scripts/setup.ts` - Main setup orchestrator
- `scripts/lib/env-manager.ts` - Environment file management
- `scripts/lib/health-check.ts` - Service health validation

---

### Phase 2: Process Manager (`scripts/orchestrator.ts`)

Manages all services from one process:

```typescript
// Features:
// 1. Start/stop services in correct order
// 2. Health check polling
// 3. Auto-restart on crash
// 4. Unified logging with prefixes
// 5. Graceful shutdown (SIGINT/SIGTERM)
// 6. Port conflict detection
```

**Service startup order:**
1. Build check (rebuild if needed)
2. API Server (port 3001)
3. Web Dashboard (port 3000)
4. Scanner (optional, via flag)

**New files:**
- `scripts/orchestrator.ts` - Process manager
- `scripts/lib/process-runner.ts` - Child process wrapper
- `scripts/lib/port-utils.ts` - Port availability checks

---

### Phase 3: Configuration Manager (`scripts/lib/config-manager.ts`)

Centralized configuration:

```typescript
// Features:
// 1. Merge config from multiple sources
// 2. Environment variable overrides
// 3. Runtime config updates
// 4. Config validation with schemas
// 5. Secrets masking in logs
```

**Config priority (highest to lowest):**
1. CLI flags
2. Environment variables
3. `.env.local` files
4. `config/config.json`
5. Default values

---

### Phase 4: Development Mode Enhancements

```bash
npm run dev:all                # Hot-reload everything
```

**Features:**
- Watch mode for all packages
- Auto-rebuild on changes
- Browser auto-refresh
- API restart on changes
- Unified terminal output

---

## File Structure

```
arbitrage-scanner/
├── scripts/
│   ├── setup.ts               # Phase 1: Setup script
│   ├── orchestrator.ts        # Phase 2: Process manager
│   ├── dev.ts                 # Phase 4: Dev mode orchestrator
│   └── lib/
│       ├── env-manager.ts     # Environment file management
│       ├── health-check.ts    # Service health validation
│       ├── process-runner.ts  # Child process wrapper
│       ├── port-utils.ts      # Port utilities
│       ├── config-manager.ts  # Phase 3: Config management
│       └── logger.ts          # Unified logging
├── config/
│   ├── config.json            # Main configuration
│   ├── config.schema.json     # Validation schema
│   └── defaults.json          # Default values
└── templates/
    ├── .env.api.template      # API env template
    └── .env.web.template      # Web env template
```

---

## Package.json Scripts (Final)

```json
{
  "scripts": {
    "setup": "tsx scripts/setup.ts",
    "start:all": "tsx scripts/orchestrator.ts",
    "start:prod": "npm run build && NODE_ENV=production tsx scripts/orchestrator.ts",
    "dev:all": "tsx scripts/dev.ts",
    "status": "tsx scripts/orchestrator.ts --status",
    "stop": "tsx scripts/orchestrator.ts --stop",
    "restart": "npm run stop && npm run start:all",
    "logs": "tsx scripts/orchestrator.ts --logs",

    "// existing scripts preserved": "",
    "build": "npm run build:packages && npm run build:apps",
    "dev": "npm run dev -w apps/cli",
    "dev:api": "npm run dev -w apps/api",
    "dev:web": "npm run dev -w apps/web",
    "test": "npm test --workspaces --if-present"
  }
}
```

---

## Setup Script Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    npm run setup                             │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Version Check                                            │
│     - Node.js >= 18.0.0                                      │
│     - npm >= 9.0.0                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Install Dependencies                                     │
│     - npm install                                            │
│     - Verify workspace installation                          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Environment Setup                                        │
│     - Create apps/api/.env.local from template               │
│     - Create apps/web/.env.local from template               │
│     - Prompt for optional API keys                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Build All                                                │
│     - npm run build:packages                                 │
│     - npm run build:apps                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Validate                                                 │
│     - Check dist/ folders exist                              │
│     - Run typecheck                                          │
│     - Optional: run tests                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  6. Success!                                                 │
│     - Print service URLs                                     │
│     - Show "npm run start:all" command                       │
└─────────────────────────────────────────────────────────────┘
```

---

## Orchestrator Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  npm run start:all                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  1. Pre-flight Checks                                        │
│     - Verify build exists (rebuild if --rebuild flag)        │
│     - Check ports 3000, 3001 available                       │
│     - Load configuration                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Start API Server                                         │
│     - node apps/api/dist/server.js                           │
│     - Wait for health check: GET /health                     │
│     - Timeout: 30s                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Start Web Dashboard                                      │
│     - next start (production) or next dev (development)      │
│     - Wait for http://localhost:3000 ready                   │
│     - Timeout: 60s                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  4. Running State                                            │
│     - Monitor child processes                                │
│     - Restart on crash (with backoff)                        │
│     - Handle SIGINT/SIGTERM for graceful shutdown            │
│     - Unified log output with [API] [WEB] prefixes           │
└─────────────────────────────────────────────────────────────┘
                              │
                     (on shutdown signal)
                              ▼
┌─────────────────────────────────────────────────────────────┐
│  5. Graceful Shutdown                                        │
│     - Send SIGTERM to children                               │
│     - Wait 5s for clean exit                                 │
│     - Force kill if needed                                   │
│     - Exit with code 0                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## CLI Flags

```bash
# Setup options
npm run setup -- --skip-install    # Skip npm install
npm run setup -- --skip-build      # Skip build step
npm run setup -- --yes             # Accept all defaults

# Start options
npm run start:all -- --rebuild     # Force rebuild before start
npm run start:all -- --no-web      # Start API only
npm run start:all -- --no-api      # Start Web only
npm run start:all -- --scanner     # Also start background scanner
npm run start:all -- --port-api 4001  # Custom API port
npm run start:all -- --port-web 4000  # Custom Web port

# Dev options
npm run dev:all -- --no-browser    # Don't auto-open browser
npm run dev:all -- --verbose       # Extra logging
```

---

## Environment Templates

### `templates/.env.api.template`
```env
# API Server Configuration
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
ENABLE_WS=true
RATE_LIMIT_MAX=100
DATA_DIR=./data

# Optional: Exchange API Keys
# KALSHI_API_KEY=
# KALSHI_PRIVATE_KEY=
```

### `templates/.env.web.template`
```env
# Web Dashboard Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
```

---

## Success Criteria

1. **First-time setup**: `npm run setup` works on fresh clone
2. **One-command start**: `npm run start:all` launches everything
3. **Graceful shutdown**: Ctrl+C cleanly stops all services
4. **Auto-recovery**: Services restart on crash
5. **Clear logging**: Know which service logged what
6. **Port flexibility**: Can change ports via flags
7. **Cross-platform**: Works on Windows, macOS, Linux

---

## Implementation Order

| Phase | Deliverable | Effort |
|-------|-------------|--------|
| 1 | Setup script + env templates | 2-3 hours |
| 2 | Process orchestrator | 3-4 hours |
| 3 | Config manager | 1-2 hours |
| 4 | Dev mode enhancements | 2-3 hours |

**Total estimated effort: 8-12 hours**

---

## Dependencies to Add

```json
{
  "devDependencies": {
    "tsx": "^4.x",           // Already present
    "chalk": "^5.x",         // Already in CLI
    "ora": "^6.x",           // Already in CLI
    "inquirer": "^9.x",      // Interactive prompts
    "tree-kill": "^1.x",     // Cross-platform process killing
    "get-port": "^7.x",      // Find available ports
    "wait-on": "^7.x"        // Wait for services to be ready
  }
}
```

---

## Migration Path

1. Implement Phase 1 (setup script)
2. Test on fresh clone
3. Implement Phase 2 (orchestrator)
4. Update README with new commands
5. Deprecate old multi-terminal workflow
6. Implement Phases 3-4 as enhancements
