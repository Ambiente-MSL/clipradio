import React, { useRef, useEffect } from 'react';
import Hls from 'hls.js';

const AudioPlayer = ({ src, isPlaying, onEnded, volume }) => {
  const audioRef = useRef(null);
  const hlsRef = useRef(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const setupHls = (source) => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
      const hls = new Hls();
      hlsRef.current = hls;
      hls.loadSource(source);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isPlaying) {
          audio.play().catch(e => console.error("Erro ao tocar áudio HLS:", e));
        }
      });
    };

    if (src) {
      if (Hls.isSupported() && src.includes('.m3u8')) {
        setupHls(src);
      } else {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        audio.src = src;
        if (isPlaying) {
          audio.load();
          audio.play().catch(e => console.error("Erro ao tocar áudio:", e));
        }
      }
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
      }
    };
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(e => console.error("Erro ao tocar áudio:", e));
    } else {
      audio.pause();
    }
  }, [isPlaying]);
  
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    
    const handleEnded = () => {
      if(onEnded) {
        onEnded();
      }
    };

    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onEnded]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  return <audio ref={audioRef} className="hidden" crossOrigin="anonymous" />;
};

export default AudioPlayer;