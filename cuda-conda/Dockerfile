FROM nvidia/cuda:12.8.0-cudnn-runtime-ubuntu20.04 

RUN  apt-get update \
    && apt-get install -y curl

WORKDIR /tmp

RUN curl -O https://repo.anaconda.com/miniconda/Miniconda3-py311_25.1.1-2-Linux-x86_64.sh

RUN echo "d8c1645776c0758214e4191c605abe5878002051316bd423f2b14b22d6cb4251  Miniconda3-py311_25.1.1-2-Linux-x86_64.sh" >> Miniconda3-py311_25.1.1-2-Linux-x86_64.sh.sha256 \
   && sha256sum -c Miniconda3-py311_25.1.1-2-Linux-x86_64.sh.sha256

ENV CONDA_INSTALL_DIR=/root

RUN bash Miniconda3-py311_25.1.1-2-Linux-x86_64.sh -f -b -p ${CONDA_INSTALL_DIR}

RUN bash -c "source ${CONDA_INSTALL_DIR}/bin/activate && conda init"

RUN apt update && apt install tzdata -y

ENV TZ="America/Los_Angeles"  

RUN ln -fs /usr/share/zoneinfo/America/Los_Angeles /etc/localtime
RUN apt-get install -y sudo emacs git build-essential libssl-dev

ENV PATH=/root/bin:$PATH
 
RUN bash -c "conda create -y --name pytorch python=3.11"

SHELL ["conda", "run", "-n", "pytorch", "/bin/bash", "-c"]

RUN pip install --no-input torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126

SHELL ["/bin/bash", "-c"]

RUN bash -c "conda create -y --name tensorflow python=3.10"

SHELL ["conda", "run", "-n", "tensorflow", "/bin/bash", "-c"]

RUN pip install --no-input tensorflow keras jupyter matplotlib

EXPOSE 80
