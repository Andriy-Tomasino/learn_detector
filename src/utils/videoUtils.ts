export interface VideoFrame {
  index: number;
  imageData: string; // base64 або data URL
}

export const extractFramesFromVideo = async (
  videoFile: File,
  fps: number = 1
): Promise<VideoFrame[]> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) {
      reject(new Error('Не вдалося отримати контекст canvas'));
      return;
    }

    video.preload = 'auto';
    video.src = URL.createObjectURL(videoFile);
    
    video.addEventListener('loadedmetadata', () => {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const frames: VideoFrame[] = [];
      const frameInterval = 1 / fps; // секунди між кадрами
      const duration = video.duration;
      let currentTime = 0;
      let frameIndex = 0;

      const captureFrame = () => {
        if (currentTime >= duration) {
          URL.revokeObjectURL(video.src);
          resolve(frames);
          return;
        }

        video.currentTime = currentTime;
      };

      video.addEventListener('seeked', () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/png');
        frames.push({
          index: frameIndex,
          imageData,
        });
        frameIndex++;
        currentTime += frameInterval;
        captureFrame();
      });

      captureFrame();
    });

    video.addEventListener('error', (e) => {
      URL.revokeObjectURL(video.src);
      reject(e);
    });
  });
};

export const loadImageAsFrame = async (imageFile: File): Promise<VideoFrame> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      const imageData = e.target?.result as string;
      if (imageData) {
        resolve({
          index: 0,
          imageData,
        });
      } else {
        reject(new Error('Не вдалося завантажити зображення'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Помилка читання файлу зображення'));
    };
    
    reader.readAsDataURL(imageFile);
  });
};

