import { useState, useRef, useEffect } from 'react';
import { FrameViewer } from './components/FrameViewer';
import { ObjectsList } from './components/ObjectsList';
import {
  loadAnnotations,
  saveAnnotations,
  exportAnnotations,
  type Annotations,
  type Rectangle,
} from './utils/storage';
import { extractFramesFromVideo, loadImageAsFrame, type VideoFrame } from './utils/videoUtils';
import './styles/index.css';

type CreationMode = 'drag' | '2points' | '4points';

function App() {
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [annotations, setAnnotations] = useState<Annotations>({ frames: {} });
  const [creationMode, setCreationMode] = useState<CreationMode>('drag');
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const loaded = loadAnnotations();
    setAnnotations(loaded);
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Перевіряємо тип файлу
      if (file.type.startsWith('video/')) {
        // Обробка відео
        const extractedFrames = await extractFramesFromVideo(file, 1); // 1 fps
        setFrames(extractedFrames);
      } else if (file.type.startsWith('image/')) {
        // Обробка зображення
        const imageFrame = await loadImageAsFrame(file);
        setFrames([imageFrame]);
      } else {
        alert('Непідтримуваний формат файлу. Будь ласка, виберіть відео або зображення.');
        return;
      }
      
      setCurrentFrameIndex(0);
      
      // Завантажуємо анотації для нових фреймів
      const loaded = loadAnnotations();
      setAnnotations(loaded);
    } catch (error) {
      console.error('Помилка обробки файлу:', error);
      alert('Помилка обробки файлу. Перевірте формат файлу.');
    }
  };

  const handlePreviousFrame = () => {
    if (currentFrameIndex > 0) {
      setCurrentFrameIndex(currentFrameIndex - 1);
      setSelectedRectIndex(null);
    }
  };

  const handleNextFrame = () => {
    if (currentFrameIndex < frames.length - 1) {
      setCurrentFrameIndex(currentFrameIndex + 1);
      setSelectedRectIndex(null);
    }
  };

  const handleRectanglesChange = (rectangles: Rectangle[]) => {
    const frameKey = currentFrameIndex.toString();
    const newAnnotations: Annotations = {
      ...annotations,
      frames: {
        ...annotations.frames,
        [frameKey]: rectangles,
      },
    };
    setAnnotations(newAnnotations);
    saveAnnotations(newAnnotations);
    
    // Скидаємо вибір якщо об'єкт був видалений
    if (selectedRectIndex !== null && selectedRectIndex >= rectangles.length) {
      setSelectedRectIndex(null);
    }
  };

  const handleRectSelect = (index: number) => {
    setSelectedRectIndex(index);
  };

  const handleRectDelete = (index: number) => {
    const newRectangles = currentRectangles.filter((_, i) => i !== index);
    handleRectanglesChange(newRectangles);
    if (selectedRectIndex === index) {
      setSelectedRectIndex(null);
    } else if (selectedRectIndex !== null && selectedRectIndex > index) {
      setSelectedRectIndex(selectedRectIndex - 1);
    }
  };

  const handleExport = () => {
    exportAnnotations(annotations);
  };

  const currentFrame = frames[currentFrameIndex];
  const currentRectangles = annotations.frames[currentFrameIndex.toString()] || [];

  return (
    <div id="root">
      <div className="top-panel">
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*,image/*"
          onChange={handleFileUpload}
          style={{ display: 'none' }}
        />
        <button onClick={() => fileInputRef.current?.click()}>
          Завантажити відео/фото
        </button>
        <button onClick={handleExport} disabled={frames.length === 0}>
          Експорт JSON
        </button>
        <div className="creation-mode-panel">
          <span>Режим створення:</span>
          <button
            className={creationMode === 'drag' ? 'active' : ''}
            onClick={() => setCreationMode('drag')}
            disabled={frames.length === 0}
          >
            Drag
          </button>
          <button
            className={creationMode === '2points' ? 'active' : ''}
            onClick={() => setCreationMode('2points')}
            disabled={frames.length === 0}
          >
            2 точки
          </button>
          <button
            className={creationMode === '4points' ? 'active' : ''}
            onClick={() => setCreationMode('4points')}
            disabled={frames.length === 0}
          >
            4 точки
          </button>
        </div>
      </div>

      <div className="main-area">
        <div className="canvas-wrapper">
          {currentFrame ? (
            <FrameViewer
              frameImage={currentFrame.imageData}
              frameIndex={currentFrameIndex}
              totalFrames={frames.length}
              rectangles={currentRectangles}
              onRectanglesChange={handleRectanglesChange}
              creationMode={creationMode}
              onCreationModeChange={setCreationMode}
              selectedRectIndex={selectedRectIndex}
              onRectSelect={setSelectedRectIndex}
            />
          ) : (
            <div style={{ color: '#fff', textAlign: 'center' }}>
              Завантажте відео або фото для початку роботи
            </div>
          )}
        </div>
        {currentFrame && (
          <ObjectsList
            rectangles={currentRectangles}
            selectedIndex={selectedRectIndex}
            onSelect={handleRectSelect}
            onDelete={handleRectDelete}
          />
        )}
      </div>

      <div className="bottom-panel">
        <button
          onClick={handlePreviousFrame}
          disabled={currentFrameIndex === 0 || frames.length === 0}
        >
          &lt;
        </button>
        <div className="frame-info">
          Frame: {frames.length > 0 ? `${currentFrameIndex + 1}/${frames.length}` : '0/0'}
        </div>
        <button
          onClick={handleNextFrame}
          disabled={currentFrameIndex >= frames.length - 1 || frames.length === 0}
        >
          &gt;
        </button>
      </div>
    </div>
  );
}

export default App;

