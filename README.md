# Educentr Claude Plugins

Marketplace of Claude Code plugins for API development workflows.

## Plugins

| Plugin | Description | Version |
|--------|-------------|---------|
| [api-tools](./plugins/api-tools) | Convert API documentation to OpenAPI specs | 1.0.0 |

### api-tools

Skills included:

- **text-to-openapi** — Convert web/text API documentation into OpenAPI 3.0.3 YAML specs with ogen validation

## Installation

### Add marketplace

```bash
/plugin marketplace add Educentr/claude
```

### Install plugin

```bash
/plugin install api-tools@educentr-marketplace
```

### Settings entry

```json
"api-tools@educentr-marketplace": true
```

## Usage

Invoke the skill explicitly:

```
/api-tools:text-to-openapi
```

Or let Claude auto-trigger it when you ask to convert API docs to OpenAPI.

## Adding New Plugins

1. Create a directory under `plugins/<plugin-name>/`
2. Add `.claude-plugin/plugin.json` manifest
3. Add skills under `skills/<skill-name>/SKILL.md`
4. Register the plugin in `.claude-plugin/marketplace.json`
