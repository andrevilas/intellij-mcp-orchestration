# MCP Console — Server API

This directory will contain the backend services that power the Console MCP experience. The implementation will follow the MCP JSON-RPC conventions so the UI can orchestrate local and remote providers in a single workspace.

## Planned Structure

- `src/` or equivalent module path with the service entrypoint.
- Infrastructure helpers (configuration, telemetry, adapters) colocated with the server code.
- Containerization and deployment assets (Dockerfile, compose files) once the API is defined.

The folder currently serves as a skeleton while subsequent tasks introduce the actual runtime and endpoints.
