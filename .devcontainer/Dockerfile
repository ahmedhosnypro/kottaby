FROM mcr.microsoft.com/devcontainers/base:ubuntu-22.04

# Install openssh-server and system dependencies (non-interactive)
RUN apt-get update && export DEBIAN_FRONTEND=noninteractive \
  && apt-get -y install --no-install-recommends \
  openssh-server \
  postgresql-client \
  fzf \
  xxd \
  openssl \
  libglib2.0-0 \
  libnss3 \
  libatk-bridge2.0-0 \
  libdrm2 \
  libxcomposite1 \
  libxdamage1 \
  libxrandr2 \
  libgbm1 \
  libxss1 \
  libasound2 \
  libcups2 \
  libxkbcommon0 \
  libgtk-3-0 \
  libpangocairo-1.0-0 \
  libatk1.0-0 \
  libcairo-gobject2 \
  libgdk-pixbuf-2.0-0 \
  libxext6 \
  libxfixes3 \
  libx11-6 \
  libxcb1 \
  libxshmfence1 \
  libnspr4 \
  libatspi2.0-0 \
  libpulse0 \
  libwebpdemux2 \
  fonts-noto-cjk \
  && mkdir -p /var/run/sshd \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

USER vscode
ENV SHELL=/bin/zsh
