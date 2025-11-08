import React, { useState, useRef } from 'react';
import './ScreenLayoutModal.css';

interface ScreenData {
  videoFile: File | null;
  jsonFile: File | null;
}

interface ScreenLayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (layout: { screens: number; screenData: ScreenData[] }) => void;
}

export const ScreenLayoutModal: React.FC<ScreenLayoutModalProps> = ({
  isOpen,
  onClose,
  onSave,
}) => {
  const [screens, setScreens] = useState<number>(1);
  const [screenData, setScreenData] = useState<ScreenData[]>([
    { videoFile: null, jsonFile: null },
  ]);
  const videoInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const jsonInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Оновлюємо screenData при зміні кількості екранів
  React.useEffect(() => {
    setScreenData(prev => {
      const newScreenData: ScreenData[] = [];
      for (let i = 0; i < screens; i++) {
        newScreenData.push(prev[i] || { videoFile: null, jsonFile: null });
      }
      return newScreenData;
    });
  }, [screens]);

  if (!isOpen) return null;

  const handleVideoUpload = (screenIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newScreenData = [...screenData];
      newScreenData[screenIndex] = { ...newScreenData[screenIndex], videoFile: file };
      setScreenData(newScreenData);
    }
  };

  const handleJsonUpload = (screenIndex: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const newScreenData = [...screenData];
      newScreenData[screenIndex] = { ...newScreenData[screenIndex], jsonFile: file };
      setScreenData(newScreenData);
    }
  };

  const handleSave = () => {
    onSave({ screens, screenData });
    setScreens(1);
    setScreenData([{ videoFile: null, jsonFile: null }]);
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
          <div className="layout-section">
            <h3>Number of Screens</h3>
            <div className="screen-options">
              {[1, 2, 3, 4].map((num) => (
                <button
                  key={num}
                  className={`screen-option ${screens === num ? 'active' : ''}`}
                  onClick={() => setScreens(num)}
                >
                  {num}
                </button>
              ))}
            </div>
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
            <h3>Upload Files for Each Screen</h3>
            {Array.from({ length: screens }).map((_, index) => (
              <div key={index} className="screen-upload-group">
                <h4>Screen {index + 1}</h4>
                <div className="upload-item">
                  <label>Video File:</label>
                  <input
                    ref={(el) => (videoInputRefs.current[index] = el)}
                    type="file"
                    accept="video/*"
                    onChange={(e) => handleVideoUpload(index, e)}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="upload-btn"
                    onClick={() => videoInputRefs.current[index]?.click()}
                  >
                    {screenData[index]?.videoFile ? screenData[index].videoFile.name : 'Select Video'}
                  </button>
                </div>
                <div className="upload-item">
                  <label>JSON File:</label>
                  <input
                    ref={(el) => (jsonInputRefs.current[index] = el)}
                    type="file"
                    accept=".json,application/json"
                    onChange={(e) => handleJsonUpload(index, e)}
                    style={{ display: 'none' }}
                  />
                  <button
                    className="upload-btn"
                    onClick={() => jsonInputRefs.current[index]?.click()}
                  >
                    {screenData[index]?.jsonFile ? screenData[index].jsonFile.name : 'Select JSON'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="screen-layout-modal-footer">
          <button className="cancel-btn" onClick={onClose}>Cancel</button>
          <button className="save-btn" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

