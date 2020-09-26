FROM nvidia/cuda:11.0-cudnn8-runtime-ubuntu18.04 

RUN  apt-get update \
    && apt-get install -y curl

WORKDIR /tmp

RUN curl -O https://repo.anaconda.com/miniconda/Miniconda3-py38_4.8.3-Linux-x86_64.sh

RUN echo "d63adf39f2c220950a063e0529d4ff74  Miniconda3-py38_4.8.3-Linux-x86_64.sh" >> Miniconda3-py38_4.8.3-Linux-x86_64.sh.md5\
    && md5sum -c Miniconda3-py38_4.8.3-Linux-x86_64.sh.md5

ENV CONDA_INSTALL_DIR /root

RUN bash Miniconda3-py38_4.8.3-Linux-x86_64.sh -f -b -p ${CONDA_INSTALL_DIR}

RUN bash -c "source ${CONDA_INSTALL_DIR}/bin/activate && conda init"

RUN apt-get install -y sudo emacs

ENV PATH /root/bin:$PATH

RUN bash -c "conda create -y --name pytorch pytorch torchvision cudatoolkit=10.2 jupyter matplotlib -c pytorch"

RUN bash -c "conda update conda && conda create -y --name tensorflow tensorflow-gpu keras cudatoolkit=10.1 jupyter matplotlib"

EXPOSE 80