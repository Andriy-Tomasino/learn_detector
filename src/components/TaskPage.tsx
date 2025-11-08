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
  type ObjectStatus,
  type TaskCondition,
} from '../utils/storage';
import {
  saveFile,
  saveProjectToDB,
  loadFile,
  getProjectFile,
  loadAllProjectsFromDB,
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
  const [screenProjects, setScreenProjects] = useState<{ [screenNumber: number]: VideoProject }>({});
  const [screenFrames, setScreenFrames] = useState<{ [screenNumber: number]: VideoFrame[] }>({});
  const [screenFrameIndices, setScreenFrameIndices] = useState<{ [screenNumber: number]: number }>({});
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

          // Завантажуємо всі проекти з IndexedDB
          const allProjects = await loadAllProjectsFromDB();
          console.log('Завантажено проектів з БД:', allProjects.length);
          console.log('screenLayout.screens:', layout.screens);
          
          // Завантажуємо XML та фрейми для кожного екрана
          const annotations: { [screenNumber: number]: ParsedAnnotation } = {};
          const projects: { [screenNumber: number]: VideoProject } = {};
          const frames: { [screenNumber: number]: VideoFrame[] } = {};
          const frameIndices: { [screenNumber: number]: number } = {};

          // Завантажуємо проекти для кожного екрана
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

            // Знаходимо проект для цього екрана за назвою
            const screenProject = allProjects.find(project => {
              const screenMatch = project.fileName.match(/Screen_(\d+)_/);
              return screenMatch && parseInt(screenMatch[1]) === screenNumber;
            });

            console.log(`Екран ${screenNumber}:`, screenProject ? `Знайдено проект: ${screenProject.fileName}` : 'Проект не знайдено');

            // Завантажуємо фрейми з проекту
            if (screenProject) {
              projects[screenNumber] = screenProject;
              if (screenProject.frames) {
                const screenFramesList: VideoFrame[] = [];
                for (let j = 0; j < screenProject.frames.length; j++) {
                  screenFramesList.push({
                    index: j,
                    imageData: screenProject.frames[j],
                  });
                }
                frames[screenNumber] = screenFramesList;
                frameIndices[screenNumber] = 0;
                console.log(`Екран ${screenNumber}: завантажено ${screenFramesList.length} фреймів`);
                
                // Діагностика анотацій
                if (screenProject.annotations && screenProject.annotations.frames) {
                  const annotationKeys = Object.keys(screenProject.annotations.frames);
                  console.log(`Екран ${screenNumber}: анотації з ключами:`, annotationKeys.slice(0, 10), `... (всього ${annotationKeys.length})`);
                }
              }
            }
          }
          
          console.log('Завантажені проекти:', Object.keys(projects));
          console.log('Завантажені фрейми:', Object.keys(frames));

          setXmlAnnotations(annotations);
          setScreenProjects(projects);
          setScreenFrames(frames);
          setScreenFrameIndices(frameIndices);
          
          // Встановлюємо перший екран як активний для зворотної сумісності
          if (Object.keys(frames).length > 0) {
            const firstScreen = Object.keys(frames)[0];
            const firstScreenNumber = parseInt(firstScreen);
            if (frames[firstScreenNumber] && frames[firstScreenNumber].length > 0) {
              setFrames(frames[firstScreenNumber]);
              setCurrentFrameIndex(0);
            }
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
                // Зберігаємо оригінальні значення для можливості відкату змін
                const rectangles: Rectangle[] = (boxes as any[]).map((box: any) => ({
                  x: box.x,
                  y: box.y,
                  w: box.width,
                  h: box.height,
                  originalX: box.x, // Зберігаємо оригінальні координати
                  originalY: box.y,
                  originalW: box.width,
                  originalH: box.height,
                  status: 'hold' as const, // За замовчуванням hold
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
    // Зберігаємо статуси та оригінальні значення при оновленні rectangles
    const updatedRectangles = rectangles.map((rect, index) => {
      // Зберігаємо статус та оригінальні значення з попередніх rectangles, якщо вони є
      const prevRect = annotations.frames[frameKey]?.[index];
      return {
        ...rect,
        status: rect.status !== undefined ? rect.status : (prevRect?.status || 'hold'),
        // Зберігаємо оригінальні значення, якщо вони вже є
        originalX: prevRect?.originalX !== undefined ? prevRect.originalX : (rect.originalX !== undefined ? rect.originalX : rect.x),
        originalY: prevRect?.originalY !== undefined ? prevRect.originalY : (rect.originalY !== undefined ? rect.originalY : rect.y),
        originalW: prevRect?.originalW !== undefined ? prevRect.originalW : (rect.originalW !== undefined ? rect.originalW : rect.w),
        originalH: prevRect?.originalH !== undefined ? prevRect.originalH : (rect.originalH !== undefined ? rect.originalH : rect.h),
      };
    });
    
    const newAnnotations = {
      ...annotations,
      frames: {
        ...annotations.frames,
        [frameKey]: updatedRectangles,
      },
    };
    setAnnotations(newAnnotations);

    if (currentVideoId) {
      saveCurrentTask(currentVideoId, newAnnotations, currentTaskId);
    }

    if (selectedRectIndex !== null && selectedRectIndex >= updatedRectangles.length) {
      setSelectedRectIndex(null);
    }
  };

  const handleRectSelect = (index: number) => {
    // Індекс об'єкта в списку ObjectsList (всі об'єкти залишаються в списку)
    setSelectedRectIndex(index);
  };

  /**
   * Механіка режимів об'єктів:
   * 
   * 1. REJECT - приховує розмітку об'єкта:
   *    - Об'єкт залишається в ObjectsList, але не малюється на canvas
   *    - Статус застосовується до всіх фреймів, де присутній об'єкт
   *    - Використовується для тимчасового приховування об'єкта без видалення
   * 
   * 2. ATTACK - виділяє об'єкт як ціль для атаки:
   *    - Кордони боксу малюються червоним кольором (товщина 3px)
   *    - Всередині боксу малюється перехрестя (діагональні лінії)
   *    - Ручки для зміни розміру не відображаються
   *    - Об'єкт НЕ можна переміщувати або змінювати розмір
   *    - Статус застосовується до всіх фреймів, де присутній об'єкт
   *    - Колір завжди червоний, навіть якщо об'єкт вибраний
   * 
   * 3. HOLD - режим відкату змін:
   *    - Кордони боксу малюються зеленим кольором (товщина 2px)
   *    - Ручки для зміни розміру НЕ відображаються
   *    - Об'єкт НЕ можна переміщувати або змінювати розмір
   *    - При натисканні hold відкатує зміни, повертаючи об'єкт до оригінальних координат та розмірів
   *    - Статус застосовується до всіх фреймів, де присутній об'єкт
   *    - Навіть якщо об'єкт вибраний, колір залишається зеленим (без синіх рамок)
   * 
   * Всі статуси працюють як перемикачі - тільки один може бути активним одночасно.
   * При повторному натисканні на активну кнопку (крім hold) статус скидається до hold.
   */
  const handleStatusChange = (index: number, status: ObjectStatus) => {
    // Отримуємо інформацію про екран для цього rectangle
    const screenRect = allScreenRectangles[index];
    if (!screenRect) return;
    
    const { screenNumber, localIndex } = screenRect;
    const screenProject = screenProjects[screenNumber];
    if (!screenProject) return;
    
    const screenAnnotations = screenProject.annotations || { frames: {} };
    
    // Знаходимо мінімальний ключ в анотаціях для цього екрана (offset)
    const annotationKeys = Object.keys(screenAnnotations.frames);
    let annotationOffset = 0;
    if (annotationKeys.length > 0) {
      const numericKeys = annotationKeys.map(k => parseInt(k)).filter(k => !isNaN(k));
      if (numericKeys.length > 0) {
        annotationOffset = Math.min(...numericKeys);
      }
    }
    
    // Обчислюємо глобальний індекс фрейму
    const screenFrameIndex = screenFrameIndices[screenNumber] || 0;
    const globalFrameIndex = annotationOffset + screenFrameIndex;
    
    // Отримуємо rectangles для цього екрана та фрейму
    let screenRects = screenAnnotations.frames[globalFrameIndex.toString()] || [];
    
    // Якщо не знайдено, спробуємо знайти найближчий ключ
    if (screenRects.length === 0 && annotationKeys.length > 0) {
      const numericKeys = annotationKeys.map(k => parseInt(k)).filter(k => !isNaN(k));
      if (numericKeys.length > 0) {
        const closestKey = numericKeys.reduce((prev, curr) => 
          Math.abs(curr - globalFrameIndex) < Math.abs(prev - globalFrameIndex) ? curr : prev
        );
        if (Math.abs(closestKey - globalFrameIndex) <= 5) {
          screenRects = screenAnnotations.frames[closestKey.toString()] || [];
        }
      }
    }
    
    if (localIndex >= screenRects.length) return;
    
    const newRectangles = [...screenRects];
    const currentRect = newRectangles[localIndex];
    
    if (status === 'hold') {
      // При натисканні hold - відкатуємо зміни до оригінальних значень
      if (currentRect.originalX !== undefined && currentRect.originalY !== undefined &&
          currentRect.originalW !== undefined && currentRect.originalH !== undefined) {
        // Відкатуємо до оригінальних координат та розмірів
        newRectangles[localIndex] = {
          ...currentRect,
          x: currentRect.originalX,
          y: currentRect.originalY,
          w: currentRect.originalW,
          h: currentRect.originalH,
          status: 'hold',
        };
      } else {
        // Якщо оригінальних значень немає, зберігаємо поточні як оригінальні
        newRectangles[localIndex] = {
          ...currentRect,
          originalX: currentRect.x,
          originalY: currentRect.y,
          originalW: currentRect.w,
          originalH: currentRect.h,
          status: 'hold',
        };
      }
    } else {
      // Для інших статусів зберігаємо оригінальні значення, якщо їх ще немає
      if (currentRect.originalX === undefined) {
        newRectangles[localIndex] = {
          ...currentRect,
          originalX: currentRect.x,
          originalY: currentRect.y,
          originalW: currentRect.w,
          originalH: currentRect.h,
          status,
        };
      } else {
        newRectangles[localIndex] = { ...currentRect, status };
      }
    }
    
    // Оновлюємо анотації для цього екрана
    const updatedScreenAnnotations = { ...screenAnnotations };
    
    // Застосовуємо статус до всіх фреймів, де присутній об'єкт з таким самим локальним індексом
    Object.keys(updatedScreenAnnotations.frames).forEach((frameKey) => {
      const frameRectangles = updatedScreenAnnotations.frames[frameKey];
      if (frameRectangles && frameRectangles.length > localIndex) {
        const updatedRectangles = [...frameRectangles];
        const frameRect = updatedRectangles[localIndex];
        
        if (status === 'hold') {
          // Відкатуємо зміни для всіх фреймів
          if (frameRect.originalX !== undefined && frameRect.originalY !== undefined &&
              frameRect.originalW !== undefined && frameRect.originalH !== undefined) {
            updatedRectangles[localIndex] = {
              ...frameRect,
              x: frameRect.originalX,
              y: frameRect.originalY,
              w: frameRect.originalW,
              h: frameRect.originalH,
              status: 'hold',
            };
          } else {
            // Якщо оригінальних значень немає, зберігаємо поточні як оригінальні
            updatedRectangles[localIndex] = {
              ...frameRect,
              originalX: frameRect.x,
              originalY: frameRect.y,
              originalW: frameRect.w,
              originalH: frameRect.h,
              status: 'hold',
            };
          }
        } else {
          // Для інших статусів зберігаємо оригінальні значення, якщо їх ще немає
          if (frameRect.originalX === undefined) {
            updatedRectangles[localIndex] = {
              ...frameRect,
              originalX: frameRect.x,
              originalY: frameRect.y,
              originalW: frameRect.w,
              originalH: frameRect.h,
              status,
            };
          } else {
            updatedRectangles[localIndex] = { ...frameRect, status };
          }
        }
        
        updatedScreenAnnotations.frames[frameKey] = updatedRectangles;
      }
    });
    
    // Оновлюємо проект
    const updatedProject = {
      ...screenProject,
      annotations: updatedScreenAnnotations,
    };
    
    // Оновлюємо стан
    setScreenProjects({
      ...screenProjects,
      [screenNumber]: updatedProject,
    });
    
    // Зберігаємо зміни в БД
    saveProjectToDB(updatedProject).catch(error => {
      console.error(`Помилка збереження проекту для екрана ${screenNumber}:`, error);
    });
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
  
  // Збираємо rectangles з усіх екранів для поточного фрейму
  const allScreenRectangles: Array<{ rectangle: Rectangle; screenNumber: number; localIndex: number }> = [];
  
  if (screenLayout && screenLayout.screens > 0) {
    for (let screenNum = 1; screenNum <= screenLayout.screens; screenNum++) {
      const screenFramesList = screenFrames[screenNum] || [];
      const screenFrameIndex = screenFrameIndices[screenNum] || 0;
      const screenProject = screenProjects[screenNum];
      const screenAnnotations = screenProject?.annotations || { frames: {} };
      
      // Знаходимо мінімальний ключ в анотаціях для цього екрана (offset)
      const annotationKeys = Object.keys(screenAnnotations.frames);
      let annotationOffset = 0;
      if (annotationKeys.length > 0) {
        const numericKeys = annotationKeys.map(k => parseInt(k)).filter(k => !isNaN(k));
        if (numericKeys.length > 0) {
          annotationOffset = Math.min(...numericKeys);
        }
      }
      
      // Обчислюємо глобальний індекс фрейму: offset + локальний індекс
      const globalFrameIndex = annotationOffset + screenFrameIndex;
      
      // Отримуємо rectangles для цього екрана
      let screenRects = screenAnnotations.frames[globalFrameIndex.toString()] || [];
      
      // Якщо не знайдено, спробуємо знайти найближчий ключ
      if (screenRects.length === 0 && annotationKeys.length > 0) {
        const numericKeys = annotationKeys.map(k => parseInt(k)).filter(k => !isNaN(k));
        if (numericKeys.length > 0) {
          const closestKey = numericKeys.reduce((prev, curr) => 
            Math.abs(curr - globalFrameIndex) < Math.abs(prev - globalFrameIndex) ? curr : prev
          );
          if (Math.abs(closestKey - globalFrameIndex) <= 5) {
            screenRects = screenAnnotations.frames[closestKey.toString()] || [];
          }
        }
      }
      
      // Додаємо rectangles з інформацією про екран
      screenRects.forEach((rect, localIndex) => {
        allScreenRectangles.push({
          rectangle: rect,
          screenNumber: screenNum,
          localIndex: localIndex,
        });
      });
    }
  }
  
  // Для зворотної сумісності зі старим кодом
  const allRectangles = annotations.frames[currentFrameIndex.toString()] || [];
  const currentRectangles = allScreenRectangles.map(item => item.rectangle);
  
  // Визначаємо номер екрана для поточного фрейму
  const getCurrentScreenNumber = (): number => {
    if (!screenLayout || screenLayout.screens === 1) {
      return 1;
    }
    
    const framesPerScreen: number[] = [];
    for (let i = 1; i <= screenLayout.screens; i++) {
      const screenKey = `screen_${i}`;
      const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
      framesPerScreen.push(framesCount);
    }
    
    let accumulatedFrames = 0;
    for (let i = 0; i < framesPerScreen.length; i++) {
      if (currentFrameIndex < accumulatedFrames + framesPerScreen[i]) {
        return i + 1;
      }
      accumulatedFrames += framesPerScreen[i];
    }
    
    return 1;
  };
  
  const currentScreenNumber = getCurrentScreenNumber();
  
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

  // Знаходимо мінімальну кількість фреймів серед усіх екранів
  const getMinFramesCount = (): number => {
    const counts = Object.values(screenFrames).map(frames => frames.length);
    return counts.length > 0 ? Math.min(...counts) : 0;
  };

  // Перевіряємо, чи всі екрани на максимальному фреймі
  const areAllScreensAtMaxFrame = (): boolean => {
    if (Object.keys(screenFrames).length === 0) return true;
    return Object.keys(screenFrames).every(screenNumStr => {
      const screenNum = parseInt(screenNumStr);
      const framesCount = screenFrames[screenNum].length;
      const currentIndex = screenFrameIndices[screenNum] || 0;
      return currentIndex >= framesCount - 1;
    });
  };

  // Перевіряємо, чи всі екрани на початковому фреймі
  const areAllScreensAtStartFrame = (): boolean => {
    if (Object.keys(screenFrames).length === 0) return true;
    return Object.keys(screenFrames).every(screenNumStr => {
      const screenNum = parseInt(screenNumStr);
      const currentIndex = screenFrameIndices[screenNum] || 0;
      return currentIndex === 0;
    });
  };

  // Управління відтворенням фреймів для всіх екранів одночасно
  const handlePlay = () => {
    const minFrames = getMinFramesCount();
    if (minFrames === 0) return;
    
    setIsPlaying(true);
    playIntervalRef.current = setInterval(() => {
      setScreenFrameIndices((prev) => {
        const newIndices = { ...prev };
        let allAtMax = true;
        
        // Перевіряємо, чи всі екрани на максимальному фреймі
        Object.keys(screenFrames).forEach(screenNumStr => {
          const screenNum = parseInt(screenNumStr);
          const framesCount = screenFrames[screenNum].length;
          const currentIndex = prev[screenNum] || 0;
          if (currentIndex < framesCount - 1) {
            newIndices[screenNum] = currentIndex + 1;
            allAtMax = false;
          }
        });
        
        if (allAtMax) {
          setIsPlaying(false);
          if (playIntervalRef.current) {
            clearInterval(playIntervalRef.current);
            playIntervalRef.current = null;
          }
        }
        
        return newIndices;
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
    if (areAllScreensAtStartFrame()) return;
    
    setScreenFrameIndices((prev) => {
      const newIndices = { ...prev };
      Object.keys(screenFrames).forEach(screenNumStr => {
        const screenNum = parseInt(screenNumStr);
        const currentIndex = prev[screenNum] || 0;
        if (currentIndex > 0) {
          newIndices[screenNum] = currentIndex - 1;
        }
      });
      return newIndices;
    });
  };

  const handleNextFrame = () => {
    if (areAllScreensAtMaxFrame()) return;
    
    setScreenFrameIndices((prev) => {
      const newIndices = { ...prev };
      Object.keys(screenFrames).forEach(screenNumStr => {
        const screenNum = parseInt(screenNumStr);
        const framesCount = screenFrames[screenNum].length;
        const currentIndex = prev[screenNum] || 0;
        if (currentIndex < framesCount - 1) {
          newIndices[screenNum] = currentIndex + 1;
        }
      });
      return newIndices;
    });
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
          {screenLayout && screenLayout.screens > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: screenLayout.screens === 1 ? '1fr' : screenLayout.screens === 2 ? '1fr 1fr' : '1fr 1fr',
              gridTemplateRows: screenLayout.screens <= 2 ? '1fr' : '1fr 1fr',
              gap: '10px',
              width: '100%',
              height: '100%',
            }}>
              {Array.from({ length: screenLayout.screens }).map((_, index) => {
                const screenNumber = index + 1;
                const screenFramesList = screenFrames[screenNumber] || [];
                const screenFrameIndex = screenFrameIndices[screenNumber] || 0;
                const currentScreenFrame = screenFramesList[screenFrameIndex];
                const screenProject = screenProjects[screenNumber];
                const screenAnnotations = screenProject?.annotations || { frames: {} };
                
                // Знаходимо мінімальний ключ в анотаціях для цього екрана (offset)
                const annotationKeys = Object.keys(screenAnnotations.frames);
                let annotationOffset = 0;
                if (annotationKeys.length > 0) {
                  const numericKeys = annotationKeys.map(k => parseInt(k)).filter(k => !isNaN(k));
                  if (numericKeys.length > 0) {
                    annotationOffset = Math.min(...numericKeys);
                  }
                }
                
                // Обчислюємо глобальний індекс фрейму: offset + локальний індекс
                const globalFrameIndex = annotationOffset + screenFrameIndex;
                
                // Шукаємо rectangles за обчисленим глобальним індексом
                let screenRectangles = screenAnnotations.frames[globalFrameIndex.toString()] || [];
                
                // Якщо не знайдено, спробуємо знайти найближчий ключ
                if (screenRectangles.length === 0 && annotationKeys.length > 0) {
                  const numericKeys = annotationKeys.map(k => parseInt(k)).filter(k => !isNaN(k));
                  if (numericKeys.length > 0) {
                    const closestKey = numericKeys.reduce((prev, curr) => 
                      Math.abs(curr - globalFrameIndex) < Math.abs(prev - globalFrameIndex) ? curr : prev
                    );
                    if (Math.abs(closestKey - globalFrameIndex) <= 5) {
                      screenRectangles = screenAnnotations.frames[closestKey.toString()] || [];
                    }
                  }
                }
                
                // Діагностика для першого екрана та першого фрейму
                if (screenNumber === 1 && screenFrameIndex === 0) {
                  console.log(`Діагностика для Екран ${screenNumber}, фрейм ${screenFrameIndex}:`);
                  console.log(`  Annotation offset: ${annotationOffset}`);
                  console.log(`  Глобальний індекс: ${globalFrameIndex}`);
                  console.log(`  Доступні ключі в annotations:`, Object.keys(screenAnnotations.frames).slice(0, 10));
                  console.log(`  Знайдено rectangles:`, screenRectangles.length);
                }

                return (
                  <div key={screenNumber} style={{
                    position: 'relative',
                    width: '100%',
                    height: '100%',
                    border: '2px solid #333',
                    borderRadius: '8px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      position: 'absolute',
                      top: '10px',
                      left: '10px',
                      backgroundColor: 'rgba(0, 0, 0, 0.7)',
                      color: '#fff',
                      padding: '5px 10px',
                      borderRadius: '4px',
                      fontSize: '14px',
                      fontWeight: '600',
                      zIndex: 10,
                    }}>
                      Екран {screenNumber}
                    </div>
                    {screenFramesList.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        bottom: '10px',
                        left: '10px',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        color: '#fff',
                        padding: '5px 10px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        zIndex: 10,
                      }}>
                        {screenFrameIndices[screenNumber] + 1} / {screenFramesList.length}
                      </div>
                    )}
                    {currentScreenFrame ? (
                      <FrameViewer
                        frameImage={currentScreenFrame.imageData}
                        frameIndex={screenFrameIndex}
                        totalFrames={screenFramesList.length}
                        rectangles={screenRectangles}
                        onRectanglesChange={(newRects) => {
                          if (screenProject) {
                            const updatedAnnotations = { ...screenAnnotations };
                            // Використовуємо глобальний індекс для збереження
                            updatedAnnotations.frames[globalFrameIndex.toString()] = newRects;
                            const updatedProject = {
                              ...screenProject,
                              annotations: updatedAnnotations,
                            };
                            setScreenProjects({
                              ...screenProjects,
                              [screenNumber]: updatedProject,
                            });
                            // Зберігаємо оновлені анотації в БД
                            saveProjectToDB(updatedProject).catch(error => {
                              console.error(`Помилка збереження проекту для екрана ${screenNumber}:`, error);
                            });
                          }
                        }}
                        creationMode={creationMode}
                        onCreationModeChange={setCreationMode}
                        selectedRectIndex={selectedRectIndex}
                        onRectSelect={setSelectedRectIndex}
                        isDetecting={isDetecting}
                        screenLayout={{ screens: 1 }}
                        xmlAnnotations={xmlAnnotations[screenNumber] ? { 1: xmlAnnotations[screenNumber] } : null}
                        currentScreenNumber={1}
                        rectangleLabels={screenRectangles.reduce((labels, rect, localIndex) => {
                          labels[localIndex] = `${screenNumber}_${localIndex + 1}`;
                          return labels;
                        }, {} as { [index: number]: string })}
                      />
                    ) : (
                      <div style={{ 
                        color: '#fff', 
                        textAlign: 'center', 
                        padding: '20px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                      }}>
                        Немає даних для екрана {screenNumber}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#fff', textAlign: 'center' }}>
              Upload video or photo to get started
            </div>
          )}
          
          {/* Кнопки управління плейером для всіх екранів */}
          {screenLayout && screenLayout.screens > 0 && Object.keys(screenFrames).length > 0 && (
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
                disabled={areAllScreensAtStartFrame()}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: areAllScreensAtStartFrame() ? 'not-allowed' : 'pointer',
                  backgroundColor: areAllScreensAtStartFrame() ? '#666' : '#2196f3',
                  color: '#ffffff',
                  opacity: areAllScreensAtStartFrame() ? 0.5 : 1,
                }}
              >
                ◀ Попередній
              </button>
              
              {!isPlaying ? (
                <button
                  onClick={handlePlay}
                  disabled={getMinFramesCount() === 0}
                  style={{
                    padding: '8px 16px',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: getMinFramesCount() === 0 ? 'not-allowed' : 'pointer',
                    backgroundColor: getMinFramesCount() === 0 ? '#666' : '#4caf50',
                    color: '#ffffff',
                    opacity: getMinFramesCount() === 0 ? 0.5 : 1,
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
                disabled={areAllScreensAtMaxFrame()}
                style={{
                  padding: '8px 16px',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: areAllScreensAtMaxFrame() ? 'not-allowed' : 'pointer',
                  backgroundColor: areAllScreensAtMaxFrame() ? '#666' : '#2196f3',
                  color: '#ffffff',
                  opacity: areAllScreensAtMaxFrame() ? 0.5 : 1,
                }}
              >
                Наступний ▶
              </button>
              
            </div>
          )}
        </div>
        {screenLayout && screenLayout.screens > 0 && (
          <ObjectsList
            rectangles={currentRectangles}
            selectedIndex={selectedRectIndex}
            onSelect={handleRectSelect}
            onStatusChange={handleStatusChange}
            screenRectangles={allScreenRectangles}
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

