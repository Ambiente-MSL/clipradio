import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, Music, Volume2, Volume1, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const GlobalAudioPlayer = ({ track, onClose }) => {
  const audioRef = useRef(null);
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef({
    active: false,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
    rect: null,
  });
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleCanPlay = () => {
      if (track?.startTime) {
        audio.currentTime = track.startTime;
      }
      audio.play()
        .then(() => setIsPlaying(true))
        .catch(e => console.error("Audio play failed:", e));
    };

    if (track) {
      audio.src = track.src;
      audio.addEventListener('canplay', handleCanPlay, { once: true });
      audio.load();
    } else {
      audio.pause();
      audio.src = "";
      setIsPlaying(false);
    }

    return () => {
      audio.removeEventListener('canplay', handleCanPlay);
    };
  }, [track]);

  useEffect(() => {
    const isOpen = Boolean(track);
    if (isOpen && !wasOpenRef.current) {
      setDragOffset({ x: 0, y: 0 });
    }
    wasOpenRef.current = isOpen;
  }, [track]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const handlePlayPause = () => {
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    const currentTime = audioRef.current.currentTime;
    setProgress(currentTime);

    if (track?.endTime && currentTime >= track.endTime) {
      audioRef.current.pause();
      setIsPlaying(false);
      setProgress(track.endTime);
    }
  };

  const handleLoadedMetadata = () => {
    setDuration(audioRef.current.duration);
    if (track?.startTime) {
      setProgress(track.startTime);
    }
  };

  const handleScrub = (e) => {
    const progressBar = e.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    
    const clipDuration = (track?.endTime || duration) - (track?.startTime || 0);
    const scrubTime = (offsetX / progressBar.clientWidth) * clipDuration + (track?.startTime || 0);

    audioRef.current.currentTime = scrubTime;
    setProgress(scrubTime);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    const target = event.target;
    if (target?.closest?.('button, input, textarea, select, [data-no-drag]')) {
      return;
    }
    const rect = playerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragStateRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
      rect,
    };
    setIsDragging(true);
    playerRef.current?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const handlePointerMove = (event) => {
    const state = dragStateRef.current;
    if (!state.active) return;
    const dx = event.clientX - state.startX;
    const dy = event.clientY - state.startY;
    const padding = 8;
    const minDx = -(state.rect.left - padding);
    const maxDx = (window.innerWidth - padding) - state.rect.right;
    const minDy = -(state.rect.top - padding);
    const maxDy = (window.innerHeight - padding) - state.rect.bottom;
    const clampedDx = Math.min(maxDx, Math.max(minDx, dx));
    const clampedDy = Math.min(maxDy, Math.max(minDy, dy));
    setDragOffset({
      x: state.originX + clampedDx,
      y: state.originY + clampedDy,
    });
  };

  const handlePointerUp = (event) => {
    if (!dragStateRef.current.active) return;
    dragStateRef.current.active = false;
    setIsDragging(false);
    try {
      playerRef.current?.releasePointerCapture?.(event.pointerId);
    } catch (error) {
      // ignore
    }
  };

  const formatTime = (time) => {
    if (!Number.isFinite(time) || time < 0) return '00:00:00';
    const totalSeconds = Math.floor(time);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const VolumeIcon = () => {
    if (volume === 0) return <VolumeX className="w-5 h-5 text-white" />;
    if (volume < 0.5) return <Volume1 className="w-5 h-5 text-white" />;
    return <Volume2 className="w-5 h-5 text-white" />;
  };

  const getProgressWidth = () => {
    const clipStart = track?.startTime || 0;
    const clipEnd = track?.endTime || duration;
    const clipDuration = clipEnd - clipStart;
    
    if (clipDuration <= 0) return 0;

    const playedDuration = progress - clipStart;
    return Math.min(100, (playedDuration / clipDuration) * 100);
  };

  const displayProgress = track?.startTime ? progress - track.startTime : progress;
  const displayDuration = track?.startTime ? track.endTime - track.startTime : duration;

  return (
    <AnimatePresence>
      {track && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          ref={playerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`fixed bottom-4 left-1/2 w-[95%] max-w-2xl bg-slate-800/80 backdrop-blur-lg border border-slate-700 rounded-xl shadow-2xl z-50 ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          style={{
            transform: `translate3d(calc(-50% + ${dragOffset.x}px), ${dragOffset.y}px, 0)`,
            touchAction: 'none',
          }}
        >
          <audio
            ref={audioRef}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={() => {
              setIsPlaying(false);
              if (onClose) onClose();
            }}
          />
          <div className="p-4 flex items-center space-x-4">
            <div className="flex-shrink-0 w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center">
              <Music className="w-6 h-6 text-white" />
            </div>
            <div className="flex-grow">
              <h4 className="font-bold text-white truncate">{track.title}</h4>
              <p className="text-sm text-slate-400 truncate">{track.details}</p>
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-xs text-slate-400 font-mono">{formatTime(displayProgress)}</span>
                <div
                  className="w-full bg-slate-600 rounded-full h-1.5 cursor-pointer"
                  onClick={handleScrub}
                  data-no-drag
                >
                  <div
                    className="bg-cyan-400 h-1.5 rounded-full"
                    style={{ width: `${getProgressWidth()}%` }}
                  ></div>
                </div>
                <span className="text-xs text-slate-400 font-mono">{formatTime(displayDuration)}</span>
              </div>
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors">
                  <VolumeIcon />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-28 bg-slate-800/80 backdrop-blur-lg border-slate-700 p-2" data-no-drag>
                <Slider
                  defaultValue={[volume * 100]}
                  max={100}
                  step={1}
                  onValueChange={(value) => setVolume(value[0] / 100)}
                />
              </PopoverContent>
            </Popover>
            <button onClick={handlePlayPause} className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors">
              {isPlaying ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white" />}
            </button>
            <button onClick={onClose} className="p-2 rounded-full bg-slate-700 hover:bg-slate-600 transition-colors">
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GlobalAudioPlayer;
