// Парсинг XML для отримання розмітки (bounding boxes)

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  frame?: number;
  id?: string;
  class?: string;
}

export interface ParsedAnnotation {
  frames: { [key: string]: BoundingBox[] };
}

// Парсить XML файл та повертає структуру з bounding boxes (CVAT формат)
export const parseXmlAnnotations = async (xmlContent: string): Promise<ParsedAnnotation> => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlContent, 'text/xml');

  // Перевірка на помилки парсингу
  const parseError = xmlDoc.querySelector('parsererror');
  if (parseError) {
    throw new Error('XML parsing error: ' + parseError.textContent);
  }

  const annotations: ParsedAnnotation = { frames: {} };

  // CVAT формат: <annotations> -> <track> -> <box>
  const tracks = xmlDoc.querySelectorAll('track');
  
  if (tracks.length > 0) {
    // CVAT формат для відео
    tracks.forEach((track) => {
      const label = track.getAttribute('label') || 'object';
      const trackId = track.getAttribute('id') || '';
      
      const boxes = track.querySelectorAll('box');
      boxes.forEach((box) => {
        const frame = box.getAttribute('frame') || '0';
        const outside = box.getAttribute('outside');
        
        // Пропускаємо бокси, які поза кадром
        if (outside === '1') return;
        
        const xtl = parseFloat(box.getAttribute('xtl') || '0');
        const ytl = parseFloat(box.getAttribute('ytl') || '0');
        const xbr = parseFloat(box.getAttribute('xbr') || '0');
        const ybr = parseFloat(box.getAttribute('ybr') || '0');
        
        if (!annotations.frames[frame]) {
          annotations.frames[frame] = [];
        }
        
        annotations.frames[frame].push({
          x: xtl,
          y: ytl,
          width: xbr - xtl,
          height: ybr - ytl,
          frame: parseInt(frame),
          id: `${trackId}_${frame}`,
          class: label,
        });
      });
    });
  } else {
    // Альтернативний формат - шукаємо об'єкти з bndbox
    const objects = xmlDoc.querySelectorAll('object');
    objects.forEach((obj, index) => {
      const bndbox = obj.querySelector('bndbox');
      if (bndbox) {
        const xmin = parseFloat(bndbox.querySelector('xmin')?.textContent || '0');
        const ymin = parseFloat(bndbox.querySelector('ymin')?.textContent || '0');
        const xmax = parseFloat(bndbox.querySelector('xmax')?.textContent || '0');
        const ymax = parseFloat(bndbox.querySelector('ymax')?.textContent || '0');
        
        const frame = obj.querySelector('frame')?.textContent || obj.getAttribute('frame') || '0';
        const name = obj.querySelector('name')?.textContent || obj.getAttribute('name') || 'object';
        
        if (!annotations.frames[frame]) {
          annotations.frames[frame] = [];
        }
        
        annotations.frames[frame].push({
          x: xmin,
          y: ymin,
          width: xmax - xmin,
          height: ymax - ymin,
          frame: parseInt(frame),
          id: obj.getAttribute('id') || `obj_${index}`,
          class: name,
        });
      }
    });
  }

  return annotations;
};

