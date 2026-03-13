# Educentr Claude Plugins

Marketplace of Claude Code plugins for API development workflows.

## Plugins

| Plugin | Description | Version |
|--------|-------------|---------|
| [api-tools](./plugins/api-tools) | Convert API documentation to OpenAPI specs | 1.0.0 |
| [go-project-starter](./plugins/go-project-starter) | Generate Go microservices from YAML configs | 1.0.0 |

### api-tools

Skills included:

- **text-to-openapi** — Convert web/text API documentation into OpenAPI 3.0.3 YAML specs with ogen validation

### go-project-starter

Comprehensive skill set for the [go-project-starter](https://github.com/Educentr/go-project-starter) code generator. Helps compose YAML configs, generate production-ready Go microservices, and manage project lifecycle.

**Reference skill:**

- **go-project-starter** — Full config reference, validation rules, real-world patterns, troubleshooting. Auto-triggers on go-project-starter related questions.

**Create commands (new project from scratch):**

| Command | Description |
|---------|-------------|
| `/create-rest-api` | Create REST API microservice (ogen + sys) |
| `/create-telegram-bot` | Create Telegram bot service |
| `/create-grpc` | Create gRPC client service |

**Add commands (modify existing project):**

| Command | Description |
|---------|-------------|
| `/add-rest-api` | Add REST API or REST client transport |
| `/add-grpc` | Add gRPC client transport |
| `/add-telegram-bot` | Add Telegram bot worker |
| `/add-kafka` | Add Kafka producer or consumer |
| `/add-goat-test` | Add GOAT integration tests |

Every command follows the same mandatory workflow: interview user, create/modify config, run `make regenerate`, run `make build`, verify no errors.

## Installation

### Add marketplace

```bash
/plugin marketplace add Educentr/claude
```

### Install plugin

```bash
# API tools
/plugin install api-tools@educentr-marketplace

# Go Project Starter
/plugin install go-project-starter@educentr-marketplace
```

### Settings entry

```json
"api-tools@educentr-marketplace": true,
"go-project-starter@educentr-marketplace": true
```

## Usage

Invoke skills explicitly:

```
/api-tools:text-to-openapi
/go-project-starter:create-rest-api
/go-project-starter:add-kafka
```

Or let Claude auto-trigger them based on context.

## Adding New Plugins

1. Create a directory under `plugins/<plugin-name>/`
2. Add `.claude-plugin/plugin.json` manifest
3. Add skills under `skills/<skill-name>/SKILL.md`
4. Register the plugin in `.claude-plugin/marketplace.json`
