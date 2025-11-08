import React from 'react';
import './DetectionPanel.css';

interface DetectionItem {
  screenNumber: number; // максимум 4
  numberOnScreen: number; // номер на екрані
  id: string;
  status?: 'focused' | 'reject' | null;
}

interface DetectionPanelProps {
  detections: DetectionItem[];
  onStatusChange: (id: string, status: 'focused' | 'reject' | null) => void;
}

export const DetectionPanel: React.FC<DetectionPanelProps> = ({
  detections,
  onStatusChange,
}) => {
  return (
    <div className="detection-panel">
      <div className="detection-panel-header">
        <h3>Detections</h3>
      </div>
      <div className="detection-panel-content">
        {detections.length === 0 ? (
          <div className="empty-message">No detections</div>
        ) : (
          detections.map((detection, index) => (
            <div key={detection.id || index} className="detection-item">
              <div className="detection-item-info">
                <div className="detection-item-label">
                  №{Math.min(detection.screenNumber, 4)}_{detection.numberOnScreen}
                </div>
              </div>
              <div className="detection-item-actions">
                <button
                  className={`action-btn focused ${detection.status === 'focused' ? 'active' : ''}`}
                  onClick={() => onStatusChange(detection.id, detection.status === 'focused' ? null : 'focused')}
                >
                  Focused
                </button>
                <button
                  className={`action-btn reject ${detection.status === 'reject' ? 'active' : ''}`}
                  onClick={() => onStatusChange(detection.id, detection.status === 'reject' ? null : 'reject')}
                >
                  Reject
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

