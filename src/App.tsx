import { useState, useEffect } from 'react';
import { TaskPage } from './components/TaskPage';
import { ProjectPage } from './components/ProjectPage';
import { type VideoProject } from './utils/storage';
import { initDatabase } from './utils/database';
import './styles/index.css';

type Tab = 'task' | 'project';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('task');
  const [projectToEdit, setProjectToEdit] = useState<VideoProject | null>(null);

  // Initialize database on startup
  useEffect(() => {
    initDatabase().catch((error) => {
      console.error('Error initializing database:', error);
    });
  }, []);

  const handleProjectSelect = (project: VideoProject) => {
    setProjectToEdit(project);
    setActiveTab('task');
  };

  const handleProjectEditComplete = () => {
    setProjectToEdit(null);
  };

  return (
    <div id="root">
      <div className="tabs-container">
        <button
          className={`tab-button ${activeTab === 'task' ? 'active' : ''}`}
          onClick={() => setActiveTab('task')}
        >
          Task
        </button>
        <button
          className={`tab-button ${activeTab === 'project' ? 'active' : ''}`}
          onClick={() => setActiveTab('project')}
        >
          Project
        </button>
      </div>

      <div className="tab-content">
        {activeTab === 'task' ? (
          <TaskPage projectToEdit={projectToEdit} onEditComplete={handleProjectEditComplete} />
        ) : (
          <ProjectPage onProjectSelect={handleProjectSelect} />
        )}
      </div>
    </div>
  );
}

export default App;

