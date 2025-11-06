import { type VideoProject, type VideoAnnotations, type Rectangle } from './storage';

const DB_NAME = 'VideoAnnotationDB';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_FILES = 'files';

interface DBProject {
  id: string;
  taskId?: string; // ID таски
  fileName: string;
  fileSize: number;
  fileType: string;
  createdAt: number;
  updatedAt: number;
  annotations: VideoAnnotations;
  fileId: string; // ID файлу в store files
  frames?: string[]; // base64 зображення фреймів
}

interface DBFile {
  id: string;
  data: Blob;
  type: string;
}

let dbInstance: IDBDatabase | null = null;

// Initialize database
export const initDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      resolve(dbInstance);
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create store for projects
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
        const projectStore = db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        projectStore.createIndex('fileName', 'fileName', { unique: false });
        projectStore.createIndex('createdAt', 'createdAt', { unique: false });
        projectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      // Create store for files
      if (!db.objectStoreNames.contains(STORE_FILES)) {
        db.createObjectStore(STORE_FILES, { keyPath: 'id' });
      }
    };
  });
};

// Save file
export const saveFile = async (file: File): Promise<string> => {
  const db = await initDatabase();
  const fileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILES], 'readwrite');
    const store = transaction.objectStore(STORE_FILES);

    const dbFile: DBFile = {
      id: fileId,
      data: file,
      type: file.type,
    };

    const request = store.put(dbFile);

    request.onsuccess = () => {
      resolve(fileId);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// Load file
export const loadFile = async (fileId: string): Promise<File | null> => {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILES], 'readonly');
    const store = transaction.objectStore(STORE_FILES);
    const request = store.get(fileId);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const file = new File([result.data], `file.${result.type.split('/')[1]}`, { type: result.type });
        resolve(file);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// Save project
export const saveProjectToDB = async (project: VideoProject, fileId?: string): Promise<void> => {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readwrite');
    const store = transaction.objectStore(STORE_PROJECTS);

    const dbProject: DBProject = {
      id: project.id,
      taskId: project.taskId,
      fileName: project.fileName,
      fileSize: project.fileSize,
      fileType: project.fileType,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      annotations: project.annotations,
      fileId: fileId || '',
      frames: project.frames,
    };

    const request = store.put(dbProject);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// Load project
export const loadProjectFromDB = async (projectId: string): Promise<VideoProject | null> => {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readonly');
    const store = transaction.objectStore(STORE_PROJECTS);
    const request = store.get(projectId);

    request.onsuccess = () => {
      const result = request.result;
      if (result) {
        const project: VideoProject = {
          id: result.id,
          taskId: result.taskId,
          fileName: result.fileName,
          fileSize: result.fileSize,
          fileType: result.fileType,
          createdAt: result.createdAt,
          updatedAt: result.updatedAt,
          annotations: result.annotations,
          frames: result.frames,
        };
        resolve(project);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// Load all projects
export const loadAllProjectsFromDB = async (): Promise<VideoProject[]> => {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readonly');
    const store = transaction.objectStore(STORE_PROJECTS);
    const index = store.index('updatedAt');
    const request = index.openCursor(null, 'prev'); // Sort by update date (newest first)

    const projects: VideoProject[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const dbProject = cursor.value;
        const project: VideoProject = {
          id: dbProject.id,
          taskId: dbProject.taskId,
          fileName: dbProject.fileName,
          fileSize: dbProject.fileSize,
          fileType: dbProject.fileType,
          createdAt: dbProject.createdAt,
          updatedAt: dbProject.updatedAt,
          annotations: dbProject.annotations,
          frames: dbProject.frames,
        };
        projects.push(project);
        cursor.continue();
      } else {
        resolve(projects);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// Delete project
export const deleteProjectFromDB = async (projectId: string): Promise<void> => {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readwrite');
    const store = transaction.objectStore(STORE_PROJECTS);
    const request = store.delete(projectId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// Delete file
export const deleteFileFromDB = async (fileId: string): Promise<void> => {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_FILES], 'readwrite');
    const store = transaction.objectStore(STORE_FILES);
    const request = store.delete(fileId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

// Get project file
export const getProjectFile = async (projectId: string): Promise<File | null> => {
  const db = await initDatabase();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_PROJECTS], 'readonly');
    const store = transaction.objectStore(STORE_PROJECTS);
    const request = store.get(projectId);

    request.onsuccess = async () => {
      const result = request.result;
      if (result && result.fileId) {
        try {
          const file = await loadFile(result.fileId);
          resolve(file);
        } catch (error) {
          reject(error);
        }
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
};

