import cv2
import matplotlib.pyplot as plt
import sys

# define helper functions
def imShow(path):
  image = cv2.imread(path)
  height, width = image.shape[:2]
  resized_image = cv2.resize(image,(3*width, 3*height), interpolation = cv2.INTER_CUBIC)

  fig = plt.gcf()
  fig.set_size_inches(18, 10)
  plt.axis("off")
  plt.imshow(cv2.cvtColor(resized_image, cv2.COLOR_BGR2RGB))
  plt.show()

print('Number of arguments:', len(sys.argv), 'arguments.')
print('Argument List:', str(sys.argv))

imShow(sys.argv[1])
