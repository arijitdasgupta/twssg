# --- Rebuild runner ---
FROM oven/bun:1 AS runner

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

RUN chown -R bun:bun /app

USER bun

CMD ["bun", "run", "src/cli.ts", "start"]
