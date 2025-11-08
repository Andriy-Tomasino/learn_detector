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
      drawRectangles(ctx, rectangles);
    };
    img.src = frameImage;
  }, [frameImage, rectangles]);

  const drawXmlBoundingBoxes = (ctx: CanvasRenderingContext2D, canvasWidth: number, canvasHeight: number) => {
    if (!xmlAnnotations || !screenLayout) {
      console.log('drawXmlBoundingBoxes пропущено - немає xmlAnnotations або screenLayout');
      return;
    }
    
    console.log(`drawXmlBoundingBoxes для фрейму ${frameIndex}:`, {
      xmlAnnotationsKeys: Object.keys(xmlAnnotations),
      screenLayout
    });

    // Визначаємо номер екрана на основі позиції фрейму
    const screens = screenLayout.screens;
    let screenNum = currentScreenNumber;
    
    // Якщо кілька екранів, визначаємо екран на основі індексу фрейму
    if (screens > 1) {
      // Розраховуємо кількість фреймів на екран
      // Спочатку знаходимо загальну кількість фреймів для кожного екрана
      const framesPerScreen: number[] = [];
      let totalFramesCount = 0;
      for (let i = 1; i <= screens; i++) {
        const screenKey = `screen_${i}`;
        const framesCount = parseInt(localStorage.getItem(`${screenKey}_frames_count`) || '0');
        framesPerScreen.push(framesCount);
        totalFramesCount += framesCount;
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
      // Спробуємо знайти за локальним індексом
      let boxes = annotation.frames[localFrameIndex.toString()] || [];
      
      // Якщо не знайдено, спробуємо знайти за глобальним індексом
      if (boxes.length === 0) {
        boxes = annotation.frames[frameIndex.toString()] || [];
      }
      
      // Якщо все ще не знайдено, спробуємо знайти найближчий фрейм
      if (boxes.length === 0) {
        const frameKeys = Object.keys(annotation.frames).map(k => parseInt(k)).sort((a, b) => a - b);
        if (frameKeys.length > 0) {
          // Знаходимо найближчий фрейм
          const closestFrame = frameKeys.reduce((prev, curr) => 
            Math.abs(curr - localFrameIndex) < Math.abs(prev - localFrameIndex) ? curr : prev
          );
          // Використовуємо бокси тільки якщо різниця невелика (в межах 5 фреймів)
          if (Math.abs(closestFrame - localFrameIndex) <= 5) {
            boxes = annotation.frames[closestFrame.toString()] || [];
          }
        }
      }
      
      if (boxes.length > 0) {
        console.log(`Знайдено ${boxes.length} боксів для фрейму ${frameIndex} (екран ${screenNum}, локальний ${localFrameIndex})`);
      }
      
      boxes.forEach((box: any, index: number) => {
        // Перевіряємо, чи координати в межах canvas
        if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
          console.warn(`Невірні координати боксу ${index}:`, box);
          return;
        }
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Малюємо текст з інформацією
        if (box.class) {
          ctx.fillStyle = '#00ff00';
          ctx.font = '14px Arial';
          ctx.fillText(
            box.class,
            box.x,
            box.y > 20 ? box.y - 5 : box.y + 20
          );
        }
      });
      
      if (boxes.length > 0) {
        console.log(`Намальовано ${boxes.length} боксів для фрейму ${frameIndex} (екран ${screenNum})`);
      }
    } else {
      // Один екран - використовуємо frameIndex напряму
      const annotation = xmlAnnotations[1];
      if (!annotation) {
        console.log(`Немає XML анотації для екрана 1, фрейм ${frameIndex}`);
        return;
      }
      
      const frameKeys = Object.keys(annotation.frames);
      const numericFrameKeys = frameKeys.map(k => parseInt(k)).filter(k => !isNaN(k)).sort((a, b) => a - b);
      
      // Знаходимо offset (мінімальний індекс фрейму в XML)
      const frameOffset = numericFrameKeys.length > 0 ? numericFrameKeys[0] : 0;
      const adjustedFrameIndex = frameIndex + frameOffset;
      
      console.log(`XML анотація для екрана 1:`, {
        frameKeys: frameKeys.slice(0, 10),
        totalFrames: frameKeys.length,
        frameOffset,
        lookingForFrame: frameIndex,
        adjustedFrameIndex
      });

      // Шукаємо бокси для поточного фрейму з урахуванням offset
      let boxes = annotation.frames[adjustedFrameIndex.toString()] || [];
      console.log(`Пошук боксів для фрейму ${frameIndex} (з offset ${frameOffset} = ${adjustedFrameIndex}): знайдено ${boxes.length} боксів`);
      
      // Якщо не знайдено, спробуємо знайти найближчий фрейм
      if (boxes.length === 0 && numericFrameKeys.length > 0) {
        const closestFrame = numericFrameKeys.reduce((prev, curr) => 
          Math.abs(curr - adjustedFrameIndex) < Math.abs(prev - adjustedFrameIndex) ? curr : prev
        );
        const diff = Math.abs(closestFrame - adjustedFrameIndex);
        console.log(`Найближчий фрейм: ${closestFrame}, різниця: ${diff}`);
        
        // Використовуємо бокси якщо різниця невелика (в межах 10 фреймів)
        if (diff <= 10) {
          boxes = annotation.frames[closestFrame.toString()] || [];
          console.log(`Використовуємо бокси з найближчого фрейму ${closestFrame}: ${boxes.length} боксів`);
        } else {
          console.log(`Різниця занадто велика (${diff}), не використовуємо бокси`);
        }
      }
      
      if (boxes.length > 0) {
        console.log(`✅ Знайдено ${boxes.length} боксів для фрейму ${frameIndex} (екран 1)`);
        console.log(`Перший бокси:`, boxes[0]);
      } else {
        console.log(`❌ Бокси не знайдено для фрейму ${frameIndex}`);
      }
      
      boxes.forEach((box: any, index: number) => {
        // Перевіряємо, чи координати в межах canvas
        if (box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0) {
          console.warn(`Невірні координати боксу ${index}:`, box);
          return;
        }
        
        // Перевіряємо, чи координати не виходять за межі canvas
        if (box.x > canvasWidth || box.y > canvasHeight) {
          console.warn(`Бокс ${index} виходить за межі canvas:`, box, `canvas: ${canvasWidth}x${canvasHeight}`);
          return;
        }
        
        console.log(`Малюю бокси ${index}: x=${box.x}, y=${box.y}, w=${box.width}, h=${box.height}`);
        
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 3; // Збільшуємо товщину для кращої видимості
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Малюємо текст з інформацією
        if (box.class) {
          ctx.fillStyle = '#00ff00';
          ctx.font = '14px Arial';
          ctx.fillText(
            box.class,
            box.x,
            box.y > 20 ? box.y - 5 : box.y + 20
          );
        }
      });
      
      if (boxes.length > 0) {
        console.log(`✅ Намальовано ${boxes.length} боксів для фрейму ${frameIndex} (екран 1)`);
      } else {
        console.log(`❌ Бокси не намальовано для фрейму ${frameIndex}`);
      }
    }
  };

  const drawRectangles = (ctx: CanvasRenderingContext2D, rects: Rectangle[]) => {
    if (rects.length > 0) {
      console.log(`Малювання ${rects.length} rectangles:`, rects);
    }
    
    rects.forEach((rect, index) => {
      const isSelected = selectedRectIndex === index;
      
      // Перевіряємо координати
      if (rect.x < 0 || rect.y < 0 || rect.w <= 0 || rect.h <= 0) {
        console.warn(`Невірні координати rectangle ${index}:`, rect);
        return;
      }
      
      ctx.strokeStyle = isSelected ? '#007bff' : '#00ff00';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      // Малюємо ручки для зміни розміру
      const handleSize = 8;
      ctx.fillStyle = isSelected ? '#007bff' : '#00ff00';
      ctx.fillRect(rect.x - handleSize / 2, rect.y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.w - handleSize / 2, rect.y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x - handleSize / 2, rect.y + rect.h - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.w - handleSize / 2, rect.y + rect.h - handleSize / 2, handleSize, handleSize);
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

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);
    
    console.log(`Малювання фрейму ${frameIndex}:`, {
      rectanglesCount: rectangles.length,
      hasXmlAnnotations: !!xmlAnnotations,
      hasScreenLayout: !!screenLayout,
      canvasSize: `${canvas.width}x${canvas.height}`
    });
    
    drawRectangles(ctx, rectangles);
    if (points.length > 0 || hoverPoint) {
      drawPoints(ctx, points, hoverPoint);
    }
    // Малюємо XML розмітку, якщо вона є (незалежно від isDetecting)
    if (xmlAnnotations && screenLayout) {
      if (isDetecting) {
        drawScreenLayout(ctx, canvas.width, canvas.height);
      }
      drawXmlBoundingBoxes(ctx, canvas.width, canvas.height);
    }
  }, [rectangles, points, hoverPoint, selectedRectIndex, isDetecting, screenLayout, xmlAnnotations, frameIndex, totalFrames, currentScreenNumber]);

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

