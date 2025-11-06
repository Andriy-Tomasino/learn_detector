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

  const drawRectangles = (ctx: CanvasRenderingContext2D, rects: Rectangle[]) => {
    rects.forEach((rect, index) => {
      const isSelected = selectedRectIndex === index;
      
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      // Малюємо ручки для зміни розміру
      const handleSize = 8;
      ctx.fillStyle = isSelected ? '#007bff' : '#00ff00';
      ctx.fillRect(rect.x - handleSize / 2, rect.y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.w - handleSize / 2, rect.y - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x - handleSize / 2, rect.y + rect.h - handleSize / 2, handleSize, handleSize);
      ctx.fillRect(rect.x + rect.w - handleSize / 2, rect.y + rect.h - handleSize / 2, handleSize, handleSize);

      // Відображаємо розмірність бокса посередині
      const text = `${Math.round(rect.w)} × ${Math.round(rect.h)}`;
      ctx.font = '12px monospace';
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = 12;
      
      // Центруємо текст
      const textX = rect.x + rect.w / 2 - textWidth / 2;
      const textY = rect.y + rect.h / 2 + textHeight / 2;
      
      // Фон для тексту для кращої читабельності
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(textX - 2, textY - textHeight - 2, textWidth + 4, textHeight + 4);
      
      // Текст
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, textX, textY);
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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || !imageRef.current) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imageRef.current, 0, 0);
    drawRectangles(ctx, rectangles);
    if (points.length > 0 || hoverPoint) {
      drawPoints(ctx, points, hoverPoint);
    }
  }, [rectangles, points, hoverPoint, selectedRectIndex]);

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

