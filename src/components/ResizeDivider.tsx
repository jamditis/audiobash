import React, { useState, useCallback, useRef } from 'react';

interface ResizeDividerProps {
  orientation: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  onResizeStart?: () => void;
  onResizeEnd?: () => void;
}

const ResizeDivider: React.FC<ResizeDividerProps> = ({
  orientation,
  onResize,
  onResizeStart,
  onResizeEnd,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const startPosRef = useRef(0);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const currentPos = orientation === 'horizontal' ? e.clientX : e.clientY;
    const delta = currentPos - startPosRef.current;
    startPosRef.current = currentPos;
    onResize(delta);
  }, [orientation, onResize]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    onResizeEnd?.();
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }, [onResizeEnd, handleMouseMove]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startPosRef.current = orientation === 'horizontal' ? e.clientX : e.clientY;
    onResizeStart?.();

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = orientation === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';
  };

  return (
    <div
      className={`
        flex-shrink-0 z-10 transition-colors
        ${orientation === 'horizontal' ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
        ${isDragging ? 'bg-accent' : 'bg-void-300 hover:bg-accent/70'}
      `}
      onMouseDown={handleMouseDown}
    />
  );
};

export default ResizeDivider;
