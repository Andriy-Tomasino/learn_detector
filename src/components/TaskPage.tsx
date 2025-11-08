import React, { useState, useRef, useEffect } from 'react';
import { FrameViewer } from './FrameViewer';
import { ObjectsList } from './ObjectsList';
import { DetectionPanel } from './DetectionPanel';
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
  const [screenLayout, setScreenLayout] = useState<{ screens: number } | null>(null);
  const [detections, setDetections] = useState<Array<{ screenNumber: number; numberOnScreen: number; id: string; status?: 'focused' | 'reject' | null }>>([
    // Приклад даних для тестування
    { screenNumber: 1, numberOnScreen: 1, id: 'det_001', status: null },
    { screenNumber: 1, numberOnScreen: 2, id: 'det_002', status: null },
    { screenNumber: 2, numberOnScreen: 1, id: 'det_003', status: null },
    { screenNumber: 2, numberOnScreen: 2, id: 'det_004', status: null },
  ]);

  // Завантаження розмітки екранів
  useEffect(() => {
    const layoutData = localStorage.getItem('screenLayout');
    if (layoutData) {
      try {
        const layout = JSON.parse(layoutData);
        setScreenLayout({ screens: layout.screens });
      } catch (error) {
        console.error('Error loading screen layout:', error);
      }
    }
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
        setAnnotations(projectToEdit.annotations);

        // Відновлюємо фрейми з проекту (якщо вони збережені)
        if (projectToEdit.frames && projectToEdit.frames.length > 0) {
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

  const handleStatusChange = (id: string, status: 'focused' | 'reject' | null) => {
    setDetections(prev => 
      prev.map(det => det.id === id ? { ...det, status } : det)
    );
  };

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
            />
          ) : (
            <div style={{ color: '#fff', textAlign: 'center' }}>
              Upload video or photo to get started
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
      <DetectionPanel
        detections={detections}
        onStatusChange={handleStatusChange}
      />
    </div>
  );
};

