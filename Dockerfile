FROM node:24-bookworm

ENV DEBIAN_FRONTEND=noninteractive

# git: submodules; openssh-client: SSH git remotes; build-essential/python3: native npm addons (node-gyp)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    ca-certificates \
    build-essential \
    python3 \
  && rm -rf /var/lib/apt/lists/*

USER node
