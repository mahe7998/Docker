FROM cuda-conda

COPY conda-init.sh .

# switch shell sh (default in Linux) to bash
SHELL ["/bin/bash", "-c"]

RUN source conda-init.sh \
    && conda activate pytorch \
    && conda install -y pandas scikit-learn \
    && conda install python-graphviz

EXPOSE 80

WORKDIR /root
