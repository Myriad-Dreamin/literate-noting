# API Reference

Base URL: `http://127.0.0.1:8787`

## Health

`GET /api/health`

Returns service health.

Response:

```json
{
  "ok": true,
  "service": "example"
}
```

## Resource List

`GET /api/resources`

Returns all resources visible in the active workspace.

Response:

```json
{
  "resources": [
    {
      "id": "welcome",
      "title": "Welcome",
      "updatedAt": "2026-01-01T00:00:00.000Z"
    }
  ]
}
```

## Create Resource

`POST /api/resources`

Request:

```json
{
  "title": "New Resource"
}
```

Response:

```json
{
  "resource": {
    "id": "new-resource",
    "title": "New Resource",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

## Errors

Use this section for validated error cases only. Include status code, condition,
and response shape when the implementation defines one.
