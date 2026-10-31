#!/usr/bin/env bash
# Host-side wrapper for the Postgres MCP server.
# Ensures a single named container and tears it down when stdin closes
# (i.e. when the MCP client disconnects), preventing the container leaks
# that occurred with `docker run -i --rm` alone (postgres-mcp does not exit
# on stdin EOF).
set -u
NAME="vozlab-postgres-mcp"
IMAGE="crystaldba/postgres-mcp"

# Clean up any stale container from a previous/crashed session.
docker rm -f "$NAME" >/dev/null 2>&1 || true

FIFO="$(mktemp -u /tmp/vozlab-postgres-mcp.XXXXXX)"
mkfifo "$FIFO" || { echo "cannot create fifo" >&2; exit 1; }

cleanup() {
    kill -KILL "$DOCKER_PID" 2>/dev/null || true
    wait "$DOCKER_PID" 2>/dev/null || true
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    rm -f "$FIFO"
}
trap cleanup EXIT INT TERM HUP

# Start the container with stdin fed from the FIFO.
docker run -i --rm --name "$NAME" \
    --entrypoint /bin/sh \
    --add-host=host.docker.internal:host-gateway \
    -e DATABASE_URI \
    "$IMAGE" \
    -c 'mkfifo /tmp/mcp.stdin; postgres-mcp --access-mode=restricted < /tmp/mcp.stdin & MCP_PID=$!; stdbuf -i0 -o0 cat > /tmp/mcp.stdin; kill -KILL $MCP_PID 2>/dev/null; wait $MCP_PID 2>/dev/null' \
    < "$FIFO" &
DOCKER_PID=$!

# Forward this process' stdin (the MCP client pipe) into the FIFO.
# When the client disconnects, stdin reaches EOF, cat returns, and we tear
# the container down.
stdbuf -i0 -o0 cat > "$FIFO"

# stdin closed: ensure teardown (also handled by trap).
cleanup
trap - EXIT INT TERM HUP
exit 0
