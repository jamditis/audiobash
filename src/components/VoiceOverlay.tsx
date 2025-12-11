import React, { useRef, useEffect, useState, useCallback } from 'react';
import { transcriptionService, ModelId, MODELS } from '../services/transcriptionService';
import { audioFeedback } from '../utils/audioFeedback';

interface VoiceOverlayProps {
  isOpen: boolean;
  isRecording: boolean;
  setIsRecording: (recording: boolean) => void;
  onTranscript: (text: string, mode: 'agent' | 'raw') => void;
  transcript: string;
  onClose: () => void;
  isPinned: boolean;
  setIsPinned: (pinned: boolean) => void;
  activeTabId: string;
  mode: 'agent' | 'raw';
  setMode: (mode: 'agent' | 'raw') => void;
}

const MicIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
  </svg>
);

const PinIcon = ({ filled }: { filled: boolean }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill={filled ? "currentColor" : "none"} viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isOpen,
  isRecording,
  setIsRecording,
  onTranscript,
  transcript,
  onClose,
  isPinned,
  setIsPinned,
  activeTabId,
  mode,
  setMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | undefined>(undefined);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const isRecordingRef = useRef(isRecording);
  const autoHideTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [status, setStatus] = useState<'idle' | 'recording' | 'processing'>('idle');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [model, setModel] = useState<ModelId>('gemini-2.0-flash');
  const [error, setError] = useState<string | null>(null);

  // Keep ref in sync with prop
  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  // Load settings and API keys
  useEffect(() => {
    const loadApiKeys = async () => {
      // Load all API keys
      const geminiKey = await window.electron?.getApiKey('gemini');
      const openaiKey = await window.electron?.getApiKey('openai');
      const anthropicKey = await window.electron?.getApiKey('anthropic');
      const elevenlabsKey = await window.electron?.getApiKey('elevenlabs');

      if (geminiKey) transcriptionService.setApiKey(geminiKey, 'gemini');
      if (openaiKey) transcriptionService.setApiKey(openaiKey, 'openai');
      if (anthropicKey) transcriptionService.setApiKey(anthropicKey, 'anthropic');
      if (elevenlabsKey) transcriptionService.setApiKey(elevenlabsKey, 'elevenlabs');

      // Check if current model has required key
      const savedModel = localStorage.getItem('audiobash-model') as ModelId || 'gemini-2.0-flash';
      setModel(savedModel);

      const modelInfo = MODELS.find(m => m.id === savedModel);
      if (modelInfo) {
        const hasKey = modelInfo.provider === 'gemini' ? !!geminiKey :
          modelInfo.provider === 'openai' ? !!openaiKey :
          modelInfo.provider === 'anthropic' ? (!!openaiKey && !!anthropicKey) :
          modelInfo.provider === 'elevenlabs' ? !!elevenlabsKey :
          modelInfo.provider === 'local' ? true : false;
        setHasApiKey(hasKey);
      }
    };
    loadApiKeys();
  }, []);

  // Auto-hide after recording stops (if not pinned)
  useEffect(() => {
    if (!isRecording && status === 'idle' && isOpen && !isPinned) {
      autoHideTimerRef.current = setTimeout(() => {
        onClose();
      }, 2000);
    }

    return () => {
      if (autoHideTimerRef.current) {
        clearTimeout(autoHideTimerRef.current);
      }
    };
  }, [isRecording, status, isOpen, isPinned, onClose]);

  // Audio visualization
  useEffect(() => {
    if (!canvasRef.current || !isOpen) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);

      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (analyserRef.current) {
        const analyser = analyserRef.current;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const barWidth = canvas.width / bufferLength * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.8;

          const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
          gradient.addColorStop(0, '#ff3333');
          gradient.addColorStop(1, '#ff333355');

          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);

          x += barWidth;
        }
      } else {
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isOpen]);

  const startRecording = useCallback(async () => {
    const modelInfo = MODELS.find(m => m.id === model);
    if (!hasApiKey && modelInfo?.provider !== 'local') {
      setError('No API key configured for selected model');
      return;
    }

    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const durationMs = Date.now() - startTimeRef.current;

        if (audioContextRef.current) {
          audioContextRef.current.close();
          audioContextRef.current = null;
        }
        analyserRef.current = null;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        setStatus('processing');
        try {
          // Fetch terminal context before transcription (for agent mode)
          if (mode === 'agent') {
            const context = await window.electron?.getTerminalContext(activeTabId);
            if (context) {
              transcriptionService.setTerminalContext(context);
            }
          }

          const result = await transcriptionService.transcribeAudio(blob, mode, model, durationMs);
          if (result.text) {
            onTranscript(result.text, mode);
            audioFeedback.playSuccess();
          }
        } catch (err: any) {
          setError(err.message);
          audioFeedback.playError();
        }
        setStatus('idle');
      };

      startTimeRef.current = Date.now();
      mediaRecorder.start();
      setIsRecording(true);
      setStatus('recording');
      audioFeedback.playStart();

    } catch (err: any) {
      setError('Microphone access denied');
      audioFeedback.playError();
    }
  }, [mode, model, hasApiKey, onTranscript, setIsRecording]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      audioFeedback.playStop();
    }
    setIsRecording(false);
  }, [setIsRecording]);

  // Cancel recording - stops without processing/sending
  const cancelRecording = useCallback(() => {
    if (!isRecordingRef.current) return;

    // Stop the media recorder without triggering onstop processing
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Remove the onstop handler temporarily to prevent transcription
      mediaRecorderRef.current.onstop = null;
      mediaRecorderRef.current.stop();
    }

    // Clean up audio resources
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    chunksRef.current = [];

    setIsRecording(false);
    setStatus('idle');
    audioFeedback.playError(); // Play error/cancel sound
    setError('Recording cancelled');
    setTimeout(() => setError(null), 2000);
  }, [setIsRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  // Global shortcut handler for toggle recording
  useEffect(() => {
    const handleToggle = () => {
      if (isRecordingRef.current) {
        stopRecording();
      } else {
        startRecording();
      }
    };
    const cleanup = window.electron?.onToggleRecording(handleToggle);
    return () => cleanup?.();
  }, [startRecording, stopRecording]);

  // Global shortcut handler for cancel recording
  useEffect(() => {
    const handleCancel = () => {
      cancelRecording();
    };
    const cleanup = window.electron?.onCancelRecording(handleCancel);
    return () => cleanup?.();
  }, [cancelRecording]);

  if (!isOpen) return null;

  return (
    <div className="voice-overlay-container">
      <div className="voice-overlay bg-void-100 border border-void-300 rounded-lg shadow-2xl w-80 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-void-300 bg-void-200/50">
          <span className="text-[10px] font-mono uppercase tracking-widest text-crt-white/50">
            Voice Input
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsPinned(!isPinned)}
              className={`p-1 rounded transition-colors ${
                isPinned ? 'text-accent' : 'text-crt-white/30 hover:text-crt-white/50'
              }`}
              title={isPinned ? 'Unpin panel' : 'Pin panel open'}
            >
              <PinIcon filled={isPinned} />
            </button>
            <button
              onClick={onClose}
              className="p-1 text-crt-white/30 hover:text-crt-white/50 transition-colors"
              title="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Visualizer */}
        <div className="p-3">
          <canvas
            ref={canvasRef}
            width={280}
            height={50}
            className="w-full rounded border border-void-300"
          />
        </div>

        {/* Mic Button & Status */}
        <div className="flex items-center justify-center gap-4 pb-3">
          <button
            onClick={toggleRecording}
            disabled={!hasApiKey && MODELS.find(m => m.id === model)?.provider !== 'local'}
            className={`
              w-14 h-14 rounded-full border-2
              flex items-center justify-center
              transition-all duration-200
              ${isRecording
                ? 'bg-accent/20 border-accent text-accent glow-recording'
                : !hasApiKey && MODELS.find(m => m.id === model)?.provider !== 'local'
                  ? 'bg-void-200 border-void-400 text-crt-white/20 cursor-not-allowed'
                  : 'bg-void-200 border-void-300 text-crt-white/50 hover:border-accent hover:text-accent'
              }
            `}
          >
            <MicIcon />
          </button>

          <div className="text-left">
            <div className={`
              text-xs font-mono uppercase tracking-wider
              ${status === 'recording' ? 'text-accent' :
                status === 'processing' ? 'text-crt-amber' : 'text-crt-white/40'}
            `}>
              {status === 'idle' && (hasApiKey || MODELS.find(m => m.id === model)?.provider === 'local' ? 'Ready' : 'No API key')}
              {status === 'recording' && 'Listening...'}
              {status === 'processing' && 'Processing...'}
            </div>
            <div className="text-[10px] text-crt-white/30 mt-0.5">
              {status === 'recording' ? 'Alt+S send · Alt+A cancel' : 'Alt+S to start'}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-3 mb-3 p-2 bg-accent/10 border border-accent/30 rounded">
            <p className="text-[10px] text-accent font-mono">{error}</p>
          </div>
        )}

        {/* Mode Toggle */}
        <div className="px-3 pb-3">
          <div className="flex gap-2">
            <button
              onClick={() => setMode('raw')}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase border rounded transition-colors ${
                mode === 'raw'
                  ? 'bg-void-300 border-crt-white/30 text-crt-white'
                  : 'border-void-300 text-crt-white/30 hover:border-crt-white/20'
              }`}
            >
              Raw
            </button>
            <button
              onClick={() => setMode('agent')}
              className={`flex-1 py-1.5 text-[10px] font-mono uppercase border rounded transition-colors ${
                mode === 'agent'
                  ? 'bg-void-300 border-accent/50 text-accent'
                  : 'border-void-300 text-crt-white/30 hover:border-accent/30'
              }`}
            >
              Agent
            </button>
          </div>
          <div className="text-[9px] text-crt-white/20 mt-1 text-center">
            {mode === 'agent' ? 'Converts speech to CLI commands' : 'Verbatim transcription'}
          </div>
        </div>

        {/* Transcript Preview */}
        {transcript && (
          <div className="px-3 pb-3">
            <div className="bg-void-200 border border-void-300 rounded p-2 max-h-20 overflow-y-auto">
              <p className="text-xs text-crt-white/70 font-mono">{transcript}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VoiceOverlay;
