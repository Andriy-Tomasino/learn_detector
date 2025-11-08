import React, { useState, useEffect } from 'react';
import { type VideoProject } from '../utils/storage';
import { loadAllProjectsFromDB, deleteProjectFromDB, getProjectFile, saveProjectToDB } from '../utils/database';
import { ScreenLayoutModal } from './ScreenLayoutModal';
import { parseXmlAnnotations } from '../utils/xmlParser';
import './ProjectPage.css';

interface ProjectPageProps {
  onProjectSelect: (project: VideoProject) => void;
}

interface ScreenData {
  xmlFile: File | null;
  framesFiles: File[];
}

export const ProjectPage: React.FC<ProjectPageProps> = ({ onProjectSelect }) => {
  const [projects, setProjects] = useState<{ [key: string]: VideoProject }>({});
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);
  const [selectedScreen, setSelectedScreen] = useState<number | null>(null);

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const projectsList = await loadAllProjectsFromDB();
      const projectsMap: { [key: string]: VideoProject } = {};
      projectsList.forEach((project) => {
        projectsMap[project.id] = project;
      });
      setProjects(projectsMap);
    } catch (error) {
      console.error('Error loading projects:', error);
      alert('Error loading projects from database.');
    }
  };

  const handleDelete = async (videoId: string) => {
    const project = projects[videoId];
    const projectName = project?.fileName || 'цей проєкт';
    if (confirm(`Ви впевнені, що хочете видалити проєкт "${projectName}"? Цю дію неможливо скасувати.`)) {
      try {
        await deleteProjectFromDB(videoId);
        await loadProjects();
        
        // Оновлюємо screenLayout на основі зайнятих екранів після видалення
        const updatedProjectsList = await loadAllProjectsFromDB();
        const updatedOccupancy: { [key: number]: { isOccupied: boolean; projectName?: string } } = {
          1: { isOccupied: false },
          2: { isOccupied: false },
          3: { isOccupied: false },
          4: { isOccupied: false },
        };
        
        updatedProjectsList.forEach((proj) => {
          const screenMatch = proj.fileName.match(/Screen_(\d+)_/);
          if (screenMatch) {
            const screenNum = parseInt(screenMatch[1]);
            if (screenNum >= 1 && screenNum <= 4) {
              updatedOccupancy[screenNum] = {
                isOccupied: true,
                projectName: proj.fileName,
              };
            }
          }
        });
        
        const occupiedCount = Object.values(updatedOccupancy).filter(screen => screen.isOccupied).length;
        const screensCount = Math.max(1, occupiedCount);
        
        const layoutData = localStorage.getItem('screenLayout');
        let layoutInfo: any = { screens: screensCount, screenFiles: [] };
        
        if (layoutData) {
          try {
            layoutInfo = JSON.parse(layoutData);
          } catch (error) {
            console.error('Error parsing screenLayout:', error);
          }
        }
        
        layoutInfo.screens = screensCount;
        layoutInfo.screenFiles = [];
        for (let i = 1; i <= 4; i++) {
          if (updatedOccupancy[i].isOccupied) {
            const screenKey = `screen_${i}`;
            const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
            layoutInfo.screenFiles.push({
              screenNumber: i,
              xmlFileName: null,
              framesCount: framesCount,
            });
          }
        }
        
        localStorage.setItem('screenLayout', JSON.stringify(layoutInfo));
        
        alert('Проєкт успішно видалено.');
      } catch (error) {
        console.error('Error deleting project:', error);
        alert('Помилка при видаленні проєкту.');
      }
    }
  };


  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString('en-US');
  };

  const getTotalRectangles = (project: VideoProject): number => {
    let total = 0;
    Object.values(project.annotations.frames).forEach((rects) => {
      total += rects.length;
    });
    return total;
  };

  const projectList = Object.values(projects);

  // Визначаємо зайнятість екранів на основі назв проектів
  const getScreenOccupancy = () => {
    const occupied: { [key: number]: { isOccupied: boolean; projectName?: string } } = {
      1: { isOccupied: false },
      2: { isOccupied: false },
      3: { isOccupied: false },
      4: { isOccupied: false },
    };
    
    projectList.forEach((project) => {
      // Перевіряємо, чи назва проекту містить номер екрана
      const screenMatch = project.fileName.match(/Screen_(\d+)_/);
      if (screenMatch) {
        const screenNum = parseInt(screenMatch[1]);
        if (screenNum >= 1 && screenNum <= 4) {
          occupied[screenNum] = {
            isOccupied: true,
            projectName: project.fileName,
          };
        }
      }
    });
    
    return occupied;
  };

  const screenOccupancy = getScreenOccupancy();

  // Знаходимо перший вільний екран
  const getFirstFreeScreen = (): number | null => {
    for (let i = 1; i <= 4; i++) {
      if (!screenOccupancy[i].isOccupied) {
        return i;
      }
    }
    return null;
  };


  const handleLayoutSave = async (layout: { screens: number; screenData: Array<{ xmlFile: File | null; framesFiles: File[] }> }) => {
    try {
      // Валідація: перевіряємо, чи є хоча б один фрейм
      const hasFrames = layout.screenData.some(screen => screen.framesFiles.length > 0);
      if (!hasFrames) {
        alert('Помилка: необхідно завантажити хоча б один фрейм для створення проєкту.');
        return;
      }

      console.log('Початок створення проєкту...', { screens: layout.screens, screenData: layout.screenData });

      // Зберігаємо структуру layout тільки якщо проект прив'язаний до екрана
      if (selectedScreen !== null) {
        const layoutInfo = {
          screens: layout.screens,
          screenFiles: layout.screenData.map((screen, index) => ({
            screenNumber: index + 1,
            xmlFileName: screen.xmlFile?.name || null,
            framesCount: screen.framesFiles.length,
          })),
        };
        localStorage.setItem('screenLayout', JSON.stringify(layoutInfo));
      }

      // Зберігаємо файли для кожного екрана та збираємо дані для проєкту
      const allFrames: string[] = [];
      const allAnnotations: { frames: { [key: string]: any[] } } = { frames: {} };
      let totalFileSize = 0;
      // Створюємо id для проекту
      const projectId = Date.now().toString();
      
      // Назва проекту: якщо вибрано екран - прив'язуємо до нього, інакше - просто id
      let projectFileName = selectedScreen 
        ? `Screen_${selectedScreen}_${projectId}`
        : `Project_${projectId}`;

      // Обробляємо кожен екран
      for (let i = 0; i < layout.screenData.length; i++) {
        const screen = layout.screenData[i];
        const screenKey = `screen_${i + 1}`;
        const startFrameIndex = allFrames.length; // Початковий індекс для цього екрана
        let xmlContent = '';

        console.log(`Обробка екрана ${i + 1}:`, { 
          hasXml: !!screen.xmlFile, 
          framesCount: screen.framesFiles.length 
        });

        // Зберігаємо XML (тільки для TaskPage, не для проєкту)
        if (screen.xmlFile) {
          xmlContent = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const content = reader.result as string;
              // Зберігаємо XML в localStorage тільки для TaskPage (він невеликий)
              try {
                localStorage.setItem(`${screenKey}_xml`, content);
              } catch (error) {
                console.warn(`Не вдалося зберегти XML в localStorage для екрана ${i + 1}, але продовжуємо:`, error);
              }
              resolve(content);
            };
            reader.onerror = (error) => {
              console.error(`Помилка читання XML для екрана ${i + 1}:`, error);
              reject(error);
            };
            reader.readAsText(screen.xmlFile!);
          });

          // Парсимо XML анотації
          try {
            const parsed = await parseXmlAnnotations(xmlContent);
            console.log(`XML анотації для екрана ${i + 1}:`, parsed);
            // Конвертуємо анотації в формат проєкту
            // XML анотації використовують локальні індекси фреймів для кожного екрана
            Object.entries(parsed.frames).forEach(([frameKey, boxes]) => {
              const localFrameIndex = parseInt(frameKey);
              const globalFrameIndex = startFrameIndex + localFrameIndex;
              allAnnotations.frames[globalFrameIndex.toString()] = boxes.map(box => ({
                x: box.x,
                y: box.y,
                w: box.width,
                h: box.height,
              }));
            });
          } catch (error) {
            console.error(`Помилка парсингу XML для екрана ${i + 1}:`, error);
          }
        }

        // Зберігаємо фрейми (тільки в пам'яті для проєкту, не в localStorage)
        if (screen.framesFiles.length > 0) {
          const framePromises = screen.framesFiles.map((frameFile, frameIndex) => {
            totalFileSize += frameFile.size;
            
            return new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                // НЕ зберігаємо в localStorage - тільки додаємо до проєкту
                allFrames.push(dataUrl);
                resolve(dataUrl);
              };
              reader.onerror = (error) => {
                console.error(`Помилка читання фрейму ${frameIndex} для екрана ${i + 1}:`, error);
                reject(error);
              };
              reader.readAsDataURL(frameFile);
            });
          });

          await Promise.all(framePromises);
          console.log(`Завантажено ${screen.framesFiles.length} фреймів для екрана ${i + 1}`);
        }
        
        // Зберігаємо тільки метадані в localStorage (без фреймів)
        localStorage.setItem(`${screenKey}_frames_count`, screen.framesFiles.length.toString());
      }

      console.log('Загальна статистика:', {
        totalFrames: allFrames.length,
        totalFileSize,
        annotationsCount: Object.keys(allAnnotations.frames).length
      });

      if (allFrames.length === 0) {
        alert('Помилка: не вдалося завантажити жодного фрейму. Перевірте файли.');
        return;
      }

      // Створюємо проєкт (використовуємо projectId як id)
      const videoId = projectId;
      const project: VideoProject = {
        id: videoId,
        fileName: projectFileName,
        fileSize: totalFileSize,
        fileType: 'screen-layout',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        annotations: allAnnotations,
        frames: allFrames,
      };

      console.log('Збереження проєкту в БД...', project);

      // Зберігаємо проєкт в БД
      await saveProjectToDB(project);
      
      console.log('Проєкт збережено, оновлення списку...');
      
      // Оновлюємо список проєктів
      await loadProjects();
      
      // Оновлюємо screenLayout на основі зайнятих екранів (після оновлення списку проектів)
      // Отримуємо актуальний список проектів з БД
      const updatedProjectsList = await loadAllProjectsFromDB();
      const updatedOccupancy: { [key: number]: { isOccupied: boolean; projectName?: string } } = {
        1: { isOccupied: false },
        2: { isOccupied: false },
        3: { isOccupied: false },
        4: { isOccupied: false },
      };
      
      updatedProjectsList.forEach((project) => {
        const screenMatch = project.fileName.match(/Screen_(\d+)_/);
        if (screenMatch) {
          const screenNum = parseInt(screenMatch[1]);
          if (screenNum >= 1 && screenNum <= 4) {
            updatedOccupancy[screenNum] = {
              isOccupied: true,
              projectName: project.fileName,
            };
          }
        }
      });
      
      const occupiedCount = Object.values(updatedOccupancy).filter(screen => screen.isOccupied).length;
      const screensCount = Math.max(1, occupiedCount);
      
      const layoutData = localStorage.getItem('screenLayout');
      let layoutInfo: any = { screens: screensCount, screenFiles: [] };
      
      if (layoutData) {
        try {
          layoutInfo = JSON.parse(layoutData);
        } catch (error) {
          console.error('Error parsing screenLayout:', error);
        }
      }
      
      layoutInfo.screens = screensCount;
      layoutInfo.screenFiles = [];
      for (let i = 1; i <= 4; i++) {
        if (updatedOccupancy[i].isOccupied) {
          const screenKey = `screen_${i}`;
          const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
          layoutInfo.screenFiles.push({
            screenNumber: i,
            xmlFileName: null,
            framesCount: framesCount,
          });
        }
      }
      
      localStorage.setItem('screenLayout', JSON.stringify(layoutInfo));
      
      console.log('Проєкт успішно створено!');
      
      alert('Проєкт успішно створено та збережено!');
    } catch (error) {
      console.error('Помилка при збереженні проєкту:', error);
      alert(`Помилка при збереженні проєкту: ${error instanceof Error ? error.message : 'Невідома помилка'}. Перевірте консоль для деталей.`);
    }
  };

  const handleAddProjectToScreen = (screenNumber: number, existingProject?: VideoProject) => {
    if (existingProject) {
      // Якщо проект вже існує, просто оновлюємо його назву для прив'язки до екрана
      handleMoveProjectToScreen(existingProject, screenNumber);
    } else {
      // Якщо проект не існує, відкриваємо модальне вікно для створення нового
      setSelectedScreen(screenNumber);
      setIsLayoutModalOpen(true);
    }
  };

  const handleMoveProjectToScreen = async (project: VideoProject, screenNumber: number) => {
    try {
      // Оновлюємо назву проекту для прив'язки до екрана (використовуємо id як номер)
      // Якщо id містить підкреслення, беремо останню частину, інакше використовуємо весь id
      const projectId = project.id.includes('_') ? project.id.split('_').pop() : project.id;
      const updatedProject: VideoProject = {
        ...project,
        fileName: `Screen_${screenNumber}_${projectId}`,
        updatedAt: Date.now(),
      };

      // Зберігаємо оновлений проект в БД
      await saveProjectToDB(updatedProject);
      
      // Оновлюємо список проектів
      await loadProjects();
      
      // Оновлюємо screenLayout на основі зайнятих екранів (після оновлення списку проектів)
      const updatedProjectsList = await loadAllProjectsFromDB();
      const updatedOccupancy: { [key: number]: { isOccupied: boolean; projectName?: string } } = {
        1: { isOccupied: false },
        2: { isOccupied: false },
        3: { isOccupied: false },
        4: { isOccupied: false },
      };
      
      updatedProjectsList.forEach((proj) => {
        const screenMatch = proj.fileName.match(/Screen_(\d+)_/);
        if (screenMatch) {
          const screenNum = parseInt(screenMatch[1]);
          if (screenNum >= 1 && screenNum <= 4) {
            updatedOccupancy[screenNum] = {
              isOccupied: true,
              projectName: proj.fileName,
            };
          }
        }
      });
      
      const occupiedCount = Object.values(updatedOccupancy).filter(screen => screen.isOccupied).length;
      const screensCount = Math.max(1, occupiedCount);
      
      const layoutData = localStorage.getItem('screenLayout');
      let layoutInfo: any = { screens: screensCount, screenFiles: [] };
      
      if (layoutData) {
        try {
          layoutInfo = JSON.parse(layoutData);
        } catch (error) {
          console.error('Error parsing screenLayout:', error);
        }
      }
      
      layoutInfo.screens = screensCount;
      layoutInfo.screenFiles = [];
      for (let i = 1; i <= 4; i++) {
        if (updatedOccupancy[i].isOccupied) {
          const screenKey = `screen_${i}`;
          const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
          layoutInfo.screenFiles.push({
            screenNumber: i,
            xmlFileName: null,
            framesCount: framesCount,
          });
        }
      }
      
      localStorage.setItem('screenLayout', JSON.stringify(layoutInfo));
      
      alert(`Проект "${project.fileName}" успішно перенесено на Екран ${screenNumber}`);
    } catch (error) {
      console.error('Помилка при перенесенні проекту:', error);
      alert(`Помилка при перенесенні проекту: ${error instanceof Error ? error.message : 'Невідома помилка'}`);
    }
  };

  return (
    <div className="project-page">
      <div className="project-header">
        <h2>All Projects</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="project-count">{projectList.length} projects</div>
          <button
            className="add-layout-btn"
            onClick={() => {
              setSelectedScreen(null);
              setIsLayoutModalOpen(true);
            }}
            title="Add New Project"
          >
            +
          </button>
        </div>
      </div>

      <div className="project-content">
        <div className="screens-panel">
          <h3 className="screens-panel-title">Екрани</h3>
          <div className="screens-list">
            {[1, 2, 3, 4].map((screenNum) => {
              const screenInfo = screenOccupancy[screenNum];
              const isOccupied = screenInfo.isOccupied;
              return (
                <div key={screenNum} className={`screen-template ${isOccupied ? 'occupied' : 'free'}`}>
                  <div className="screen-template-header">
                    <span className="screen-template-number">Екран {screenNum}</span>
                    <span className={`screen-status ${isOccupied ? 'occupied' : 'free'}`}>
                      {isOccupied ? `Зайнятий: ${screenInfo.projectName || ''}` : 'Вільний'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="project-list">
          {projectList.length === 0 ? (
            <div className="empty-projects">
              <p>Немає збережених проєктів</p>
              <p className="hint">Створіть новий проєкт, натиснувши кнопку "+" або перейдіть на вкладку Task</p>
            </div>
          ) : (
            projectList.map((project) => (
              <div
                key={project.id}
                className="project-card"
              >
              <div className="project-card-header">
                <div className="project-card-title">{project.fileName}</div>
                <div className="project-card-actions">
                  <button
                    className="edit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onProjectSelect(project);
                    }}
                    title="Edit"
                  >
                    ✏
                  </button>
                  <button
                    className="add-to-screen-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const freeScreen = getFirstFreeScreen();
                      if (freeScreen) {
                        handleAddProjectToScreen(freeScreen, project);
                      } else {
                        alert('Всі екрани зайняті. Спочатку видаліть проект з одного з екранів.');
                      }
                    }}
                    title="Перенести на вільний екран"
                  >
                    📺
                  </button>
                  <button
                    className="delete-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(project.id);
                    }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
                <div className="project-card-info">
                  <div className="info-item">
                    <span className="info-label">Size:</span>
                    <span className="info-value">{formatFileSize(project.fileSize)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Type:</span>
                    <span className="info-value">{project.fileType}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Annotations:</span>
                    <span className="info-value">{getTotalRectangles(project)}</span>
                  </div>
                  <div className="info-item">
                    <span className="info-label">Updated:</span>
                    <span className="info-value">{formatDate(project.updatedAt)}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
      <ScreenLayoutModal
        isOpen={isLayoutModalOpen}
        onClose={() => {
          setIsLayoutModalOpen(false);
          setSelectedScreen(null);
        }}
        onSave={async (layout: { screens: number; screenData: ScreenData[] }) => {
          await handleLayoutSave(layout);
          setSelectedScreen(null);
        }}
        selectedScreen={selectedScreen}
      />
    </div>
  );
};

