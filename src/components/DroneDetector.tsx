import React, { useState, useRef, useEffect } from 'react';
import { fetchVideoWithDetections } from '../utils/api';
import './DroneDetector.css';

interface BoundingBox {
  frame?: number;
  timestamp?: number;
  bbox: [number, number, number, number] | [number, number, number, number, number, number]; // [x, y, w, h] or [x_min, y_min, x_max, y_max]
  confidence?: number;
  class?: string;
  id?: string;
}

interface DetectionData {
  frames?: { [key: string]: BoundingBox[] };
  detections?: BoundingBox[];
  [key: string]: any;
}

// Нормалізує bbox до формату [x, y, width, height]
const normalizeBbox = (bbox: BoundingBox['bbox']): [number, number, number, number] => {
  if (bbox.length === 4) {
    // Вже в форматі [x, y, width, height]
    return [bbox[0], bbox[1], bbox[2], bbox[3]];
  } else if (bbox.length === 6) {
    // Формат [x_min, y_min, x_max, y_max, ...]
    return [bbox[0], bbox[1], bbox[2] - bbox[0], bbox[3] - bbox[1]];
  }
  return [0, 0, 0, 0];
};

// Отримує детекції для поточного кадру
const getDetectionsForFrame = (data: DetectionData | null, currentFrame: number, currentTime: number): BoundingBox[] => {
  if (!data) return [];

  // Якщо дані організовані по кадрах
  if (data.frames) {
    const frameKey = currentFrame.toString();
    return data.frames[frameKey] || [];
  }

  // Якщо дані в масиві detections
  if (data.detections && Array.isArray(data.detections)) {
    return data.detections.filter((det) => {
      // Перевіряємо по номеру кадру
      if (det.frame !== undefined) {
        return det.frame === currentFrame;
      }
      // Або по часу (з невеликою похибкою)
      if (det.timestamp !== undefined) {
        return Math.abs(det.timestamp - currentTime) < 0.1; // 100ms tolerance
      }
      return false;
    });
  }

  return [];
};

interface DroneDetectorProps {
  videoId?: string;
  autoLoad?: boolean;
}

export const DroneDetector: React.FC<DroneDetectorProps> = ({ videoId, autoLoad = false }) => {
  const [videoLoaded, setVideoLoaded] = useState(false);
  const [jsonLoaded, setJsonLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectionData, setDetectionData] = useState<DetectionData | null>(null);
  const [currentDetections, setCurrentDetections] = useState<BoundingBox[]>([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [currentVideoId, setCurrentVideoId] = useState<string | undefined>(videoId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Initialize canvas with default size
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      if (canvas.width === 0 || canvas.height === 0) {
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      }
    }

    return () => {
      // Cleanup
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Auto-load video and detections when videoId changes
  useEffect(() => {
    if (videoId && autoLoad) {
      loadVideoFromBackend(videoId);
    }
  }, [videoId, autoLoad]);

  // Update currentVideoId when prop changes
  useEffect(() => {
    setCurrentVideoId(videoId);
  }, [videoId]);

  const loadVideoFromBackend = async (id: string) => {
    if (!id) {
      setError('Video ID не вказано');
      return;
    }

    setIsLoading(true);
    setError(null);
    setVideoLoaded(false);
    setJsonLoaded(false);

    try {
      // Stop any ongoing playback
      if (isPlaying) {
        pauseVideo();
      }

      // Завантажуємо відео та JSON одночасно
      const { video, detections } = await fetchVideoWithDetections(id);
      
      // Завантажуємо відео
      await loadVideoBlob(video);
      
      // Завантажуємо детекції
      setDetectionData(detections);
      setJsonLoaded(true);
      setCurrentVideoId(id);

      // Оновлюємо детекції для поточного кадру
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const frameNumber = Math.floor(video.currentTime * 30); // Припускаємо 30 FPS
        const frameDetections = getDetectionsForFrame(detections, frameNumber, video.currentTime);
        setCurrentDetections(frameDetections);
        
        // Перемальовуємо canvas
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          drawBoundingBoxes(ctx);
        }
      }
    } catch (error: any) {
      console.error('Error loading video from backend:', error);
      setError(`Помилка завантаження з бекенду: ${error.message || 'Невідома помилка'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const loadVideoBlob = async (blob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (!videoRef.current || !canvasRef.current) {
        reject(new Error('Video or canvas ref not available'));
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      // Reset state
      setVideoLoaded(false);
      setCurrentDetections([]);
      setCurrentFrame(0);
      
      // Clean up previous video URL if exists
      if (video.src && video.src.startsWith('blob:')) {
        URL.revokeObjectURL(video.src);
      }
      
      const url = URL.createObjectURL(blob);
      
      // Function to draw first frame and set up video
      const drawFirstFrame = () => {
        const ctx = canvas.getContext('2d');
        if (!ctx || !video) {
          return;
        }
        
        // Check if video is ready
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          // Set canvas dimensions to match video
          if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
          }
          
          // Draw the first frame
          try {
            video.currentTime = 0;
            
            setTimeout(() => {
              if (video && canvas && ctx) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                drawBoundingBoxes(ctx);
                setVideoLoaded(true);
                resolve();
              }
            }, 50);
          } catch (error) {
            console.error('Error drawing first frame:', error);
            reject(error);
          }
        } else {
          setTimeout(drawFirstFrame, 100);
        }
      };
      
      // Set up event handlers before setting src
      video.onloadedmetadata = () => {
        drawFirstFrame();
      };
      video.onloadeddata = () => {
        drawFirstFrame();
      };
      video.oncanplay = () => {
        drawFirstFrame();
      };
      
      // Handle video end event
      video.onended = () => {
        setIsPlaying(false);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
      };
      
      // Handle errors
      video.onerror = (error) => {
        console.error('Video loading error:', error);
        reject(new Error('Помилка завантаження відео'));
      };
      
      // Set video source after handlers are set up
      video.src = url;
      video.load();
      
      // Fallback: try to draw frame after delays
      setTimeout(() => {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          drawFirstFrame();
        }
      }, 500);
      
      setTimeout(() => {
        if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
          drawFirstFrame();
        }
      }, 1000);
    });
  };

  const drawBoundingBoxes = (ctx: CanvasRenderingContext2D) => {
    currentDetections.forEach((detection) => {
      const [x, y, width, height] = normalizeBbox(detection.bbox);
      
      // Колір за замовчуванням
      const color = '#00ff00';
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, width, height);
      
      // Малюємо текст з інформацією
      const label = detection.class || 'Object';
      const confidence = detection.confidence !== undefined 
        ? ` ${(detection.confidence * 100).toFixed(1)}%` 
        : '';
      
      ctx.fillStyle = color;
      ctx.font = '16px Arial';
      ctx.fillText(
        `${label}${confidence}`,
        x,
        y > 20 ? y - 5 : y + 20
      );
    });
  };

  const playVideo = async () => {
    if (videoRef.current && videoLoaded && !isPlaying) {
      try {
        const video = videoRef.current;
        
        // Wait for video to be ready
        if (video.readyState < 2) {
          await new Promise((resolve) => {
            video.oncanplay = resolve;
          });
        }

        // Ensure canvas has correct dimensions
        if (canvasRef.current) {
          if (video.videoWidth > 0 && video.videoHeight > 0) {
            if (canvasRef.current.width !== video.videoWidth || 
                canvasRef.current.height !== video.videoHeight) {
              canvasRef.current.width = video.videoWidth;
              canvasRef.current.height = video.videoHeight;
            }
          }
        }

        // Reset video to start if it has ended
        if (video.ended) {
          video.currentTime = 0;
        }

        setIsPlaying(true);
        processVideo();
      } catch (error) {
        console.error('Error playing video:', error);
        setIsPlaying(false);
        alert('Помилка відтворення відео. Спробуйте ще раз.');
      }
    }
  };

  const pauseVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    }
  };

  const stopVideo = () => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
      setIsPlaying(false);
      setCurrentFrame(0);
      setCurrentDetections([]);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Redraw first frame
      if (canvasRef.current && videoRef.current) {
        const canvas = canvasRef.current;
        const video = videoRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          drawBoundingBoxes(ctx);
        }
      }
    }
  };

  const processVideo = async () => {
    if (!videoRef.current || !canvasRef.current || !isPlaying) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Wait for video to be ready
    const waitForVideo = () => {
      return new Promise<void>((resolve) => {
        if (video.readyState >= 2) {
          resolve();
        } else {
          video.oncanplay = () => resolve();
          video.onloadeddata = () => resolve();
        }
      });
    };

    await waitForVideo();

    // Set canvas size
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }
    }

    // Ensure video is ready before playing
    try {
      if (video.paused) {
        await video.play();
        console.log('Video started playing');
      }
    } catch (error) {
      console.error('Error playing video:', error);
    }

    const processFrame = async () => {
      if (!videoRef.current || !canvasRef.current || !isPlaying) {
        setIsPlaying(false);
        return;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        setIsPlaying(false);
        return;
      }

      // Ensure video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
        return;
      }

      // Ensure canvas has correct dimensions
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      // Check if video is paused and try to play it
      if (video.paused && !video.ended) {
        try {
          await video.play();
        } catch (error) {
          console.error('Error playing video in processFrame:', error);
        }
      }

      if (video.ended) {
        setIsPlaying(false);
        if (animationFrameRef.current) {
          cancelAnimationFrame(animationFrameRef.current);
          animationFrameRef.current = null;
        }
        // Redraw first frame
        if (canvasRef.current && videoRef.current) {
          const canvas = canvasRef.current;
          const video = videoRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
            video.currentTime = 0;
            setTimeout(() => {
              if (ctx && video && video.readyState >= 2) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                drawBoundingBoxes(ctx);
              }
            }, 100);
          }
        }
        return;
      }

      // Always draw video frame
      if (video.readyState >= 2 && canvas.width > 0 && canvas.height > 0) {
        try {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          
          // Оновлюємо детекції для поточного кадру
          const frameNumber = Math.floor(video.currentTime * 30); // Припускаємо 30 FPS
          const detections = getDetectionsForFrame(detectionData, frameNumber, video.currentTime);
          setCurrentDetections(detections);
          setCurrentFrame(frameNumber);
          
          // Малюємо bounding boxes
          drawBoundingBoxes(ctx);
        } catch (error) {
          console.error('Error drawing video frame:', error);
        }
      }

      if (isPlaying) {
        animationFrameRef.current = requestAnimationFrame(processFrame);
      }
    };

    processFrame();
  };

  return (
    <div className="drone-detector">
      <div className="detector-controls">
        <div className="action-buttons">
          {!currentVideoId && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Введіть Video ID"
                value={currentVideoId || ''}
                onChange={(e) => setCurrentVideoId(e.target.value)}
                style={{
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  background: 'rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '14px',
                  minWidth: '200px',
                }}
              />
              <button
                onClick={() => currentVideoId && loadVideoFromBackend(currentVideoId)}
                className="upload-btn"
                disabled={!currentVideoId || isLoading}
              >
                {isLoading ? 'Завантаження...' : 'Завантажити з бекенду'}
              </button>
            </div>
          )}
          
          {currentVideoId && !autoLoad && (
            <button
              onClick={() => loadVideoFromBackend(currentVideoId)}
              className="upload-btn"
              disabled={isLoading}
            >
              {isLoading ? 'Завантаження...' : 'Оновити дані'}
            </button>
          )}
          
          {videoLoaded && (
            <>
              {!isPlaying ? (
                <button
                  onClick={playVideo}
                  className="play-btn"
                >
                  Відтворити
                </button>
              ) : (
                <>
                  <button
                    onClick={pauseVideo}
                    className="pause-btn"
                  >
                    Пауза
                  </button>
                  <button
                    onClick={stopVideo}
                    className="stop-btn"
                  >
                    Стоп
                  </button>
                </>
              )}
            </>
          )}
        </div>

        {error && (
          <div style={{ color: '#f44336', padding: '10px', background: 'rgba(244, 67, 54, 0.1)', borderRadius: '6px' }}>
            {error}
          </div>
        )}
        
        {isLoading && (
          <div className="loading-status">
            Завантаження відео та детекцій...
          </div>
        )}
        
        {videoLoaded && !error && (
          <div className="video-status">
            Відео завантажено
          </div>
        )}
        {jsonLoaded && !error && (
          <div className="video-status">
            Детекції завантажено
          </div>
        )}
      </div>

      <div className="detection-area">
        <div className="video-container">
          <video
            ref={videoRef}
            playsInline
            muted
            style={{ display: 'none' }}
          />
          <canvas ref={canvasRef} className="detection-canvas" />
          {!videoLoaded && (
            <div className="video-placeholder">
              Завантажте відео та JSON файл з bounding boxes
            </div>
          )}
        </div>

        <div className="detection-info">
          <h3>Детекції</h3>
          <div className="detection-count">
            Поточний кадр: <strong>{currentFrame}</strong>
          </div>
          <div className="detection-count">
            Знайдено об'єктів: <strong>{currentDetections.length}</strong>
          </div>
          <div className="detection-list">
            {currentDetections.length === 0 ? (
              <div className="empty-detections">Об'єкти не знайдені</div>
            ) : (
              currentDetections.map((detection, index) => (
                <div key={index} className="detection-item">
                  <div className="detection-header">
                    <div className="detection-title">
                      {detection.class || 'Object'} {detection.id || `#${index + 1}`}
                    </div>
                    {detection.confidence !== undefined && (
                      <div className="detection-confidence">
                        {(detection.confidence * 100).toFixed(1)}%
                      </div>
                    )}
                  </div>
                  <div className="detection-details">
                    {videoRef.current && (
                      <>
                        <div>
                          Позиція: ({Math.round(normalizeBbox(detection.bbox)[0])}, {Math.round(normalizeBbox(detection.bbox)[1])})
                        </div>
                        <div>
                          Розмір: {Math.round(normalizeBbox(detection.bbox)[2])} × {Math.round(normalizeBbox(detection.bbox)[3])}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
