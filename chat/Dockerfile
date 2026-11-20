FROM oven/bun:1.3.13
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY server.ts tsconfig.json ./
COPY src ./src
ENV NODE_ENV=production PORT=3000 CONFIG_PATH=/app/config.json DATA_DIR=/app/data
EXPOSE 3000
CMD ["bun", "server.ts"]
