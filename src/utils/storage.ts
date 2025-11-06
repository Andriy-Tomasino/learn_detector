export interface Rectangle {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Annotations {
  frames: {
    [frameIndex: string]: Rectangle[];
  };
}

const STORAGE_KEY = 'video-annotations';

export const saveAnnotations = (annotations: Annotations): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(annotations));
  } catch (error) {
    console.error('Помилка збереження анотацій:', error);
  }
};

export const loadAnnotations = (): Annotations => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.error('Помилка завантаження анотацій:', error);
  }
  return { frames: {} };
};

export const clearAnnotations = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Помилка очищення анотацій:', error);
  }
};

export const exportAnnotations = (annotations: Annotations): void => {
  const json = JSON.stringify(annotations, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'annotations.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

