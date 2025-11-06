export interface Rectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VideoAnnotations {
  frames: {
    [frameIndex: string]: Rectangle[];
  };
}

export interface TaskCondition {
  id: string;
  text: string;
}

export interface Task {
  id: string;
  name: string;
  conditions: TaskCondition[];
  createdAt: number;
  updatedAt: number;
}

export interface VideoProject {
  id: string;
  taskId?: string; // Task ID
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: number;
  updatedAt: number;
  annotations: VideoAnnotations;
  frames?: string[]; // base64 frame images for restoration
}

export interface ProjectStorage {
  projects: {
    [videoId: string]: VideoProject;
  };
}

const STORAGE_KEY = 'video-projects';
const CURRENT_TASK_KEY = 'current-task';

// Save current task (for Task tab)
export const saveCurrentTask = (videoId: string, annotations: VideoAnnotations, taskId?: string | null): void => {
  try {
    localStorage.setItem(CURRENT_TASK_KEY, JSON.stringify({ videoId, annotations, taskId: taskId || null }));
  } catch (error) {
    console.error('Error saving current task:', error);
  }
};

export const loadCurrentTask = (): { videoId: string | null; annotations: VideoAnnotations; taskId: string | null } => {
  try {
    const stored = localStorage.getItem(CURRENT_TASK_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        videoId: parsed.videoId || null,
        annotations: parsed.annotations || { frames: {} },
        taskId: parsed.taskId || null,
      };
    }
  } catch (error) {
    console.error('Error loading current task:', error);
  }
  return { videoId: null, annotations: { frames: {} }, taskId: null };
};

// Save project
export const saveProject = (project: VideoProject): void => {
  try {
    const storage = loadAllProjects();
    storage.projects[project.id] = project;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error('Error saving project:', error);
  }
};

export const loadProject = (videoId: string): VideoProject | null => {
  try {
    const storage = loadAllProjects();
    return storage.projects[videoId] || null;
  } catch (error) {
    console.error('Error loading project:', error);
    return null;
  }
};

export const loadAllProjects = (): ProjectStorage => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Error loading projects:', error);
  }
  return { projects: {} };
};

export const deleteProject = (videoId: string): void => {
  try {
    const storage = loadAllProjects();
    delete storage.projects[videoId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error('Error deleting project:', error);
  }
};

export const exportProject = (project: VideoProject): void => {
  const json = JSON.stringify(project, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${project.fileName}_annotations.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// Create ID for video
export const createVideoId = (fileName: string, fileSize: number): string => {
  return `${fileName}_${fileSize}_${Date.now()}`;
};

