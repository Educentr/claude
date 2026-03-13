**The Problem:** Your `rest:` section defines a transport named `api`, but your `applications:` section does not reference it. The `server` application only lists `sys` in its `transport:` list. The generator validates that every declared transport is assigned to at least one application.

**The Fix:** Add `api` to the `server` application's transport list:

```yaml
applications:
  - name: server
    transport:
      - name: api    # <-- add this line
      - name: sys
    worker: [notifier]
```

Alternatively, if you want `api` in a separate container, create a second application for it.
