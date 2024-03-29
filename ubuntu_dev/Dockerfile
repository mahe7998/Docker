FROM arm64v8/ubuntu:20.04@sha256:26c3bd3ae441c873a210200bcbb975ffd2bbf0c0841a4584f4476c8a5b8f3d99

LABEL maintainer="ownCloud GmbH <devops@owncloud.com>" \
  org.opencontainers.image.authors="ownCloud DevOps <devops@owncloud.com>" \
  org.opencontainers.image.title="ownCloud Ubuntu" \
  org.opencontainers.image.url="https://hub.docker.com/r/owncloud/ubuntu" \
  org.opencontainers.image.source="https://github.com/owncloud-docker/ubuntu" \
  org.opencontainers.image.documentation="https://github.com/owncloud-docker/ubuntu"

ENV DEBIAN_FRONTEND noninteractive
ENV TERM xterm

ADD https://github.com/owncloud-ci/wait-for/releases/download/v1.0.2/wait-for-linux-arm64 /usr/bin/wait-for

ENV SU_EXEC_CHECKSUM=ff6f0b36315d2013d4fcc442cded0e0403d6bb29abc4cd6f94f2bde90bf97a38
ADD https://github.com/tianon/gosu/releases/download/1.12/gosu-arm64 /usr/bin/su-exec

ENV GOMPLATE_CHECKSUM=3fc4f88bfd68103d0489932d7fa65bd8590bca6bb6bf1c0e82c3b9f27deee267
ADD https://github.com/hairyhenderson/gomplate/releases/download/v3.9.0/gomplate_linux-arm64 /usr/bin/gomplate

RUN chmod +x /usr/bin/wait-for && \
  echo "${SU_EXEC_CHECKSUM} /usr/bin/su-exec" | sha256sum -c - && \
  chmod +x /usr/bin/su-exec && \
  echo "${GOMPLATE_CHECKSUM} /usr/bin/gomplate" | sha256sum -c - && \
  chmod +x /usr/bin/gomplate

RUN echo "root:root" | chpasswd

RUN apt-get update -y && \
  apt-get install -y \
    ca-certificates \
    bash \
    sudo \
    vim \
    curl \
    wget \
    procps \
    apt-utils \
    apt-transport-https \
    iputils-ping \
    bzip2 \
    unzip \
    cron \
    git-core \
    git \
    sshpass \
    tree \
    jq \
    gnupg \
    sysbench \
    build-essential \
    gdb \
    libnss-wrapper && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

EXPOSE 5000

RUN useradd -ms /bin/bash jmahe && echo "jmahe:.ve3nxq." | chpasswd && adduser jmahe sudo

USER jmahe
WORKDIR /home/jmahe

CMD ["bash"]
