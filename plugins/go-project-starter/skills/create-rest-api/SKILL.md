---
name: create-rest-api
description: "Create a new Go REST API microservice from scratch using go-project-starter. Generates complete project with ogen OpenAPI server, sys metrics endpoint, Dockerfile, CI/CD, Makefile. Use when user wants to create a new REST API project."
---

# Create REST API Service

Interactive command to create a new Go REST API microservice from scratch.

## Mandatory Steps

The task is NOT complete until ALL of these pass:
1. Interview the user to gather requirements
2. Create project.yaml config
3. Run generation successfully
4. Run build successfully (no compilation errors)

## Step 1: Interview

Ask the user these questions (use AskUserQuestion). Skip questions where user already provided info:

1. **Project name** — service name (lowercase, NO hyphens — hyphens break Go type generation). Example: `orderservice`
2. **Git repo URL** — e.g., `git@github.com:myorg/order-service.git`
3. **Go module path** — e.g., `github.com/myorg/order-service`
4. **OpenAPI spec** — does the user have a swagger file? If yes, where is it? If no, create a minimal one.
5. **API port** — default 8080
6. **Auth handler** — does the API need auth? (`auth_handler: "on"` or `"off"`)
7. **Dev stand** — need local Docker environment with OnlineConf? (default: no)
8. **Target directory** — where to generate the project

## Step 2: Create Config

Read the go-project-starter skill (`references/config-schema.md` in sibling skill) if you need field details.

Create a config directory with `project.yaml`:

```yaml
main:
  name: {project_name}
  logger: zerolog
  registry_type: github

git:
  repo: {git_repo}
  module_path: {module_path}

rest:
  - name: api
    path: [./api.swagger.yml]
    generator_type: ogen
    port: {port}
    version: v1
    generator_params:
      auth_handler: "{on_or_off}"
  - name: sys
    port: {port + 1010}  # e.g., 9090
    version: v1
    generator_type: template
    generator_template: sys

post_generate:
  - git_install
  - tools_install
  - clean_imports
  - executable_scripts
  - call_generate
  - go_mod_tidy

applications:
  - name: server
    transport:
      - name: api
      - name: sys
```

If user doesn't have an OpenAPI spec, create a minimal one with ErrorDefault schema:

```yaml
openapi: "3.0.0"
info:
  title: "{project_name} API"
  version: "1.0.0"
paths:
  /health:
    get:
      operationId: healthCheck
      responses:
        '200':
          description: OK
          content:
            application/json:
              schema:
                type: object
                properties:
                  status:
                    type: string
        default:
          description: Error
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorDefault'
components:
  schemas:
    ErrorDefault:
      required: [code, error]
      properties:
        code:
          type: integer
          format: int32
        error:
          type: string
      type: object
```

## Step 3: Generate

```bash
# Ensure go-project-starter is installed
which go-project-starter || go install github.com/Educentr/go-project-starter/cmd/go-project-starter@latest

# Place config in target's .project-config/
mkdir -p {target_dir}/.project-config
cp project.yaml *.swagger.yml {target_dir}/.project-config/

# Generate
go-project-starter --target={target_dir}
```

If generation fails, read the error, fix config in `.project-config/`, and retry.

## Step 4: Build

```bash
cd {target_dir}
make generate
make build
```

If build fails:
- Check for missing ErrorDefault schema in OpenAPI spec
- Check go mod tidy ran correctly
- Fix and retry

Only report success when both generation AND build complete without errors.

## Step 5: Summary

Tell the user:
- Where the project was created
- Key directories: `cmd/`, `internal/app/transport/rest/`, `internal/pkg/service/`
- How to run: `make run-server` or `make docker-server`
- How to add handlers: edit files in `internal/app/transport/rest/api/v1/handler/`
- Remind about disclaimer markers — their code goes BELOW the marker
