import React from 'react';
import { Rectangle, ObjectStatus } from '../utils/storage';
import './ObjectsList.css';

interface ScreenRectangle {
  rectangle: Rectangle;
  screenNumber: number;
  localIndex: number;
}

interface ObjectsListProps {
  rectangles: Rectangle[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onStatusChange?: (index: number, status: ObjectStatus) => void;
  screenNumber?: number; // Номер екрана для форматування назви (для зворотної сумісності)
  screenRectangles?: ScreenRectangle[]; // Масив з інформацією про екран для кожного rectangle
}

export const ObjectsList: React.FC<ObjectsListProps> = ({
  rectangles,
  selectedIndex,
  onSelect,
  onStatusChange,
  screenNumber = 1,
  screenRectangles,
}) => {
  const handleStatusClick = (e: React.MouseEvent, index: number, status: ObjectStatus) => {
    e.stopPropagation();
    if (onStatusChange) {
      const currentStatus = rectangles[index]?.status || 'hold';
      // Якщо натиснули на вже активну кнопку (крім hold), скидаємо до hold
      // Якщо натиснули на hold і він вже активний, залишаємо hold
      if (currentStatus === status && status !== 'hold') {
        onStatusChange(index, 'hold');
      } else if (currentStatus !== status) {
        onStatusChange(index, status);
      }
    }
  };

  return (
    <div className="objects-list">
      <div className="objects-list-header">
        <h3>Objects ({rectangles.length})</h3>
      </div>
      <div className="objects-list-content">
        {rectangles.length === 0 ? (
          <div className="empty-message">No objects</div>
        ) : (
          rectangles.map((rect, index) => {
            const currentStatus = rect.status || 'hold';
            // Використовуємо screenRectangles для отримання правильного номера екрана та локального індексу
            const screenRect = screenRectangles?.[index];
            const objectScreenNumber = screenRect?.screenNumber || screenNumber;
            const objectLocalIndex = screenRect?.localIndex !== undefined ? screenRect.localIndex : index;
            const objectName = `${objectScreenNumber}_${objectLocalIndex + 1}`;
            return (
              <div
                key={index}
                className={`object-item ${selectedIndex === index ? 'selected' : ''}`}
                onClick={() => onSelect(index)}
              >
                <div className="object-item-info">
                  <div className="object-item-label">{objectName}</div>
                  <div className="object-item-details">
                    x: {Math.round(rect.x)}, y: {Math.round(rect.y)}
                    <br />
                    w: {Math.round(rect.w)}, h: {Math.round(rect.h)}
                  </div>
                </div>
                <div className="object-item-actions">
                  <button
                    className={`status-btn reject ${currentStatus === 'reject' ? 'active' : ''}`}
                    onClick={(e) => handleStatusClick(e, index, 'reject')}
                    title="Reject - приховати розмітку"
                  >
                    Reject
                  </button>
                  <button
                    className={`status-btn attack ${currentStatus === 'attack' ? 'active' : ''}`}
                    onClick={(e) => handleStatusClick(e, index, 'attack')}
                    title="Attack - червоний кордон з перехрестям"
                  >
                    Attack
                  </button>
                  <button
                    className={`status-btn hold ${currentStatus === 'hold' ? 'active' : ''}`}
                    onClick={(e) => handleStatusClick(e, index, 'hold')}
                    title="Hold - стандартний режим"
                  >
                    Hold
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

