FROM datamachines/cudnn_tensorflow_opencv:10.2_2.3.0_4.4.0-20200803

EXPOSE 8888

RUN apt-get update && apt-get install -y sudo && apt-get install -y emacs

RUN pip install imutils

RUN apt-get install -y \
    libgstreamer1.0-0 gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
    gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav \
    gstreamer1.0-doc gstreamer1.0-tools gstreamer1.0-x gstreamer1.0-alsa \
    gstreamer1.0-gl gstreamer1.0-gtk3 gstreamer1.0-qt5 gstreamer1.0-pulseaudio \
    gstreamer1.0-plugins-base-apps strace

RUN git clone https://github.com/AlexeyAB/darknet.git && cd darknet && make -j 8 GPU=1 CUDNN=1 CUDNN_HALF=1 OPENCV=1 ARCH="-gencode arch=compute_75,code=[sm_75,compute_75]"

RUN wget https://github.com/AlexeyAB/darknet/releases/download/darknet_yolo_v3_optimal/yolov4.weights

COPY imshow.py .
