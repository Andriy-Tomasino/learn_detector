import React, { useState, useRef } from 'react';
import './ScreenLayoutModal.css';

interface ScreenData {
  xmlFile: File | null;
  framesFiles: File[];
}

interface ScreenLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (layout: { screens: number; screenData: ScreenData[] }) => Promise<void> | void;
  selectedScreen?: number | null;
}

export const ScreenLayoutModal: React.FC<ScreenLayoutModalProps> = ({
  isOpen,
  onClose,
  onSave,
  selectedScreen = null,
}) => {
  // Завжди 4 екрани
  const screens = 4;
  const [screenData, setScreenData] = useState<ScreenData[]>([
    { xmlFile: null, framesFiles: [] },
    { xmlFile: null, framesFiles: [] },
    { xmlFile: null, framesFiles: [] },
    { xmlFile: null, framesFiles: [] },
  ]);
  const xmlInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const framesInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Оновлюємо screenData при відкритті модального вікна
  React.useEffect(() => {
    if (isOpen) {
      setScreenData([
        { xmlFile: null, framesFiles: [] },
        { xmlFile: null, framesFiles: [] },
        { xmlFile: null, framesFiles: [] },
        { xmlFile: null, framesFiles: [] },
      ]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleXmlUpload = (screenIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newScreenData = [...screenData];
      newScreenData[screenIndex] = { ...newScreenData[screenIndex], xmlFile: file };
      setScreenData(newScreenData);
    }
  };

  const handleFramesUpload = (screenIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const newScreenData = [...screenData];
      newScreenData[screenIndex] = { ...newScreenData[screenIndex], framesFiles: files };
      setScreenData(newScreenData);
    }
  };

  const handleSave = async () => {
    // Валідація перед збереженням
    const hasAnyFrames = screenData.some(screen => screen.framesFiles.length > 0);
    if (!hasAnyFrames) {
      alert('Помилка: необхідно завантажити хоча б один фрейм для створення проєкту.');
      return;
    }

    // Якщо вибрано конкретний екран, зберігаємо тільки його дані
    let dataToSave: ScreenData[] = screenData;
    if (selectedScreen !== null) {
      dataToSave = [
        { xmlFile: null, framesFiles: [] },
        { xmlFile: null, framesFiles: [] },
        { xmlFile: null, framesFiles: [] },
        { xmlFile: null, framesFiles: [] },
      ];
      dataToSave[selectedScreen - 1] = screenData[selectedScreen - 1];
    }

    // Викликаємо onSave (який є асинхронним)
    await onSave({ screens, screenData: dataToSave });
    
    // Очищаємо форму та закриваємо модальне вікно
    setScreenData([
      { xmlFile: null, framesFiles: [] },
      { xmlFile: null, framesFiles: [] },
      { xmlFile: null, framesFiles: [] },
      { xmlFile: null, framesFiles: [] },
    ]);
    onClose();
  };

  return (
    <div className="screen-layout-modal-overlay" onClick={onClose}>
      <div className="screen-layout-modal" onClick={(e) => e.stopPropagation()}>
        <div className="screen-layout-modal-header">
          <h2>Screen Layout Constructor</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="screen-layout-modal-content">
          {selectedScreen === null ? (
            // При створенні нового проекту - тільки поля завантаження
            <div className="file-upload-section">
              <div className="upload-item">
                <label>XML File:</label>
                <input
                  ref={(el) => (xmlInputRefs.current[0] = el)}
                  type="file"
                  accept=".xml,application/xml,text/xml"
                  onChange={(e) => handleXmlUpload(0, e)}
                  style={{ display: 'none' }}
                />
                <button
                  className="upload-btn"
                  onClick={() => xmlInputRefs.current[0]?.click()}
                >
                  {screenData[0]?.xmlFile ? screenData[0].xmlFile.name : 'Select XML'}
                </button>
              </div>
              <div className="upload-item">
                <label>Frames (Images):</label>
                <input
                  ref={(el) => (framesInputRefs.current[0] = el)}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => handleFramesUpload(0, e)}
                  style={{ display: 'none' }}
                />
                <button
                  className="upload-btn"
                  onClick={() => framesInputRefs.current[0]?.click()}
                >
                  {screenData[0]?.framesFiles.length > 0 
                    ? `${screenData[0].framesFiles.length} frame(s) selected`
                    : 'Select Frames'}
                </button>
              </div>
            </div>
          ) : (
            // При додаванні на конкретний екран
            <>
              <div className="selected-screen-info">
                <h3>Додавання проекту на Екран {selectedScreen}</h3>
                <p className="info-text">Завантажте файли для екрана {selectedScreen}</p>
              </div>

              <div className="layout-preview">
                <h3>Preview</h3>
                <div className="preview-container">
                  {Array.from({ length: screens }).map((_, index) => {
                    const cols = screens === 1 ? 1 : screens === 2 ? 2 : screens === 3 ? 2 : 2;
                    const rows = screens === 1 ? 1 : screens === 2 ? 1 : screens === 3 ? 2 : 2;
                    const col = index % cols;
                    const row = Math.floor(index / cols);
                    const width = 100 / cols;
                    const height = 100 / rows;
                    
                    return (
                      <div
                        key={index}
                        className="preview-screen"
                        style={{
                          width: `${width}%`,
                          height: `${height}%`,
                          left: `${col * width}%`,
                          top: `${row * height}%`,
                        }}
                      >
                        Screen {index + 1}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="file-upload-section">
                <h3>Upload Files</h3>
                {Array.from({ length: screens }).map((_, index) => {
                  if (index + 1 !== selectedScreen) {
                    return null;
                  }
                  return (
                    <div key={index} className="screen-upload-group">
                      <h4>Screen {index + 1}</h4>
                      <div className="upload-item">
                        <label>XML File:</label>
                        <input
                          ref={(el) => (xmlInputRefs.current[index] = el)}
                          type="file"
                          accept=".xml,application/xml,text/xml"
                          onChange={(e) => handleXmlUpload(index, e)}
                          style={{ display: 'none' }}
                        />
                        <button
                          className="upload-btn"
                          onClick={() => xmlInputRefs.current[index]?.click()}
                        >
                          {screenData[index]?.xmlFile ? screenData[index].xmlFile.name : 'Select XML'}
                        </button>
                      </div>
                      <div className="upload-item">
                        <label>Frames (Images):</label>
                        <input
                          ref={(el) => (framesInputRefs.current[index] = el)}
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => handleFramesUpload(index, e)}
                          style={{ display: 'none' }}
                        />
                        <button
                          className="upload-btn"
                          onClick={() => framesInputRefs.current[index]?.click()}
                        >
                          {screenData[index]?.framesFiles.length > 0 
                            ? `${screenData[index].framesFiles.length} frame(s) selected`
                            : 'Select Frames'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="screen-layout-modal-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

