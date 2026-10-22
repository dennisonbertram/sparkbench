ARG NODE_IMAGE=node:22-bookworm-slim
ARG UBUNTU_IMAGE=ubuntu:24.04
FROM ${NODE_IMAGE} AS node
FROM ${UBUNTU_IMAGE}

ENV DEBIAN_FRONTEND=noninteractive LANG=C.UTF-8
ARG KICAD_VERSION=8.0.9-0~ubuntu24.04.1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates software-properties-common \
    && add-apt-repository -y ppa:kicad/kicad-8.0-releases \
    && apt-get update && apt-get install -y --no-install-recommends kicad=${KICAD_VERSION} \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx
WORKDIR /lab
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY server ./server
COPY scripts ./scripts
COPY tests ./tests
COPY tsconfig.json vite.config.ts ./
RUN mkdir -p /lab/out && chown -R ubuntu:ubuntu /lab
USER ubuntu
ENV HOME=/tmp
CMD ["npm", "run", "compatibility:lab"]
