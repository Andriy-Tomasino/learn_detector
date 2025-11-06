import React from 'react';
import { Rectangle } from '../utils/storage';
import './ObjectsList.css';

interface ObjectsListProps {
  rectangles: Rectangle[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  onDelete: (index: number) => void;
}

export const ObjectsList: React.FC<ObjectsListProps> = ({
  rectangles,
  selectedIndex,
  onSelect,
  onDelete,
}) => {
  return (
    <div className="objects-list">
      <div className="objects-list-header">
        <h3>Об'єкти ({rectangles.length})</h3>
      </div>
      <div className="objects-list-content">
        {rectangles.length === 0 ? (
          <div className="empty-message">Немає об'єктів</div>
        ) : (
          rectangles.map((rect, index) => (
            <div
              key={index}
              className={`object-item ${selectedIndex === index ? 'selected' : ''}`}
              onClick={() => onSelect(index)}
            >
              <div className="object-item-info">
                <div className="object-item-label">Об'єкт {index + 1}</div>
                <div className="object-item-details">
                  x: {Math.round(rect.x)}, y: {Math.round(rect.y)}
                  <br />
                  w: {Math.round(rect.w)}, h: {Math.round(rect.h)}
                </div>
              </div>
              <button
                className="object-item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(index);
                }}
                title="Видалити"
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

