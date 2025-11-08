import { useRef, useEffect, useState } from 'react';
import { Rectangle } from '../utils/storage';
import { RectangleTool } from './RectangleTool';

type CreationMode = 'drag' | '2points' | '4points';

interface FrameViewerProps {
  frameImage: string | null;
  frameIndex: number;
  totalFrames: number;
  rectangles: Rectangle[];
  onRectanglesChange: (rectangles: Rectangle[]) => void;
  creationMode: CreationMode;
  onCreationModeChange?: (mode: CreationMode) => void;
  selectedRectIndex: number | null;
  onRectSelect: (index: number | null) => void;
  isDetecting?: boolean;
  screenLayout?: { screens: number } | null;
  xmlAnnotations?: { [screenNumber: number]: any } | null;
  currentScreenNumber?: number;
  rectangleLabels?: { [index: number]: string }; // Назви об'єктів для відображення
}

export const FrameViewer: React.FC<FrameViewerProps> = ({
  frameImage,
  frameIndex,
  totalFrames,
  rectangles,
  onRectanglesChange,
  creationMode,
  onCreationModeChange,
  selectedRectIndex,
  onRectSelect,
  isDetecting = false,
  screenLayout = null,
  xmlAnnotations = null,
  currentScreenNumber = 1,
  rectangleLabels = {},
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !frameImage) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      imageRef.current = img;
      
      // Малюємо rectangles одразу після завантаження зображення, щоб уникнути затримки
      if (!isDetecting) {
        drawRectangles(ctx, rectangles);
        // Малюємо XML розмітку, якщо rectangles порожні
        if (xmlAnnotations && screenLayout && rectangles.length === 0) {
          drawXmlBoundingBoxes(ctx, canvas.width, canvas.height);
        }
      }
    };
    img.src = frameImage;
  }, [frameImage, rectangles, isDetecting, screenLayout, xmlAnnotations, frameIndex]);

  const drawXmlBoundingBoxes = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    if (!xmlAnnotations || !screenLayout) {
      return;
    }
    
    // Якщо rectangles вже є для цього фрейму, не малюємо XML бокси
    // (rectangles вже містять всю необхідну інформацію)
    if (rectangles.length > 0) {
      return;
    }

    // Визначаємо номер екрана на основі позиції фрейму
    const screens = screenLayout.screens;
    let screenNum = currentScreenNumber;
    let boxes: any[] = [];
    
    // Якщо кілька екранів, визначаємо екран на основі індексу фрейму
    if (screens > 1) {
      // Розраховуємо кількість фреймів на екран
      const framesPerScreen: number[] = [];
      for (let i = 1; i <= screens; i++) {
        const screenKey = `screen_${i}`;
        const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
        framesPerScreen.push(framesCount);
      }
      
      // Визначаємо, до якого екрана належить поточний фрейм
      let accumulatedFrames = 0;
      for (let i = 0; i < framesPerScreen.length; i++) {
        if (frameIndex < accumulatedFrames + framesPerScreen[i]) {
          screenNum = i + 1;
          break;
        }
        accumulatedFrames += framesPerScreen[i];
      }
      
      // Локальний індекс фрейму в межах екрана
      let localFrameIndex = frameIndex - accumulatedFrames;
      if (screenNum > 1) {
        let prevFrames = 0;
        for (let i = 0; i < screenNum - 1; i++) {
          prevFrames += framesPerScreen[i];
        }
        localFrameIndex = frameIndex - prevFrames;
      }
      
      const annotation = xmlAnnotations[screenNum];
      if (!annotation) return;

      // Шукаємо бокси для локального індексу фрейму в межах екрана
      boxes = annotation.frames[localFrameIndex.toString()] || [];
      
      // Якщо не знайдено, спробуємо знайти за глобальним індексом
      if (boxes.length === 0) {
        boxes = annotation.frames[frameIndex.toString()] || [];
      }
      
      // Якщо все ще не знайдено, спробуємо знайти найближчий фрейм
      if (boxes.length === 0) {
        const frameKeys = Object.keys(annotation.frames).map(k => parseInt(k)).sort((a, b) => a - b);
        if (frameKeys.length > 0) {
          const closestFrame = frameKeys.reduce((prev, curr) => 
            Math.abs(curr - localFrameIndex) < Math.abs(prev - localFrameIndex) ? curr : prev
          );
          if (Math.abs(closestFrame - localFrameIndex) <= 5) {
            boxes = annotation.frames[closestFrame.toString()] || [];
          }
        }
      }
    } else {
      // Один екран - використовуємо frameIndex напряму
      const annotation = xmlAnnotations[1];
      if (!annotation) {
        return;
      }
      
      const frameKeys = Object.keys(annotation.frames);
      const numericFrameKeys = frameKeys.map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
      
      // Знаходимо offset (мінімальний індекс фрейму в XML)
      const frameOffset = numericFrameKeys.length > 0 ? numericFrameKeys[0] : 0;
      const adjustedFrameIndex = frameIndex + frameOffset;

      // Шукаємо бокси для поточного фрейму з урахуванням offset
      boxes = annotation.frames[adjustedFrameIndex.toString()] || [];
      
      // Якщо не знайдено, спробуємо знайти найближчий фрейм
      if (boxes.length === 0 && numericFrameKeys.length > 0) {
        const closestFrame = numericFrameKeys.reduce((prev, curr) => 
          Math.abs(curr - adjustedFrameIndex) < Math.abs(prev - adjustedFrameIndex) ? curr : prev
        );
        const diff = Math.abs(closestFrame - adjustedFrameIndex);
        
        // Використовуємо бокси якщо різниця невелика (в межах 10 фреймів)
        if (diff <= 10) {
          boxes = annotation.frames[closestFrame.toString()] || [];
        }
      }
    }
    
    // Малюємо бокси з урахуванням статусу відповідних rectangles
    boxes.forEach((box: any, index: number) => {
      // Перевіряємо, чи координати в межах canvas
      if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
        return;
      }
      
      // Перевіряємо, чи координати не виходять за межі canvas
      if (box.x > canvasWidth || box.y > canvasHeight) {
        return;
      }
      
      // Шукаємо відповідний rectangle за координатами (з невеликою толерантністю)
      let status: 'attack' | 'reject' | 'hold' | null = null;
      const tolerance = 5; // Допустима різниця в координатах
      
      for (const rect of rectangles) {
        if (Math.abs(rect.x - box.x) <= tolerance &&
            Math.abs(rect.y - box.y) <= tolerance &&
            Math.abs(rect.w - box.width) <= tolerance &&
            Math.abs(rect.h - box.height) <= tolerance) {
          status = rect.status || null;
          break;
        }
      }
      
      // Якщо не знайдено за координатами, спробуємо за індексом
      if (status === null && rectangles[index]) {
        status = rectangles[index].status || null;
      }
      
      // Визначаємо колір та стиль залежно від статусу
      let strokeColor = '#00ff00'; // Стандартний зелений
      let lineWidth = 2;
      
      if (status === 'attack') {
        strokeColor = '#ff0000'; // Червоний для attack
        lineWidth = 3;
      } else if (status === 'reject') {
        // Не малюємо reject об'єкти
        return;
      }
      
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(box.x, box.y, box.width, box.height);
      
      // Малюємо перехрестя для attack
      if (status === 'attack') {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(box.x, box.y);
        ctx.lineTo(box.x + box.width, box.y + box.height);
        ctx.moveTo(box.x + box.width, box.y);
        ctx.lineTo(box.x, box.y + box.height);
        ctx.stroke();
      }
      
      // Малюємо назву об'єкта зверху боксу (для XML боксів використовуємо індекс)
      const xmlLabel = `${currentScreenNumber}_${index + 1}`;
      ctx.fillStyle = strokeColor;
      ctx.font = '14px Arial';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      
      // Вимірюємо текст для створення фону
      const textMetrics = ctx.measureText(xmlLabel);
      const textWidth = textMetrics.width;
      const textHeight = 18;
      const padding = 4;
      
      // Малюємо напівпрозорий фон для тексту
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(
        box.x,
        box.y - textHeight - padding,
        textWidth + padding * 2,
        textHeight
      );
      
      // Малюємо текст
      ctx.fillStyle = '#ffffff';
      ctx.fillText(
        xmlLabel,
        box.x + padding,
        box.y - textHeight - padding + 2
      );
    });
  };

  const drawRectangles = (ctx: CanvasRenderingContext2D, rects: Rectangle[]) => {
    rects.forEach((rect, index) => {
      const isSelected = selectedRectIndex === index;
      const status = rect.status || 'hold';
      
      // Якщо статус reject - не малюємо
      if (status === 'reject') {
        return;
      }
      
      // Перевіряємо координати
      if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0) {
        return;
      }
      
      // Визначаємо колір та стиль залежно від статусу
      // Статус attack має пріоритет над вибором
      let strokeColor = '#00ff00'; // Стандартний зелений
      let lineWidth = 2;
      
      if (status === 'attack') {
        // Для attack завжди червоний колір, незалежно від вибору
        strokeColor = '#ff0000';
        lineWidth = 3;
      }
      // Для hold завжди зелений, навіть якщо вибраний (без синьої рамки)
      
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      // Малюємо перехрестя для attack (завжди червоним)
      if (status === 'attack') {
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        // Діагональні лінії
        ctx.beginPath();
        ctx.moveTo(rect.x, rect.y);
        ctx.lineTo(rect.x + rect.w, rect.y + rect.h);
        ctx.moveTo(rect.x + rect.w, rect.y);
        ctx.lineTo(rect.x, rect.y + rect.h);
        ctx.stroke();
      }

      // Малюємо назву об'єкта зверху боксу
      const label = rectangleLabels[index];
      if (label) {
        ctx.fillStyle = strokeColor; // Використовуємо колір боксу для фону тексту
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        // Вимірюємо текст для створення фону
        const textMetrics = ctx.measureText(label);
        const textWidth = textMetrics.width;
        const textHeight = 18;
        const padding = 4;
        
        // Малюємо напівпрозорий фон для тексту
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(
          rect.x,
          rect.y - textHeight - padding,
          textWidth + padding * 2,
          textHeight
        );
        
        // Малюємо текст
        ctx.fillStyle = '#ffffff';
        ctx.fillText(
          label,
          rect.x + padding,
          rect.y - textHeight - padding + 2
        );
      }

      // Ручки для зміни розміру не малюються для hold та attack
      // Hold - режим відкату, не дозволяє змінювати об'єкт
      // Attack - режим атаки, не дозволяє змінювати об'єкт
    });
  };

  const drawPoints = (ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], hover: { x: number; y: number } | null) => {
    const pointSize = 6;
    const lineWidth = 2;

    // Малюємо лінії між точками
    if (points.length > 1) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      if (hover) {
        ctx.lineTo(hover.x, hover.y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Малюємо точки
    points.forEach((point, index) => {
      ctx.fillStyle = index === points.length - 1 ? '#ff0000' : '#ffff00';
      ctx.beginPath();
      ctx.arc(point.x, point.y, pointSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // Малюємо hover точку
    if (hover) {
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(hover.x, hover.y, pointSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  };

  const drawScreenLayout = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    if (!screenLayout || !isDetecting) return;
    
    const screens = screenLayout.screens;
    if (screens === 0) return;

    ctx.strokeStyle = '#4caf50';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);

    if (screens === 1) {
      // Один екран - без розділення
      return;
    } else if (screens === 2) {
      // Два екрани - вертикальне розділення
      const midX = canvasWidth / 2;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, canvasHeight);
      ctx.stroke();
    } else if (screens === 3) {
      // Три екрани - 2x2 з одним порожнім
      const midX = canvasWidth / 2;
      const midY = canvasHeight / 2;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, canvasHeight);
      ctx.moveTo(0, midY);
      ctx.lineTo(midX, midY);
      ctx.stroke();
    } else if (screens === 4) {
      // Чотири екрани - 2x2
      const midX = canvasWidth / 2;
      const midY = canvasHeight / 2;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, canvasHeight);
      ctx.moveTo(0, midY);
      ctx.lineTo(canvasWidth, midY);
      ctx.stroke();
    }

    ctx.setLineDash([]);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || !imageRef.current) return;

    // Малюємо безпосередньо для миттєвого відображення
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);
    
    // Малюємо XML розмітку спочатку (якщо вона є)
    // Тільки коли isDetecting = false (приховуємо при натисканні Detecting)
    if (xmlAnnotations && screenLayout && !isDetecting) {
      drawXmlBoundingBoxes(ctx, canvas.width, canvas.height);
    }
    
    // Малюємо rectangles поверх XML боксів (щоб вони завжди були видимі та мали пріоритет)
    // Тільки коли isDetecting = false (приховуємо при натисканні Detecting)
    if (!isDetecting) {
      drawRectangles(ctx, rectangles);
    }
    if (points.length > 0 || hoverPoint) {
      drawPoints(ctx, points, hoverPoint);
    }
    // Малюємо розділення екранів тільки коли isDetecting = true
    if (isDetecting && screenLayout) {
      drawScreenLayout(ctx, canvas.width, canvas.height);
      // Переконуємося, що після drawScreenLayout лінії не пунктирні
      ctx.setLineDash([]);
    }
  }, [rectangles, points, hoverPoint, selectedRectIndex, isDetecting, screenLayout, xmlAnnotations, frameIndex, totalFrames, currentScreenNumber, frameImage]);

  // Слухаємо події від RectangleTool
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlePointsChanged = (e: CustomEvent) => {
      setPoints(e.detail.points || []);
      setHoverPoint(e.detail.hover || null);
    };

    canvas.addEventListener('pointsChanged', handlePointsChanged as EventListener);

    return () => {
      canvas.removeEventListener('pointsChanged', handlePointsChanged as EventListener);
    };
  }, []);

  return (
    <div className="canvas-container">
      <canvas ref={canvasRef} style={{ cursor: 'crosshair' }} />
      {canvasRef.current && (
        <RectangleTool
          canvas={canvasRef.current}
          rectangles={rectangles}
          onRectanglesChange={onRectanglesChange}
          creationMode={creationMode}
          onCreationModeChange={onCreationModeChange}
          selectedRectIndex={selectedRectIndex}
          onRectSelect={onRectSelect}
        />
      )}
    </div>
  );
};

