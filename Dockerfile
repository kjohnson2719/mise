# syntax=docker/dockerfile:1

# Merran: one image, serving the API and the web app.
#
#   docker build -t merran .
#   docker run -p 3000:3000 -v ./data:/data merran
#
# Releases are built by .github/workflows/release.yml, as
# ghcr.io/merran-app/merran:<version>.

FROM node:24-slim AS base
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# ---- The server's production dependencies, and nothing else ----
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @merran/server

# ---- The web app: static files, so it's built once, on the build machine ----
FROM --platform=$BUILDPLATFORM node:24-slim AS web
ENV PNPM_HOME=/pnpm \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @merran/web
COPY packages/shared/src packages/shared/src
COPY apps/web apps/web
RUN pnpm --filter @merran/web build

# ---- Runtime ----
FROM node:24-slim
ARG TARGETARCH
ENV NODE_ENV=production \
    PORT=3000 \
    MERRAN_DATA_DIR=/data \
    MERRAN_INSTALL_METHOD=docker \
    MERRAN_YTDLP_PATH=/opt/yt-dlp/yt-dlp

# Tools, before the app so this layer stays cached between app updates:
# - setpriv (from util-linux), for the entrypoint to drop root after
#   setting up the data folder.
# - ffmpeg, for frames and sound from recipe videos: a static build from
#   BtbN/FFmpeg-Builds (linked from ffmpeg.org), since Debian's package and
#   its libraries would add about 900 MB.
# - yt-dlp, which reads TikTok, YouTube, Instagram and Facebook: the
#   standalone nightly build, which keeps up with site changes fastest.
#   Merran keeps it updated (modules/video), so the entrypoint hands
#   /opt/yt-dlp to the app's user.
# Both downloads are checked against their releases' checksums.
RUN apt-get update \
    && apt-get install -y --no-install-recommends util-linux ca-certificates curl xz-utils \
    && case "$TARGETARCH" in \
         arm64) ytdlp=yt-dlp_linux_aarch64; ffmpeg=ffmpeg-master-latest-linuxarm64-gpl ;; \
         *) ytdlp=yt-dlp_linux; ffmpeg=ffmpeg-master-latest-linux64-gpl ;; \
       esac \
    && mkdir -p /tmp/tools /opt/yt-dlp && cd /tmp/tools \
    && curl -fsSLO "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/$ffmpeg.tar.xz" \
    && curl -fsSLO "https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/checksums.sha256" \
    && grep " $ffmpeg.tar.xz\$" checksums.sha256 | sha256sum -c - \
    && tar -xJf "$ffmpeg.tar.xz" --strip-components=2 -C /usr/local/bin "$ffmpeg/bin/ffmpeg" \
    && curl -fsSLO "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/$ytdlp" \
    && curl -fsSLO "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/SHA2-256SUMS" \
    && grep " $ytdlp\$" SHA2-256SUMS | sha256sum -c - \
    && install -m 755 "$ytdlp" /opt/yt-dlp/yt-dlp \
    && cd / && rm -rf /tmp/tools \
    && apt-get purge -y curl xz-utils && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/* \
    && command -v setpriv && ffmpeg -version | head -n 1 && /opt/yt-dlp/yt-dlp --version

# The release this is (CI passes it: 0.1.0-alpha.1, or 0.0.0-edge.<commit>),
# after the tools so a new version doesn't download them again.
ARG MERRAN_VERSION=0.0.0-dev
ENV MERRAN_VERSION=$MERRAN_VERSION

WORKDIR /app
COPY --from=deps /app/node_modules node_modules
COPY --from=deps /app/apps/server/node_modules apps/server/node_modules
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY apps/server/package.json apps/server/
COPY apps/server/src apps/server/src
COPY --from=web /app/apps/web/dist apps/web/dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/merran-entrypoint
COPY --chmod=755 docker/merran.sh /usr/local/bin/merran
RUN mkdir -p /data

EXPOSE 3000
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

ENTRYPOINT ["merran-entrypoint"]
CMD ["node", "apps/server/src/index.ts"]
