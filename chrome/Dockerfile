FROM ubuntu:16.04

RUN  apt-get update \
  && apt-get install -y wget

#RUN wget https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb

COPY chrome64_48.0.2564.109.deb .

RUN dpkg -i chrome64_48.0.2564.109.deb; apt-get -fy install

RUN apt-get install sudo

# Replace 1000 with your user / group id
RUN export uid=1000 gid=1000 && \
    mkdir -p /home/developer && \
    echo "developer:x:${uid}:${gid}:Developer,,,:/home/developer:/bin/bash" >> /etc/passwd && \
    echo "developer:x:${uid}:" >> /etc/group && \
    echo "developer ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/developer && \
    chmod 0440 /etc/sudoers.d/developer && \
    chown ${uid}:${gid} -R /home/developer

USER developer
ENV HOME /home/developer
CMD google-chrome --no-sandbox


