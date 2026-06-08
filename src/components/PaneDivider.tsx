import React, { useCallback, useRef } from 'react';

interface PaneDividerProps {
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
  onEqualize: () => void;
}

const PaneDivider: React.FC<PaneDividerProps> = ({ direction, onResize, onEqualize }) => {
  const startPos = useRef(0);
  const isHorizontal = direction === 'horizontal';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startPos.current = isHorizontal ? e.clientY : e.clientX;

      const handleMouseMove = (e: MouseEvent) => {
        const current = isHorizontal ? e.clientY : e.clientX;
        const delta = current - startPos.current;
        startPos.current = current;
        onResize(delta);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isHorizontal, onResize],
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      const touch = e.touches[0];
      startPos.current = isHorizontal ? touch.clientY : touch.clientX;

      const handleTouchMove = (e: TouchEvent) => {
        const touch = e.touches[0];
        const current = isHorizontal ? touch.clientY : touch.clientX;
        const delta = current - startPos.current;
        startPos.current = current;
        onResize(delta);
      };

      const handleTouchEnd = () => {
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };

      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
    },
    [isHorizontal, onResize],
  );

  return (
    <div
      className={`${isHorizontal ? 'h-1 w-full cursor-row-resize' : 'w-1 h-full cursor-col-resize'} bg-chrome/20 hover:bg-acid/50 transition-colors duration-100 flex-shrink-0`}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      onDoubleClick={onEqualize}
    />
  );
};

export default PaneDivider;
