# Educentr Claude Plugins

Marketplace of Claude Code plugins for API development workflows.

## Plugins

| Plugin | Description | Version |
|--------|-------------|---------|
| [agent-bus](./plugins/agent-bus) | Claude Code ↔ Codex: a channel into the Codex chat you have open (or a background one), agent-to-agent questions, round-based code review | 2.0.0 |
| [api-tools](./plugins/api-tools) | Convert API documentation to OpenAPI specs | 1.0.0 |
| [go-project-starter](./plugins/go-project-starter) | Generate Go microservices from YAML configs | 1.0.0 |

### agent-bus

Two coding agents on one machine talking to each other instead of through you. One command in Claude Code opens the channel to the Codex chat you already have open — you see both sides and can join in; with no chat open, and only if you ask, a Codex answers in the background read-only. Roles are not fixed: who asks, who reviews and who writes is agreed in the messages, and a review is one use of the channel. Ships the `agent-bus` CLI (added to the Bash `PATH` while the plugin is enabled), a protocol with typed messages and a round-limited review format, and everything the Codex side needs — see [plugins/agent-bus/codex/INTEGRATION.md](./plugins/agent-bus/codex/INTEGRATION.md).

Skills included:

- **agent-bus** — ask another agent, wait in the background, reply, handle timeouts; what a message from an agent may and may not change
- **codex-review** — review request and verdict format, handling `REQUEST_CHANGES`, five rounds then the user

Commands only the user runs:

| Command | Description |
|---------|-------------|
| `/agent-bus:install` | Put the CLI and the Codex-side skill where Codex finds them (copy in `~/.local/share/agent-bus`, links in `~/.local/bin` and `~/.agents/skills`); optionally the `AGENTS.md` block and the mailbox as a writable root for Codex |
| `/agent-bus:connect` | Open the channel for the current project — the Codex chat you have open, or `--headless` for a background one; `disconnect` / `status` as arguments |
| `/agent-bus:uninstall` | Remove what `install` put there; the mailbox is left alone |

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
# Agent bus (Claude Code <-> Codex)
/plugin install agent-bus@educentr-marketplace

# API tools
/plugin install api-tools@educentr-marketplace

# Go Project Starter
/plugin install go-project-starter@educentr-marketplace
```

### Settings entry

```json
"agent-bus@educentr-marketplace": true,
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
