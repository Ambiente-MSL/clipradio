import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, X, Music, Volume2, Volume1, VolumeX } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const GlobalAudioPlayer = ({ track, onClose }) => {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

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
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-2xl bg-slate-800/80 backdrop-blur-lg border border-slate-700 rounded-xl shadow-2xl z-50"
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
                <div className="w-full bg-slate-600 rounded-full h-1.5 cursor-pointer" onClick={handleScrub}>
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
              <PopoverContent className="w-28 bg-slate-800/80 backdrop-blur-lg border-slate-700 p-2">
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
