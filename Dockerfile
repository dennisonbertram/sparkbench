# Sparkbench, hosted: the app, its API, and the circuit-board toolchain (KiCad 9, Freerouting, KiKit, ngspice).
FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl gnupg software-properties-common \
 && add-apt-repository -y ppa:kicad/kicad-9.0-releases \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends \
      nodejs kicad kicad-footprints python3 python3-pip openjdk-21-jre-headless ngspice \
 && rm -rf /var/lib/apt/lists/*

# Freerouting (the jar: the native CLI build crashes in 2.5.0), and KiKit for panels, both where the server looks.
RUN mkdir -p /root/.cache/sparkbench/freerouting \
 && curl -fsSL -o /root/.cache/sparkbench/freerouting/freerouting-2.5.0.jar \
      https://github.com/freerouting/freerouting/releases/download/v2.5.0/freerouting-2.5.0.jar \
 && echo "f6f51bb02245e8e717f9359bd260cc9c5c0b1bc0acc8b7cb2cd5b8ffeb5de3c7  /root/.cache/sparkbench/freerouting/freerouting-2.5.0.jar" | sha256sum -c - \
 && python3 -m pip install --no-cache-dir --break-system-packages --target /root/.cache/sparkbench/kikit-lib kikit
ENV JAVA=/usr/lib/jvm/java-21-openjdk-amd64/bin/java

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

ENV SPARKBENCH_MODE=hosted \
    DATA_DIR=/data \
    PORT=3000 \
    NODE_ENV=production
EXPOSE 3000
CMD ["npx", "tsx", "server/index.ts"]
