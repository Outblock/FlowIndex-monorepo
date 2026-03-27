FROM oven/bun:1.2-alpine

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

COPY src ./src
COPY tsconfig.json ./

EXPOSE 3100

CMD ["bun", "run", "src/index.ts"]
