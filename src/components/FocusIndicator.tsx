import React from 'react';

interface FocusIndicatorProps {
  isRecording: boolean;
}

const FocusIndicator: React.FC<FocusIndicatorProps> = ({ isRecording }) => {
  return (
    <div
      className={`
        absolute top-2 right-2 z-10
        px-1.5 py-0.5 rounded
        text-[9px] font-mono uppercase tracking-wider
        bg-accent text-void
        ${isRecording ? 'animate-pulse' : ''}
      `}
    >
      Voice
    </div>
  );
};

export default FocusIndicator;
