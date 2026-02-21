#!/bin/sh
set -e

if [ -x /app/node_modules/.bin/prisma ]; then
  /app/node_modules/.bin/prisma db push
fi

exec node dist/index.js
