import React, { useState, useEffect } from 'react';

interface OnboardingProps {
  onComplete: () => void;
}

interface Step {
  title: string;
  content: string;
  highlight?: string;
  icon: React.ReactNode;
}

const TerminalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

const KeyboardIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 7.5A2.25 2.25 0 014.5 5.25h15a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25v-9zM7.5 9h.008v.008H7.5V9zm.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm2.25.75a.75.75 0 100-1.5.75.75 0 000 1.5zm3.75-.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm1.5.75a.75.75 0 100-1.5.75.75 0 000 1.5zm.75 1.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-3 .75a.75.75 0 100-1.5.75.75 0 000 1.5zm-2.25-.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-3 .75a.75.75 0 100-1.5.75.75 0 000 1.5zm10.5 2.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm-9 0a.75.75 0 100-1.5.75.75 0 000 1.5zM6 15a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm9.75-.75a.75.75 0 100-1.5.75.75 0 000 1.5zM9 15a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3-.75a.75.75 0 100-1.5.75.75 0 000 1.5z" />
  </svg>
);

const ChatIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
  </svg>
);

const GearIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const RocketIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
  </svg>
);

const steps: Step[] = [
  {
    title: 'Welcome to AudioBash',
    content: 'A voice-controlled terminal that puts you in command. Speak naturally, execute precisely.',
    icon: <TerminalIcon />,
  },
  {
    title: 'Your command center',
    content: 'The terminal is your workspace. Type commands directly, run scripts, or start Claude Code by typing "claude".',
    highlight: 'terminal',
    icon: <TerminalIcon />,
  },
  {
    title: 'Voice activation',
    content: 'Press Alt+S anytime to start voice input. A floating panel will appear with your audio visualizer.',
    highlight: 'shortcut',
    icon: <KeyboardIcon />,
  },
  {
    title: 'Speak naturally',
    content: 'In Agent mode, your speech is converted into CLI commands. Say "list all files in the current directory" and get "ls -la".',
    icon: <ChatIcon />,
  },
  {
    title: 'Configure your setup',
    content: 'Click the gear icon in the title bar to set your API key, choose your transcription model, and customize behavior.',
    highlight: 'settings',
    icon: <GearIcon />,
  },
  {
    title: 'Ready to launch',
    content: 'You\'re all set! Press Alt+S to start your first voice command, or just type in the terminal below.',
    icon: <RocketIcon />,
  },
];

const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handleSkip = () => {
    handleComplete();
  };

  const handleComplete = () => {
    setIsExiting(true);
    if (dontShowAgain) {
      localStorage.setItem('audiobash-onboarding-complete', 'true');
    }
    setTimeout(() => {
      onComplete();
    }, 200);
  };

  const step = steps[currentStep];

  return (
    <div className={`fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-200 ${isExiting ? 'opacity-0' : 'opacity-100'}`}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-void/90 backdrop-blur-sm" />

      {/* Modal */}
      <div className={`
        relative bg-void-100 border border-void-300 rounded-lg
        w-[500px] max-w-[90vw] overflow-hidden
        shadow-2xl transition-transform duration-200
        ${isExiting ? 'scale-95' : 'scale-100'}
      `}>
        {/* Header accent */}
        <div className="h-1 bg-gradient-to-r from-accent via-crt-amber to-accent" />

        {/* Content */}
        <div className="p-8">
          {/* Icon */}
          <div className="flex justify-center mb-6 text-accent">
            {step.icon}
          </div>

          {/* Title */}
          <h2 className="text-xl font-display font-bold text-crt-white text-center mb-4">
            {step.title}
          </h2>

          {/* Description */}
          <p className="text-crt-white/70 text-center leading-relaxed mb-8">
            {step.content}
          </p>

          {/* Keyboard hint for shortcut step */}
          {step.highlight === 'shortcut' && (
            <div className="flex justify-center mb-8">
              <kbd className="px-4 py-2 bg-void-200 border border-void-300 rounded text-accent font-mono text-lg">
                Alt + S
              </kbd>
            </div>
          )}

          {/* Progress dots */}
          <div className="flex justify-center gap-2 mb-6">
            {steps.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentStep(index)}
                className={`
                  w-2 h-2 rounded-full transition-all duration-200
                  ${index === currentStep
                    ? 'bg-accent w-6'
                    : index < currentStep
                      ? 'bg-accent/50'
                      : 'bg-void-300 hover:bg-void-200'
                  }
                `}
              />
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-crt-white/40 hover:text-crt-white/60 text-sm font-mono uppercase tracking-wider transition-colors"
            >
              Skip
            </button>

            <div className="flex items-center gap-4">
              {currentStep > 0 && (
                <button
                  onClick={() => setCurrentStep(currentStep - 1)}
                  className="px-4 py-2 text-sm font-mono uppercase tracking-wider text-crt-white/50 hover:text-crt-white transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={handleNext}
                className="px-6 py-2 bg-accent hover:bg-accent-glow text-void font-mono font-bold uppercase tracking-wider rounded transition-colors"
              >
                {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 bg-void-200/50 border-t border-void-300">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={dontShowAgain}
              onChange={(e) => setDontShowAgain(e.target.checked)}
              className="w-4 h-4 rounded border-void-300 bg-void-200 text-accent focus:ring-accent focus:ring-offset-0 cursor-pointer"
            />
            <span className="text-xs text-crt-white/40 font-mono">
              Don't show this again
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
