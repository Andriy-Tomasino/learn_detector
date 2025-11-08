import React, { useState, useEffect } from 'react';
import { exportProject, createVideoId, type VideoProject } from '../utils/storage';
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
  const [selectedProject, setSelectedProject] = useState<VideoProject | null>(null);
  const [isLayoutModalOpen, setIsLayoutModalOpen] = useState(false);

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
        if (selectedProject?.id === videoId) {
          setSelectedProject(null);
        }
        alert('Проєкт успішно видалено.');
      } catch (error) {
        console.error('Error deleting project:', error);
        alert('Помилка при видаленні проєкту.');
      }
    }
  };

  const handleExport = (project: VideoProject) => {
    exportProject(project);
  };

  const handleSelect = (project: VideoProject) => {
    setSelectedProject(project);
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

  const handleLayoutSave = async (layout: { screens: number; screenData: Array<{ xmlFile: File | null; framesFiles: File[] }> }) => {
    try {
      // Валідація: перевіряємо, чи є хоча б один фрейм
      const hasFrames = layout.screenData.some(screen => screen.framesFiles.length > 0);
      if (!hasFrames) {
        alert('Помилка: необхідно завантажити хоча б один фрейм для створення проєкту.');
        return;
      }

      console.log('Початок створення проєкту...', { screens: layout.screens, screenData: layout.screenData });

      // Зберігаємо структуру layout
      const layoutInfo = {
        screens: layout.screens,
        screenFiles: layout.screenData.map((screen, index) => ({
          screenNumber: index + 1,
          xmlFileName: screen.xmlFile?.name || null,
          framesCount: screen.framesFiles.length,
        })),
      };
      localStorage.setItem('screenLayout', JSON.stringify(layoutInfo));

      // Зберігаємо файли для кожного екрана та збираємо дані для проєкту
      const allFrames: string[] = [];
      const allAnnotations: { frames: { [key: string]: any[] } } = { frames: {} };
      let totalFileSize = 0;
      let projectFileName = `ScreenLayout_${layout.screens}screens_${Date.now()}`;

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

      // Створюємо проєкт
      const videoId = createVideoId(projectFileName, totalFileSize);
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
      
      console.log('Проєкт успішно створено!');
      
      // Автоматично відкриваємо створений проєкт для редагування
      onProjectSelect(project);
      
      alert('Проєкт успішно створено та збережено! Відкриваємо для редагування...');
    } catch (error) {
      console.error('Помилка при збереженні проєкту:', error);
      alert(`Помилка при збереженні проєкту: ${error instanceof Error ? error.message : 'Невідома помилка'}. Перевірте консоль для деталей.`);
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
            onClick={() => setIsLayoutModalOpen(true)}
            title="Add Screen Layout"
          >
            +
          </button>
        </div>
      </div>

      <div className="project-content">
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
                className={`project-card ${selectedProject?.id === project.id ? 'selected' : ''}`}
                onClick={() => handleSelect(project)}
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
                    className="export-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleExport(project);
                    }}
                    title="Export"
                  >
                    ⬇
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

        {selectedProject && (
          <div className="project-details">
            <h3>Project Details</h3>
            <div className="details-content">
              <div className="detail-section">
                <h4>File Information</h4>
                <div className="detail-item">
                  <span>Name:</span>
                  <span>{selectedProject.fileName}</span>
                </div>
                <div className="detail-item">
                  <span>Size:</span>
                  <span>{formatFileSize(selectedProject.fileSize)}</span>
                </div>
                <div className="detail-item">
                  <span>Type:</span>
                  <span>{selectedProject.fileType}</span>
                </div>
                <div className="detail-item">
                  <span>Created:</span>
                  <span>{formatDate(selectedProject.createdAt)}</span>
                </div>
                <div className="detail-item">
                  <span>Updated:</span>
                  <span>{formatDate(selectedProject.updatedAt)}</span>
                </div>
              </div>

              <div className="detail-section">
                <h4>Annotation Statistics</h4>
                <div className="detail-item">
                  <span>Total Objects:</span>
                  <span>{getTotalRectangles(selectedProject)}</span>
                </div>
                <div className="detail-item">
                  <span>Frames with Annotations:</span>
                  <span>
                    {Object.keys(selectedProject.annotations.frames).filter(
                      (key) => selectedProject.annotations.frames[key].length > 0
                    ).length}
                  </span>
                </div>
              </div>

              <div className="detail-actions">
                <button
                  className="edit-detail-btn"
                  onClick={() => onProjectSelect(selectedProject)}
                >
                  Edit
                </button>
                <button
                  className="export-detail-btn"
                  onClick={() => handleExport(selectedProject)}
                >
                  Export JSON
                </button>
                <button
                  className="delete-detail-btn"
                  onClick={() => handleDelete(selectedProject.id)}
                >
                  Delete Project
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <ScreenLayoutModal
        isOpen={isLayoutModalOpen}
        onClose={() => setIsLayoutModalOpen(false)}
        onSave={async (layout: { screens: number; screenData: ScreenData[] }) => {
          await handleLayoutSave(layout);
        }}
      />
    </div>
  );
};

