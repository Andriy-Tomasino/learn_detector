import React, { useState } from 'react';
import { type TaskCondition } from '../utils/storage';
import './CreateTaskModal.css';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, conditions: TaskCondition[]) => void;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({ isOpen, onClose, onCreate }) => {
  const [taskName, setTaskName] = useState('');
  const [conditions, setConditions] = useState<TaskCondition[]>([]);
  const [newConditionText, setNewConditionText] = useState('');

  if (!isOpen) return null;

  const handleAddCondition = () => {
    if (newConditionText.trim()) {
      const newCondition: TaskCondition = {
        id: `condition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        text: newConditionText.trim(),
      };
      setConditions([...conditions, newCondition]);
      setNewConditionText('');
    }
  };

  const handleRemoveCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id));
  };

  const handleCreate = () => {
    if (taskName.trim()) {
      onCreate(taskName.trim(), conditions);
      setTaskName('');
      setConditions([]);
      setNewConditionText('');
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddCondition();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Create New Task</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label htmlFor="task-name">Task Name:</label>
            <input
              id="task-name"
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="Enter task name"
              className="task-name-input"
            />
          </div>

          <div className="form-group">
            <label>Conditions:</label>
            <div className="conditions-list">
              {conditions.map((condition) => (
                <div key={condition.id} className="condition-item">
                  <span>{condition.text}</span>
                  <button
                    className="remove-condition-btn"
                    onClick={() => handleRemoveCondition(condition.id)}
                    title="Remove condition"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="add-condition">
              <input
                type="text"
                value={newConditionText}
                onChange={(e) => setNewConditionText(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Enter condition and press Enter"
                className="condition-input"
              />
              <button onClick={handleAddCondition} className="add-condition-btn">
                Add
              </button>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            className="create-btn"
            disabled={!taskName.trim()}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

