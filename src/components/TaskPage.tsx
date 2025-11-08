import React, { useState, useRef, useEffect } from 'react';
import { FrameViewer } from './FrameViewer';
import { ObjectsList } from './ObjectsList';
import {
  saveCurrentTask,
  loadCurrentTask,
  createVideoId,
  type VideoProject,
  type Rectangle,
  type Task,
  type TaskCondition,
} from '../utils/storage';
import {
  saveFile,
  saveProjectToDB,
  loadFile,
  getProjectFile,
} from '../utils/database';
import { extractFramesFromVideo, loadImageAsFrame, type VideoFrame } from '../utils/videoUtils';
import { parseXmlAnnotations, type ParsedAnnotation } from '../utils/xmlParser';

type CreationMode = 'drag' | '2points' | '4points';

interface TaskPageProps {
  projectToEdit?: VideoProject | null;
  onEditComplete?: () => void;
}

export const TaskPage: React.FC<TaskPageProps> = ({ projectToEdit, onEditComplete }) => {
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [annotations, setAnnotations] = useState<{ frames: { [key: string]: Rectangle[] } }>({ frames: {} });
  const [creationMode, setCreationMode] = useState<CreationMode>('drag');
  const [selectedRectIndex, setSelectedRectIndex] = useState<number | null>(null);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentVideoInfo, setCurrentVideoInfo] = useState<{ fileName: string; fileSize: number; fileType: string } | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);
  const [screenLayout, setScreenLayout] = useState<{ screens: number; screenData?: any[] } | null>(null);
  const [xmlAnnotations, setXmlAnnotations] = useState<{ [screenNumber: number]: ParsedAnnotation }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Завантаження розмітки екранів, XML та фреймів
  useEffect(() => {
    const loadScreenData = async () => {
      const layoutData = localStorage.getItem('screenLayout');
      if (layoutData) {
        try {
          const layout = JSON.parse(layoutData);
          setScreenLayout(layout);

          // Завантажуємо XML та фрейми для кожного екрана
          const annotations: { [screenNumber: number]: ParsedAnnotation } = {};
          const loadedFrames: VideoFrame[] = [];
          let frameIndex = 0;

          for (let i = 0; i < layout.screens; i++) {
            const screenNumber = i + 1;
            const screenKey = `screen_${screenNumber}`;

            // Завантажуємо XML
            const xmlData = localStorage.getItem(`${screenKey}_xml`);
            if (xmlData) {
              try {
                const parsed = await parseXmlAnnotations(xmlData);
                annotations[screenNumber] = parsed;
              } catch (error) {
                console.error(`Error parsing XML for screen ${screenNumber}:`, error);
              }
            }

            // Фрейми тепер зберігаються в проєкті в IndexedDB, а не в localStorage
            // Завантажуємо тільки кількість для відображення інформації
            const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
            // Фрейми будуть завантажені з проєкту, якщо він відкритий
          }

          setXmlAnnotations(annotations);
          if (loadedFrames.length > 0) {
            setFrames(loadedFrames);
            setCurrentFrameIndex(0);
          }
        } catch (error) {
          console.error('Error loading screen layout:', error);
        }
      }
    };

    loadScreenData();
  }, []);

  // Завантаження проекту для редагування
  useEffect(() => {
    const loadProject = async () => {
      if (projectToEdit) {
        setCurrentVideoId(projectToEdit.id);
        setCurrentVideoInfo({
          fileName: projectToEdit.fileName,
          fileSize: projectToEdit.fileSize,
          fileType: projectToEdit.fileType,
        });
        // Завантажуємо screenLayout та XML анотації з localStorage
        const layoutData = localStorage.getItem('screenLayout');
        let finalAnnotations = projectToEdit.annotations || { frames: {} };
        
        if (layoutData) {
          try {
            const layout = JSON.parse(layoutData);
            setScreenLayout(layout);
            
            // Завантажуємо XML анотації для кожного екрана
            const xmlAnnotationsData: { [screenNumber: number]: ParsedAnnotation } = {};
            for (let i = 0; i < layout.screens; i++) {
              const screenNumber = i + 1;
              const screenKey = `screen_${screenNumber}`;
              const xmlData = localStorage.getItem(`${screenKey}_xml`);
              if (xmlData) {
                try {
                  const parsed = await parseXmlAnnotations(xmlData);
                  xmlAnnotationsData[screenNumber] = parsed;
                  console.log(`Завантажено XML анотації для екрана ${screenNumber}:`, parsed);
                } catch (error) {
                  console.error(`Помилка парсингу XML для екрана ${screenNumber}:`, error);
                }
              }
            }
            setXmlAnnotations(xmlAnnotationsData);
            console.log('XML анотації завантажено:', xmlAnnotationsData);
            
            // Конвертуємо XML анотації в формат annotations для відображення в ObjectsList
            const convertedAnnotations: { frames: { [key: string]: Rectangle[] } } = { frames: {} };
            
            // Об'єднуємо анотації з проєкту та XML
            const baseAnnotations = projectToEdit.annotations || { frames: {} };
            
            // Конвертуємо XML анотації для кожного екрана
            Object.entries(xmlAnnotationsData).forEach(([screenNumStr, xmlAnnotation]) => {
              const screenNumber = parseInt(screenNumStr);
              
              // Визначаємо початковий індекс фреймів для цього екрана
              let startFrameIndex = 0;
              if (screenNumber > 1) {
                for (let i = 1; i < screenNumber; i++) {
                  const screenKey = `screen_${i}`;
                  const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
                  startFrameIndex += framesCount;
                }
              }
              
              // Знаходимо offset (мінімальний індекс фрейму в XML)
              const xmlFrameKeys = Object.keys(xmlAnnotation.frames);
              const numericXmlKeys = xmlFrameKeys.map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
              const frameOffset = numericXmlKeys.length > 0 ? numericXmlKeys[0] : 0;
              
              console.log(`Екран ${screenNumber}: XML frame offset = ${frameOffset}, startFrameIndex = ${startFrameIndex}`);
              
              // Конвертуємо XML бокси в Rectangle формат
              Object.entries(xmlAnnotation.frames).forEach(([frameKey, boxes]) => {
                const xmlFrameIndex = parseInt(frameKey);
                // Віднімаємо offset, щоб отримати локальний індекс (0-based)
                const localFrameIndex = xmlFrameIndex - frameOffset;
                const globalFrameIndex = startFrameIndex + localFrameIndex;
                const frameKeyStr = globalFrameIndex.toString();
                
                console.log(`Конвертація: екран ${screenNumber}, XML індекс ${xmlFrameIndex}, локальний ${localFrameIndex}, глобальний ${globalFrameIndex}, боксів: ${(boxes as any[]).length}`);
                
                // Конвертуємо BoundingBox в Rectangle
                const rectangles: Rectangle[] = (boxes as any[]).map((box: any) => ({
                  x: box.x,
                  y: box.y,
                  w: box.width,
                  h: box.height,
                }));
                
                console.log(`Створено ${rectangles.length} rectangles для фрейму ${frameKeyStr}:`, rectangles.slice(0, 2));
                
                // Об'єднуємо з існуючими анотаціями
                if (convertedAnnotations.frames[frameKeyStr]) {
                  convertedAnnotations.frames[frameKeyStr] = [
                    ...convertedAnnotations.frames[frameKeyStr],
                    ...rectangles
                  ];
                } else {
                  convertedAnnotations.frames[frameKeyStr] = rectangles;
                }
              });
            });
            
            // Об'єднуємо з базовими анотаціями з проєкту
            Object.entries(baseAnnotations.frames).forEach(([frameKey, rects]) => {
              if (convertedAnnotations.frames[frameKey]) {
                convertedAnnotations.frames[frameKey] = [
                  ...convertedAnnotations.frames[frameKey],
                  ...rects
                ];
              } else {
                convertedAnnotations.frames[frameKey] = rects;
              }
            });
            
            finalAnnotations = convertedAnnotations;
            console.log('Конвертовано XML анотації в annotations:', convertedAnnotations);
            console.log('Приклад анотацій для перших фреймів:', {
              frame0: convertedAnnotations.frames['0'],
              frame1: convertedAnnotations.frames['1'],
              frame2: convertedAnnotations.frames['2'],
              frame3: convertedAnnotations.frames['3'],
              allFrameKeys: Object.keys(convertedAnnotations.frames).slice(0, 20),
              totalFramesWithAnnotations: Object.keys(convertedAnnotations.frames).length
            });
            
            // Перевіряємо, чи є анотації для фрейму 3
            if (convertedAnnotations.frames['3']) {
              console.log('✅ Анотації для фрейму 3 знайдено:', convertedAnnotations.frames['3']);
            } else {
              console.warn('❌ Анотації для фрейму 3 НЕ знайдено!');
              console.log('Доступні ключі:', Object.keys(convertedAnnotations.frames));
            }
          } catch (error) {
            console.error('Помилка завантаження layout:', error);
          }
        }
        
        // Встановлюємо фінальні анотації (з XML або без)
        setAnnotations(finalAnnotations);

        // Відновлюємо фрейми з проекту (якщо вони збережені)
        if (projectToEdit.frames && projectToEdit.frames.length > 0) {
          console.log(`Завантаження ${projectToEdit.frames.length} фреймів з проєкту`);
          const restoredFrames: VideoFrame[] = projectToEdit.frames.map((imageData, index) => ({
            index,
            imageData,
          }));
          setFrames(restoredFrames);
          setCurrentFrameIndex(0);
        } else {
          // Спробуємо завантажити файл з БД
          try {
            const file = await getProjectFile(projectToEdit.id);
            if (file) {
              // Якщо файл знайдено, обробляємо його
              let extractedFrames: VideoFrame[] = [];
              if (file.type.startsWith('video/')) {
                extractedFrames = await extractFramesFromVideo(file, 1);
              } else if (file.type.startsWith('image/')) {
                extractedFrames = [await loadImageAsFrame(file)];
              }
              const indexedFrames = extractedFrames.map((frame, idx) => ({
                ...frame,
                index: idx,
              }));
              setFrames(indexedFrames);
              setCurrentFrameIndex(0);
            } else {
              alert(`To edit project "${projectToEdit.fileName}", please upload the file again.`);
            }
          } catch (error) {
            console.error('Error loading file from database:', error);
            alert(`To edit project "${projectToEdit.fileName}", please upload the file again.`);
          }
        }

        // Зберігаємо як поточне завдання
        saveCurrentTask(projectToEdit.id, projectToEdit.annotations, projectToEdit.taskId);
        setCurrentTaskId(projectToEdit.taskId || null);
      } else {
        // Завантажуємо збережене завдання
        const loaded = loadCurrentTask();
        if (loaded.videoId && loaded.annotations) {
          setCurrentVideoId(loaded.videoId);
          setAnnotations(loaded.annotations);
          setCurrentTaskId(loaded.taskId);
        }
      }
    };

    loadProject();
  }, [projectToEdit]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Якщо це перший файл, створюємо новий проект
      let videoId = currentVideoId;
      if (!videoId) {
        videoId = createVideoId(file.name, file.size);
        setCurrentVideoId(videoId);
        setCurrentVideoInfo({
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        });
      }

      // Зберігаємо файл в БД
      const fileId = await saveFile(file);

      let extractedFrames: VideoFrame[] = [];
      if (file.type.startsWith('video/')) {
        extractedFrames = await extractFramesFromVideo(file, 1);
      } else if (file.type.startsWith('image/')) {
        extractedFrames = [await loadImageAsFrame(file)];
      } else {
        alert('Unsupported file format. Please select a video or image.');
        return;
      }

      // Якщо це перший файл, завантажуємо анотації та таску
      let loadedAnnotations = null;
      let loadedTaskId = currentTaskId;
      if (frames.length === 0) {
        const loaded = loadCurrentTask();
        if (loaded.videoId === videoId && loaded.annotations) {
          loadedAnnotations = loaded.annotations;
          setAnnotations(loaded.annotations);
        }
        if (loaded.taskId) {
          loadedTaskId = loaded.taskId;
          setCurrentTaskId(loaded.taskId);
        }
        setCurrentFrameIndex(0);
      }

      // Додаємо нові фрейми до існуючих
      // Використовуємо функціональне оновлення для правильного обчислення startIndex
      setFrames((prevFrames) => {
        const startIndex = prevFrames.length;
        const newFrames = extractedFrames.map((frame, idx) => ({
          ...frame,
          index: startIndex + idx,
        }));
        
        // Використовуємо завантажені анотації або поточні
        setAnnotations((prevAnnotations) => {
          const baseAnnotations = loadedAnnotations || prevAnnotations;
          const updatedAnnotations = { ...baseAnnotations };
          
          // Додаємо порожні анотації для нових фреймів (якщо їх ще немає)
          newFrames.forEach((_, idx) => {
            const frameKey = (startIndex + idx).toString();
            if (!updatedAnnotations.frames[frameKey]) {
              updatedAnnotations.frames[frameKey] = [];
            }
          });
          
          // Зберігаємо поточне завдання з taskId
          if (videoId) {
            saveCurrentTask(videoId, updatedAnnotations, loadedTaskId);
          }
          
          return updatedAnnotations;
        });
        
        return [...prevFrames, ...newFrames];
      });

      // Зберігаємо fileId для майбутнього використання
      (window as any).currentFileId = fileId;
      
      // Очищаємо input для можливості повторного вибору того ж файлу
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      console.error('Error processing file:', error);
      alert('Error processing file. Please check the file format.');
    }
  };


  const handleRectanglesChange = (rectangles: Rectangle[]) => {
    const frameKey = currentFrameIndex.toString();
    const newAnnotations = {
      ...annotations,
      frames: {
        ...annotations.frames,
        [frameKey]: rectangles,
      },
    };
    setAnnotations(newAnnotations);

    if (currentVideoId) {
      saveCurrentTask(currentVideoId, newAnnotations, currentTaskId);
    }

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

  const handleSave = async () => {
    if (!currentVideoId || !currentVideoInfo) {
      return;
    }

    try {
      // Зберігаємо всі фрейми для можливості відновлення
      // Використовуємо актуальний стан frames
      const framesData = frames.map((frame) => frame.imageData);

      const project: VideoProject = {
        id: currentVideoId,
        taskId: currentTaskId || undefined,
        fileName: currentVideoInfo.fileName,
        fileSize: currentVideoInfo.fileSize,
        fileType: currentVideoInfo.fileType,
        createdAt: projectToEdit?.createdAt || Date.now(),
        updatedAt: Date.now(),
        annotations,
        frames: framesData,
      };

      // Отримуємо fileId або зберігаємо файл
      let fileId = (window as any).currentFileId;
      if (!fileId && fileInputRef.current?.files?.[0]) {
        fileId = await saveFile(fileInputRef.current.files[0]);
        (window as any).currentFileId = fileId;
      }

      // Зберігаємо проект в БД
      await saveProjectToDB(project, fileId);
      
      // Оновлюємо поточне завдання
      saveCurrentTask(currentVideoId, annotations, currentTaskId);
      
      if (onEditComplete) {
        onEditComplete();
      }
    } catch (error) {
      console.error('Error saving project:', error);
    }
  };

  const handleCreateTask = (name: string, conditions: TaskCondition[]) => {
    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      conditions,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    // Зберігаємо таску в localStorage
    const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
    tasks.push(task);
    localStorage.setItem('tasks', JSON.stringify(tasks));
    
    setCurrentTaskId(task.id);
    
    // Зберігаємо taskId в поточному завданні
    if (currentVideoId) {
      saveCurrentTask(currentVideoId, annotations, task.id);
    }
  };

  const currentFrame = frames[currentFrameIndex];
  const currentRectangles = annotations.frames[currentFrameIndex.toString()] || [];
  
  // Логування для діагностики
  useEffect(() => {
    if (currentFrameIndex >= 0 && frames.length > 0) {
      const frameKey = currentFrameIndex.toString();
      const frameAnnotations = annotations.frames[frameKey];
      console.log(`=== ДІАГНОСТИКА ФРЕЙМУ ${currentFrameIndex} ===`);
      console.log(`Frame key: "${frameKey}"`);
      console.log(`Rectangles для цього фрейму:`, frameAnnotations);
      console.log(`Кількість rectangles:`, frameAnnotations?.length || 0);
      console.log(`Всі доступні frame keys в annotations:`, Object.keys(annotations.frames));
      console.log(`Перші 5 frame keys з даними:`, Object.keys(annotations.frames).slice(0, 5).map(key => ({
        key,
        count: annotations.frames[key]?.length || 0
      })));
      console.log(`Всього frames з анотаціями:`, Object.keys(annotations.frames).length);
    }
  }, [currentFrameIndex, annotations, frames.length]);

  // Управління відтворенням фреймів
  const handlePlay = () => {
    if (frames.length === 0) return;
    
    setIsPlaying(true);
    playIntervalRef.current = setInterval(() => {
      setCurrentFrameIndex((prev) => {
        if (prev >= frames.length - 1) {
          setIsPlaying(false);
          if (playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
          }
          return prev;
        }
        return prev + 1;
      });
    }, 200); // 200ms між фреймами (5 FPS)
  };

  const handleStop = () => {
    setIsPlaying(false);
    if (playIntervalRef.current) {
      clearInterval(playIntervalRef.current);
      playIntervalRef.current = null;
    }
  };

  const handlePreviousFrame = () => {
    if (currentFrameIndex > 0) {
      setCurrentFrameIndex(currentFrameIndex - 1);
    }
  };

  const handleNextFrame = () => {
    if (currentFrameIndex < frames.length - 1) {
      setCurrentFrameIndex(currentFrameIndex + 1);
    }
  };

  // Очищення інтервалу при розмонтуванні
  useEffect(() => {
    return () => {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="task-page">
      <div className="main-area">
        <div className="canvas-wrapper" style={{ position: 'relative' }}>
          <button
            onClick={() => setIsDetecting(!isDetecting)}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              padding: '12px 24px',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              backgroundColor: isDetecting ? '#f44336' : '#4caf50',
              color: '#ffffff',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              transition: 'all 0.3s ease',
              zIndex: 10,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-2px)';
              e.currentTarget.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
            }}
          >
            {isDetecting ? 'Stop Detecting' : 'Detecting'}
          </button>
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
              isDetecting={isDetecting}
              screenLayout={screenLayout}
              xmlAnnotations={xmlAnnotations}
              currentScreenNumber={1}
            />
          ) : (
            <div style={{ color: '#fff', textAlign: 'center' }}>
              Upload video or photo to get started
            </div>
          )}
          
          {/* Кнопки управління плейером */}
          {currentFrame && frames.length > 0 && (
            <div style={{
              position: 'absolute',
              bottom: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              gap: '10px',
              alignItems: 'center',
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              padding: '10px 20px',
              borderRadius: '8px',
              zIndex: 10,
            }}>
              <button
                onClick={handlePreviousFrame}
                disabled={currentFrameIndex === 0}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: currentFrameIndex === 0 ? 'not-allowed' : 'pointer',
                  backgroundColor: currentFrameIndex === 0 ? '#666' : '#2196f3',
                  color: '#ffffff',
                  opacity: currentFrameIndex === 0 ? 0.5 : 1,
                }}
              >
                ◀ Попередній
              </button>
              
              {!isPlaying ? (
                <button
                  onClick={handlePlay}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    backgroundColor: '#4caf50',
                    color: '#ffffff',
                  }}
                >
                  ▶ Відтворити
                </button>
              ) : (
                <button
                  onClick={handleStop}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    backgroundColor: '#f44336',
                    color: '#ffffff',
                  }}
                >
                  ⏹ Стоп
                </button>
              )}
              
              <button
                onClick={handleNextFrame}
                disabled={currentFrameIndex >= frames.length - 1}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: currentFrameIndex >= frames.length - 1 ? 'not-allowed' : 'pointer',
                  backgroundColor: currentFrameIndex >= frames.length - 1 ? '#666' : '#2196f3',
                  color: '#ffffff',
                  opacity: currentFrameIndex >= frames.length - 1 ? 0.5 : 1,
                }}
              >
                Наступний ▶
              </button>
              
              <div style={{
                marginLeft: '15px',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '500',
              }}>
                {currentFrameIndex + 1} / {frames.length}
              </div>
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
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        onChange={handleFileUpload}
        style={{ display: 'none' }}
      />
    </div>
  );
};

