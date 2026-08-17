# Runs the local Next.js interface against the Dockerized FastAPI service.
FROM oven/bun:1 AS dependencies

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM node:22-slim

ENV NODE_ENV=development

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

EXPOSE 3000

CMD ["node", "./node_modules/next/dist/bin/next", "dev", "--hostname", "0.0.0.0", "--port", "3000"]
