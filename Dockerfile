# getgrant.ai — single-container image: Node server (API + SPA + websockets)
# with a Python venv for the scrapers the server spawns.
FROM node:24-bookworm-slim

# Python for the scrapers.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv python3-pip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Node deps (dev deps included — vite/esbuild are needed for the build).
COPY package.json package-lock.json ./
RUN npm ci

# Python venv + Playwright Chromium (--with-deps installs its system libs).
COPY scrapers/requirements.txt scrapers/requirements.txt
# playwright --with-deps installs system libraries via apt, so the package
# lists removed above have to be refreshed first.
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir -r scrapers/requirements.txt \
  && apt-get update \
  && /opt/venv/bin/playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/*

COPY . .

# Vite inlines VITE_* into the client bundle at build time, so these have to be
# present here — setting them only as runtime variables leaves the deployed
# client with no Supabase credentials and no way to sign in. Railway passes
# service variables to the build as arguments; Docker still needs them declared.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_POSTHOG_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_POSTHOG_KEY=$VITE_POSTHOG_KEY

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production \
    PYTHON_BIN=/opt/venv/bin/python \
    PORT=5000

EXPOSE 5000

# uploads/ should be a mounted volume in production (partner assets).
CMD ["npm", "start"]
