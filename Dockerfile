FROM node:20-bookworm-slim AS node_deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY atrium/package.json ./atrium/
COPY aegis/package.json ./aegis/
COPY hatchery/package.json ./hatchery/
RUN npm ci

FROM node_deps AS builder
COPY shared ./shared
COPY atrium ./atrium
COPY aegis ./aegis
COPY hatchery ./hatchery
COPY scripts ./scripts
RUN npm run build:all

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PARIX_DB_PATH=/app/data/memory.db
ENV HANDS_WS_URL=ws://hands:8765
ENV PARIX_WS_HOST=0.0.0.0
ENV PARIX_WS_PORT=8765
ENV AEGIS_UI_PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip python3-venv tini ca-certificates build-essential portaudio19-dev \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY shared/package.json ./shared/
COPY atrium/package.json ./atrium/
COPY hatchery/package.json ./hatchery/
RUN npm ci --workspace=shared --workspace=atrium --workspace=hatchery --omit=dev

COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/shared/*.json ./shared/
COPY --from=builder /app/shared/schema.sql ./shared/schema.sql
COPY --from=builder /app/atrium/dist ./atrium/dist
COPY --from=builder /app/aegis/dist ./aegis/dist
COPY --from=builder /app/hatchery/dist ./hatchery/dist
COPY scripts ./scripts
COPY hands ./hands
RUN python3 -m pip install --break-system-packages --no-cache-dir -r hands/requirements.txt \
  && mkdir -p /app/data

EXPOSE 3000 8765 8766
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8766/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "atrium/dist/index.js"]
