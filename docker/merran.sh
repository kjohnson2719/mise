#!/bin/sh
# Merran's commands, like `merran rotate-secret`, run as the same user as the
# server:
#
#   docker exec -it merran merran rotate-secret
exec merran-entrypoint node /app/apps/server/src/cli/index.ts "$@"
