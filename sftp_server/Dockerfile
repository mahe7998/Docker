FROM alpine:latest

RUN apk add --no-cache openssh \
    && mkdir -p /home/sftp_user \
    && adduser -h /home/sftp_user -s /sbin/nologin -D sftp_user \
    && echo "sftp_user:welcome1234" | chpasswd \
    && mkdir -p /etc/ssh/sshd_config.d

# Configure SSHD
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config \
    && echo "Subsystem sftp internal-sftp" > /etc/ssh/sshd_config.d/sftp.conf \
    && echo "Match User sftp_user" >> /etc/ssh/sshd_config.d/sftp.conf \
    && echo "  ChrootDirectory %h" >> /etc/ssh/sshd_config.d/sftp.conf \
    && echo "  ForceCommand internal-sftp" >> /etc/ssh/sshd_config.d/sftp.conf \
    && echo "  AllowTcpForwarding no" >> /etc/ssh/sshd_config.d/sftp.conf

# Generate host keys
RUN ssh-keygen -A

# Create directory for mounting external volume
RUN mkdir -p /data

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 22

ENTRYPOINT ["/entrypoint.sh"]