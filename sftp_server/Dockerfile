FROM alpine:latest

# Get password from build argument (required)
ARG SFTP_PASSWORD
ARG SFTP_USERNAME=sftp_user

# Verify password was provided
RUN if [ -z "$SFTP_PASSWORD" ]; then \
    echo "ERROR: SFTP_PASSWORD build argument is required." && \
    echo "Build with: docker build --build-arg SFTP_PASSWORD=your_password ." && \
    exit 1; \
    fi

RUN apk add --no-cache openssh \
    && mkdir -p /home/sftp_user \
    && adduser -h /home/sftp_user -s /sbin/nologin -D "${SFTP_USERNAME}" \
    && echo "${SFTP_USERNAME}:${SFTP_PASSWORD}" | chpasswd \
    && mkdir -p /etc/ssh/sshd_config.d \
    && mkdir -p /home/${SFTP_USERNAME}/.ssh \
    && chown ${SFTP_USERNAME}:${SFTP_USERNAME} /home/${SFTP_USERNAME}/.ssh \
    && chmod 700 /home/${SFTP_USERNAME}/.ssh

# Configure SSHD
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config \
    && sed -i 's/#PubkeyAuthentication yes/PubkeyAuthentication yes/' /etc/ssh/sshd_config \
    && echo "Subsystem sftp internal-sftp" > /etc/ssh/sshd_config.d/sftp.conf \
    && echo "Match User ${SFTP_USERNAME}" >> /etc/ssh/sshd_config.d/sftp.conf \
    && echo "  ChrootDirectory %h" >> /etc/ssh/sshd_config.d/sftp.conf \
    && echo "  ForceCommand internal-sftp" >> /etc/ssh/sshd_config.d/sftp.conf \
    && echo "  AllowTcpForwarding no" >> /etc/ssh/sshd_config.d/sftp.conf \
    && echo "  AuthorizedKeysFile /home/${SFTP_USERNAME}/.ssh/authorized_keys" >> /etc/ssh/sshd_config.d/sftp.conf

# Generate host keys
RUN ssh-keygen -A

# Create directory for mounting external volume
RUN mkdir -p /data

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22

ENTRYPOINT ["/entrypoint.sh"]
