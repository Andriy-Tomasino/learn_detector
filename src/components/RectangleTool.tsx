import { useRef, useEffect, useState, useCallback } from 'react';
import { Rectangle } from '../utils/storage';

type CreationMode = 'drag' | '2points' | '4points';

interface RectangleToolProps {
  canvas: HTMLCanvasElement | null;
  rectangles: Rectangle[];
  onRectanglesChange: (rectangles: Rectangle[]) => void;
  creationMode: CreationMode;
  onCreationModeChange?: (mode: CreationMode) => void;
  selectedRectIndex: number | null;
  onRectSelect: (index: number | null) => void;
}

type DragMode = 'none' | 'create' | 'move' | 'resize' | 'collecting-points';
type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | null;

const HANDLE_SIZE = 8;
const POINT_SIZE = 6;

export const RectangleTool: React.FC<RectangleToolProps> = ({
  canvas,
  rectangles,
  onRectanglesChange,
  creationMode,
  onCreationModeChange,
  selectedRectIndex,
  onRectSelect,
}) => {
  const [dragMode, setDragMode] = useState<DragMode>('none');
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const creatingRectIndexRef = useRef<number | null>(null);

  const getCanvasCoordinates = useCallback(
    (e: MouseEvent): { x: number; y: number } | null => {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      return {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
    },
    [canvas]
  );

  const getResizeHandle = useCallback(
    (rect: Rectangle, x: number, y: number): ResizeHandle => {
      const threshold = HANDLE_SIZE * 2;
      if (
        Math.abs(x - rect.x) < threshold &&
        Math.abs(y - rect.y) < threshold
      ) {
        return 'nw';
      }
      if (
        Math.abs(x - (rect.x + rect.w)) < threshold &&
        Math.abs(y - rect.y) < threshold
      ) {
        return 'ne';
      }
      if (
        Math.abs(x - rect.x) < threshold &&
        Math.abs(y - (rect.y + rect.h)) < threshold
      ) {
        return 'sw';
      }
      if (
        Math.abs(x - (rect.x + rect.w)) < threshold &&
        Math.abs(y - (rect.y + rect.h)) < threshold
      ) {
        return 'se';
      }
      return null;
    },
    []
  );

  const isPointInRectangle = useCallback(
    (x: number, y: number, rect: Rectangle): boolean => {
      return (
        x >= rect.x &&
        x <= rect.x + rect.w &&
        y >= rect.y &&
        y <= rect.y + rect.h
      );
    },
    []
  );

  // Перевірка чи точка на лінії (стороні) прямокутника
  const isPointOnRectangleEdge = useCallback(
    (x: number, y: number, rect: Rectangle, threshold: number = 5): boolean => {
      const onLeftEdge = Math.abs(x - rect.x) < threshold && y >= rect.y && y <= rect.y + rect.h;
      const onRightEdge = Math.abs(x - (rect.x + rect.w)) < threshold && y >= rect.y && y <= rect.y + rect.h;
      const onTopEdge = Math.abs(y - rect.y) < threshold && x >= rect.x && x <= rect.x + rect.w;
      const onBottomEdge = Math.abs(y - (rect.y + rect.h)) < threshold && x >= rect.x && x <= rect.x + rect.w;
      
      return onLeftEdge || onRightEdge || onTopEdge || onBottomEdge;
    },
    []
  );

  // Створення прямокутника з точок
  const createRectFromPoints = useCallback(
    (points: { x: number; y: number }[]): Rectangle | null => {
      if (points.length === 0) return null;

      if (points.length === 2) {
        // 2 точки - діагональ
        const x1 = points[0].x;
        const y1 = points[0].y;
        const x2 = points[1].x;
        const y2 = points[1].y;
        return {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          w: Math.abs(x2 - x1),
          h: Math.abs(y2 - y1),
        };
      } else if (points.length === 4) {
        // 4 точки - кути
        const xs = points.map((p) => p.x);
        const ys = points.map((p) => p.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        return {
          x: minX,
          y: minY,
          w: maxX - minX,
          h: maxY - minY,
        };
      }
      return null;
    },
    []
  );

  const handleMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!canvas) return;
      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      // Перевірка на правий клік для видалення або скасування збору точок
      if (e.button === 2) {
        e.preventDefault();
        
        // Якщо збираємо точки - скасовуємо
        if (dragMode === 'collecting-points') {
          setPoints([]);
          setDragMode('none');
          return;
        }
        
        const clickedIndex = rectangles.findIndex((rect) =>
          isPointInRectangle(coords.x, coords.y, rect)
        );
        if (clickedIndex !== -1) {
          const newRects = rectangles.filter((_, i) => i !== clickedIndex);
          onRectanglesChange(newRects);
          onRectSelect(null);
        }
        return;
      }

      if (e.button !== 0) return; // Тільки ліва кнопка миші

      // Режим створення через точки
      if (creationMode === '2points' || creationMode === '4points') {
        const requiredPoints = creationMode === '2points' ? 2 : 4;
        const newPoints = [...points, coords];
        setPoints(newPoints);

        if (newPoints.length === requiredPoints) {
          // Створюємо прямокутник
          const newRect = createRectFromPoints(newPoints);
          if (newRect && newRect.w > 10 && newRect.h > 10) {
            // Новий прямокутник завжди має статус hold за замовчуванням
            const rectWithStatus = { ...newRect, status: 'hold' as const };
            onRectanglesChange([...rectangles, rectWithStatus]);
            // Автоматично переходимо в режим drag після створення
            if (onCreationModeChange) {
              onCreationModeChange('drag');
            }
          }
          setPoints([]);
          setDragMode('none');
        } else {
          setDragMode('collecting-points');
        }
        return;
      }

      // Звичайний режим drag (якщо не в режимі точок)
      if (creationMode !== 'drag') return;

      // Перевірка чи клікнули на ручку зміни розміру
      // Не дозволяємо змінювати розмір для об'єктів зі статусом hold або attack
      let clickedRectIndex: number | null = null;
      let handle: ResizeHandle = null;

      for (let i = rectangles.length - 1; i >= 0; i--) {
        const rect = rectangles[i];
        const status = rect.status || 'hold';
        // Не дозволяємо змінювати розмір для hold та attack
        if (status === 'hold' || status === 'attack') continue;
        
        handle = getResizeHandle(rect, coords.x, coords.y);
        if (handle) {
          clickedRectIndex = i;
          break;
        }
      }

      if (clickedRectIndex !== null && handle) {
        setDragMode('resize');
        onRectSelect(clickedRectIndex);
        setResizeHandle(handle);
        setDragStart(coords);
        return;
      }

      // Перевірка чи клікнули на лінію (сторону) прямокутника для переміщення
      // Не дозволяємо переміщувати об'єкти зі статусом hold або attack
      clickedRectIndex = null;
      for (let i = rectangles.length - 1; i >= 0; i--) {
        const rect = rectangles[i];
        const status = rect.status || 'hold';
        // Не дозволяємо переміщувати для hold та attack
        if (status === 'hold' || status === 'attack') continue;
        
        // Перевіряємо чи на лінії, але не на куті
        if (isPointOnRectangleEdge(coords.x, coords.y, rect) && !getResizeHandle(rect, coords.x, coords.y)) {
          clickedRectIndex = i;
          break;
        }
      }

      if (clickedRectIndex !== null) {
        setDragMode('move');
        onRectSelect(clickedRectIndex);
        const rect = rectangles[clickedRectIndex];
        setDragOffset({
          x: coords.x - rect.x,
          y: coords.y - rect.y,
        });
        setDragStart(coords);
        return;
      }

      // У режимі drag не створюємо нові прямокутники, тільки редагуємо існуючі
      // Скидаємо вибір при кліку поза об'єктами
      onRectSelect(null);
      return;
    },
    [
      canvas,
      rectangles,
      getCanvasCoordinates,
      isPointInRectangle,
      isPointOnRectangleEdge,
      getResizeHandle,
      onRectanglesChange,
      creationMode,
      points,
      dragMode,
      createRectFromPoints,
      onCreationModeChange,
      onRectSelect,
    ]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!canvas) return;
      const coords = getCanvasCoordinates(e);
      if (!coords) return;

      // Візуалізація точок під час збору
      if (dragMode === 'collecting-points' || (creationMode !== 'drag' && points.length > 0)) {
        // Викликаємо перемальовку через подію (буде оброблено в FrameViewer)
        canvas.dispatchEvent(new CustomEvent('pointsChanged', { detail: { points, hover: coords } }));
      } else if (points.length === 0) {
        // Очищаємо hover якщо немає точок
        canvas.dispatchEvent(new CustomEvent('pointsChanged', { detail: { points: [], hover: null } }));
      }

      // Оновлення курсора в режимі drag
      if (creationMode === 'drag' && dragMode === 'none') {
        let cursor = 'default';
        
        // Перевіряємо чи на ручці зміни розміру
        for (let i = rectangles.length - 1; i >= 0; i--) {
          const rect = rectangles[i];
          const handle = getResizeHandle(rect, coords.x, coords.y);
          if (handle) {
            const cursors: Record<ResizeHandle, string> = {
              'nw': 'nwse-resize',
              'ne': 'nesw-resize',
              'sw': 'nesw-resize',
              'se': 'nwse-resize',
            };
            cursor = cursors[handle] || 'default';
            break;
          }
          
          // Перевіряємо чи на лінії для переміщення
          if (isPointOnRectangleEdge(coords.x, coords.y, rect) && !getResizeHandle(rect, coords.x, coords.y)) {
            cursor = 'move';
            break;
          }
        }
        
        canvas.style.cursor = cursor;
      }

      if (dragMode === 'none' || !dragStart) return;

      if (dragMode === 'move' && selectedRectIndex !== null && dragOffset) {
        const newRects = [...rectangles];
        // Зберігаємо статус при переміщенні
        newRects[selectedRectIndex] = {
          ...newRects[selectedRectIndex],
          x: coords.x - dragOffset.x,
          y: coords.y - dragOffset.y,
        };
        onRectanglesChange(newRects);
      } else if (dragMode === 'resize' && selectedRectIndex !== null && resizeHandle) {
        const newRects = [...rectangles];
        const rect = newRects[selectedRectIndex];
        // Зберігаємо статус при зміні розміру
        let newRect: Rectangle = { ...rect };

        switch (resizeHandle) {
          case 'nw':
            newRect = {
              x: coords.x,
              y: coords.y,
              w: rect.x + rect.w - coords.x,
              h: rect.y + rect.h - coords.y,
            };
            break;
          case 'ne':
            newRect = {
              x: rect.x,
              y: coords.y,
              w: coords.x - rect.x,
              h: rect.y + rect.h - coords.y,
            };
            break;
          case 'sw':
            newRect = {
              x: coords.x,
              y: rect.y,
              w: rect.x + rect.w - coords.x,
              h: coords.y - rect.y,
            };
            break;
          case 'se':
            newRect = {
              x: rect.x,
              y: rect.y,
              w: coords.x - rect.x,
              h: coords.y - rect.y,
            };
            break;
        }

        // Перевірка мінімального розміру
        if (newRect.w > 10 && newRect.h > 10) {
          // Зберігаємо статус при зміні розміру
          newRects[selectedRectIndex] = {
            ...newRect,
            status: rect.status, // Зберігаємо статус
          };
          onRectanglesChange(newRects);
        }
      }
    },
    [
      canvas,
      dragMode,
      dragStart,
      rectangles,
      selectedRectIndex,
      dragOffset,
      resizeHandle,
      getCanvasCoordinates,
      onRectanglesChange,
      creationMode,
      points,
      isPointOnRectangleEdge,
      getResizeHandle,
      onRectSelect,
    ]
  );

  const handleMouseUp = useCallback(() => {
    if (dragMode !== 'collecting-points') {
      setDragMode('none');
      setDragStart(null);
      setDragOffset(null);
      setResizeHandle(null);
      creatingRectIndexRef.current = null;
    }
  }, [dragMode]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Delete' && selectedRectIndex !== null) {
        const newRects = rectangles.filter((_, i) => i !== selectedRectIndex);
        onRectanglesChange(newRects);
        onRectSelect(null);
      }
    },
    [selectedRectIndex, rectangles, onRectanglesChange, onRectSelect]
  );

  // Скидання точок при зміні режиму
  useEffect(() => {
    if (creationMode === 'drag') {
      setPoints([]);
      setDragMode('none');
    }
  }, [creationMode]);

  useEffect(() => {
    if (!canvas) return;

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('contextmenu', (e) => e.preventDefault());
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [canvas, handleMouseDown, handleMouseMove, handleMouseUp, handleKeyDown]);

  // Експортуємо точки для візуалізації
  useEffect(() => {
    if (canvas && points.length > 0) {
      canvas.dispatchEvent(new CustomEvent('pointsChanged', { detail: { points } }));
    }
  }, [canvas, points]);

  return null;
};

