'use client'

import { useEffect, useRef, useState, useCallback } from "react";
import { Battery, Wifi, WifiOff, Mic, MicOff, Camera as CameraIcon, CameraOff, Square, Circle } from "lucide-react";
import { logTacticalEvent } from "../hooks/useMistStream";

const WS_URL = "ws://localhost:8080";
const VIDEO_CAPTURE_INTERVAL = 1000;
const AUDIO_SAMPLE_RATE = 16000;
const PLAYBACK_SAMPLE_RATE = 24000;

const Camera = () => {
      const [isActive, setIsActive] = useState(false);
      const [error, setError] = useState(null);

      const [videoDevices, setVideoDevices] = useState([]);
      const [audioDevices, setAudioDevices] = useState([]);

      const [selectedVideoId, setSelectedVideoId] = useState('');
      const [selectedAudioId, setSelectedAudioId] = useState('');

      const [facingMode, setFacingMode] = useState('environment');

      const videoRef = useRef(null);
      const streamRef = useRef(null);

      const [sessionActive, setSessionActive] = useState(false);
      const [geminiStatus, setGeminiStatus] = useState('disconnected');
      const wsRef = useRef(null);
      const audioContextRef = useRef(null);
      const playbackContextRef = useRef(null);
      const processorRef = useRef(null);
      const sourceRef = useRef(null);
      const videoCaptureRef = useRef(null);
      const audioQueueRef = useRef([]);
      const isPlayingRef = useRef(false);

      const [recordingTime, setRecordingTime] = useState(0);
      const [isMuted, setIsMuted] = useState(false);
      const [isCameraOff, setIsCameraOff] = useState(false);

      useEffect(() => {
            let interval = null;
            if (sessionActive) {
                  interval = setInterval(() => {
                        setRecordingTime(prev => prev + 1);
                  }, 1000);
            } else {
                  clearInterval(interval);
                  setRecordingTime(0);
            }
            return () => clearInterval(interval);
      }, [sessionActive]);

      const formatTime = (seconds) => {
            const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
            const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            return `${h}:${m}:${s}`;
      };

      const enumerateDevices = useCallback(async () => {
            try {
                  const devices = await navigator.mediaDevices.enumerateDevices();
                  const videos = devices.filter(d => d.kind === 'videoinput');
                  const audios = devices.filter(d => d.kind === 'audioinput');
                  setVideoDevices(videos);
                  setAudioDevices(audios);

                  if (!selectedVideoId && videos.length > 0) {
                        setSelectedVideoId(videos[0].deviceId);
                  }
                  if (!selectedAudioId && audios.length > 0) {
                        setSelectedAudioId(audios[0].deviceId);
                  }
            } catch (err) {
                  console.error('Failed to enumerate devices:', err);
            }
      }, [selectedVideoId, selectedAudioId]);

      const startCamera = useCallback(async (videoId, audioId) => {
            if (streamRef.current) {
                  streamRef.current.getTracks().forEach(t => t.stop());
            }

            const videoConstraints = videoId
                  ? { deviceId: { exact: videoId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
                  : { facingMode, width: { ideal: 1920 }, height: { ideal: 1080 } };

            const constraints = {
                  video: videoConstraints,
                  audio: audioId
                        ? { deviceId: { exact: audioId } }
                        : true,
            };

            try {
                  const stream = await navigator.mediaDevices.getUserMedia(constraints);
                  streamRef.current = stream;

                  stream.getAudioTracks().forEach(track => {
                        track.enabled = !isMuted;
                  });
                  stream.getVideoTracks().forEach(track => {
                        track.enabled = !isCameraOff;
                  });

                  if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                        await videoRef.current.play();
                  }

                  setIsActive(true);
                  setError(null);

                  await enumerateDevices();
            } catch (err) {
                  console.error('Camera error:', err);
                  setError(err.message);
                  setIsActive(false);
            }
      }, [facingMode, enumerateDevices, isMuted, isCameraOff]);

      useEffect(() => {
            startCamera(selectedVideoId, selectedAudioId);

            return () => {
                  if (streamRef.current) {
                        streamRef.current.getTracks().forEach(t => t.stop());
                  }
            };
            // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []); // Start initially

      const playAudioQueue = useCallback(async () => {
            if (isPlayingRef.current) return;
            isPlayingRef.current = true;

            while (audioQueueRef.current.length > 0) {
                  const base64Data = audioQueueRef.current.shift();
                  try {
                        if (!playbackContextRef.current || playbackContextRef.current.state === 'closed') {
                              playbackContextRef.current = new AudioContext({ sampleRate: PLAYBACK_SAMPLE_RATE });
                        }

                        const binaryStr = atob(base64Data);
                        const bytes = new Uint8Array(binaryStr.length);
                        for (let i = 0; i < binaryStr.length; i++) {
                              bytes[i] = binaryStr.charCodeAt(i);
                        }

                        const int16 = new Int16Array(bytes.buffer);
                        const float32 = new Float32Array(int16.length);
                        for (let i = 0; i < int16.length; i++) {
                              float32[i] = int16[i] / 32768.0;
                        }

                        const audioBuffer = playbackContextRef.current.createBuffer(
                              1,
                              float32.length,
                              PLAYBACK_SAMPLE_RATE
                        );
                        audioBuffer.copyToChannel(float32, 0);

                        const source = playbackContextRef.current.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(playbackContextRef.current.destination);

                        await new Promise((resolve) => {
                              source.onended = resolve;
                              source.start();
                        });
                  } catch (err) {
                        console.error('Audio playback error:', err);
                  }
            }

            isPlayingRef.current = false;
      }, []);

      const startSession = useCallback(() => {
            if (wsRef.current) return;
            if (!streamRef.current) {
                  console.error('No media stream available');
                  return;
            }

            setGeminiStatus('connecting');

            const ws = new WebSocket(WS_URL);
            wsRef.current = ws;

            ws.onopen = () => {
                  console.log('WebSocket connected to server');
            };

            ws.onmessage = (event) => {
                  try {
                        const msg = JSON.parse(event.data);

                        if (msg.type === 'status' && msg.status === 'connected') {
                              setGeminiStatus('connected');
                              setSessionActive(true);
                              startAudioCapture();
                              startVideoCapture();
                        } else if (msg.type === 'audio' && msg.data) {
                              audioQueueRef.current.push(msg.data);
                              playAudioQueue();
                        } else if (msg.type === 'interrupted') {
                              audioQueueRef.current.length = 0;
                        } else if (msg.type === 'mist_event' && msg.payload) {
                              logTacticalEvent(msg.payload);
                        } else if (msg.type === 'error') {
                              console.error('Server error:', msg.message);
                        }
                  } catch (err) {
                        console.error('Failed to parse server message:', err);
                  }
            };

            ws.onerror = (err) => {
                  console.error('WebSocket error:', err);
                  setGeminiStatus('disconnected');
            };

            ws.onclose = () => {
                  console.log('WebSocket disconnected');
                  setGeminiStatus('disconnected');
                  setSessionActive(false);
                  wsRef.current = null;
                  stopCapture();
            };
      }, [playAudioQueue]);

      const stopSession = useCallback(() => {
            stopCapture();

            if (wsRef.current) {
                  wsRef.current.close();
                  wsRef.current = null;
            }

            setSessionActive(false);
            setGeminiStatus('disconnected');
            audioQueueRef.current.length = 0;
      }, []);

      const startAudioCapture = useCallback(() => {
            if (!streamRef.current) return;

            const audioTrack = streamRef.current.getAudioTracks()[0];
            if (!audioTrack) {
                  console.error('No audio track found');
                  return;
            }

            const audioStream = new MediaStream([audioTrack]);
            audioContextRef.current = new AudioContext({ sampleRate: AUDIO_SAMPLE_RATE });
            const source = audioContextRef.current.createMediaStreamSource(audioStream);
            sourceRef.current = source;

            const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                  if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

                  const inputData = e.inputBuffer.getChannelData(0);

                  const int16 = new Int16Array(inputData.length);
                  for (let i = 0; i < inputData.length; i++) {
                        const s = Math.max(-1, Math.min(1, inputData[i]));
                        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                  }

                  const bytes = new Uint8Array(int16.buffer);
                  let binary = '';
                  for (let i = 0; i < bytes.length; i++) {
                        binary += String.fromCharCode(bytes[i]);
                  }
                  const base64 = btoa(binary);

                  wsRef.current.send(JSON.stringify({
                        type: 'audio',
                        data: base64,
                  }));
            };

            source.connect(processor);
            processor.connect(audioContextRef.current.destination);
      }, []);

      const startVideoCapture = useCallback(() => {
            const canvas = document.createElement('canvas');

            videoCaptureRef.current = setInterval(() => {
                  if (!videoRef.current || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

                  const video = videoRef.current;

                  canvas.width = 640;
                  canvas.height = 480;

                  const ctx = canvas.getContext('2d');
                  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                  const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
                  const base64 = dataUrl.split(',')[1];

                  wsRef.current.send(JSON.stringify({
                        type: 'video',
                        data: base64,
                  }));
            }, VIDEO_CAPTURE_INTERVAL);
      }, []);

      const stopCapture = useCallback(() => {
            if (processorRef.current) {
                  processorRef.current.disconnect();
                  processorRef.current = null;
            }
            if (sourceRef.current) {
                  sourceRef.current.disconnect();
                  sourceRef.current = null;
            }
            if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
                  audioContextRef.current.close();
                  audioContextRef.current = null;
            }
            if (playbackContextRef.current && playbackContextRef.current.state !== 'closed') {
                  playbackContextRef.current.close();
                  playbackContextRef.current = null;
            }
            if (videoCaptureRef.current) {
                  clearInterval(videoCaptureRef.current);
                  videoCaptureRef.current = null;
            }
      }, []);

      useEffect(() => {
            return () => {
                  stopSession();
            };
      }, [stopSession]);

      const toggleCameraMode = () => {
            setIsCameraOff(prev => {
                  const newState = !prev;
                  if (streamRef.current) {
                        streamRef.current.getVideoTracks().forEach(track => {
                              track.enabled = !newState;
                        });
                  }
                  return newState;
            });
      };

      const toggleMute = () => {
            setIsMuted(prev => {
                  const newMuted = !prev;
                  if (streamRef.current) {
                        streamRef.current.getAudioTracks().forEach(track => {
                              track.enabled = !newMuted;
                        });
                  }
                  return newMuted;
            });
      };

      return (
            <div className="relative w-full h-full overflow-hidden bg-black font-mono select-none">
                  {/* Background Camera Feed */}
                  <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className={`absolute inset-0 w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
                  />

                  {/* Camera Off Overlay */}
                  {isCameraOff && (
                        <div className="absolute inset-0 w-full h-full bg-neutral-800 flex items-center justify-center z-0">
                              <CameraOff className="w-24 h-24 text-white/20" strokeWidth={1} />
                        </div>
                  )}

                  {/* Top Header (Status) */}
                  <div className="absolute top-0 left-0 right-0 landscape:w-32 landscape:h-full z-20 flex landscape:flex-col items-center justify-between px-5 pt-10 landscape:pt-5 landscape:px-0 landscape:py-6 pb-4">
                        {/* Left: REC Status */}
                        <div className="flex landscape:flex-col items-center gap-2 landscape:gap-4">
                              {sessionActive ? (
                                    <>
                                          <div className="w-4 h-4 bg-red-600 rounded-full animate-pulse shadow-[0_0_15px_rgba(220,38,38,0.8)]" />
                                          <span className="text-red-500 font-bold text-xl tracking-widest drop-shadow-md landscape:-rotate-90 landscape:translate-y-8">{formatTime(recordingTime)}</span>
                                    </>
                              ) : (
                                    <>
                                          <div className="w-4 h-4 bg-white/30 rounded-full" />
                                          <span className="text-white/50 font-bold text-xl tracking-widest drop-shadow-md landscape:-rotate-90 landscape:translate-y-8">00:00:00</span>
                                    </>
                              )}
                        </div>

                        {/* Right: Signal & Battery */}
                        <div className="flex landscape:flex-col items-center gap-3 landscape:gap-6 text-white">
                              {geminiStatus === 'connected' ? (
                                    <Wifi className="w-6 h-6 text-emerald-400 drop-shadow-md landscape:-rotate-90" />
                              ) : geminiStatus === 'connecting' ? (
                                    <Wifi className="w-6 h-6 text-amber-400 animate-pulse drop-shadow-md landscape:-rotate-90" />
                              ) : (
                                    <WifiOff className="w-6 h-6 text-white/40 drop-shadow-md landscape:-rotate-90" />
                              )}
                              <Battery className="w-7 h-7 text-white drop-shadow-md landscape:-rotate-90" />
                        </div>
                  </div>

                  {/* Bottom Dock (Controls) */}
                  <div className="absolute bottom-0 left-0 right-0 h-1/3 landscape:w-36 landscape:h-full landscape:right-0 landscape:left-auto landscape:top-0 z-30 flex landscape:flex-col items-center justify-between px-6 pb-12 landscape:px-0 landscape:py-6">
                        {/* Secondary Action (Left/Top): Mute Mic */}
                        <button
                              onClick={toggleMute}
                              className={`w-16 h-16 landscape:w-14 landscape:h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-95 ${isMuted ? 'bg-orange-500/20 text-orange-500 border-2 border-orange-500' : 'bg-white/10 text-white border-2 border-white/30 hover:bg-white/20'
                                    }`}
                        >
                              {isMuted ? <MicOff className="w-6 h-6 landscape:w-5 landscape:h-5" /> : <Mic className="w-6 h-6 landscape:w-5 landscape:h-5" />}
                        </button>

                        {/* Main Stream Button */}
                        <button
                              onClick={sessionActive ? stopSession : startSession}
                              disabled={geminiStatus === 'connecting'}
                              className={`relative flex items-center justify-center w-28 h-28 landscape:w-20 landscape:h-20 rounded-full border-[6px] transition-all active:scale-95 ${sessionActive
                                    ? 'border-red-500/50 bg-transparent'
                                    : 'border-white/50 bg-transparent'
                                    } disabled:opacity-50`}
                        >
                              <div className={`w-20 h-20 landscape:w-14 landscape:h-14 rounded-full flex items-center justify-center transition-all ${sessionActive ? 'bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.8)]' : 'bg-white'
                                    }`}>
                                    {sessionActive ? (
                                          <Square className="w-8 h-8 landscape:w-5 landscape:h-5 text-white fill-current" />
                                    ) : (
                                          <Circle className="w-8 h-8 landscape:w-5 landscape:h-5 text-black fill-current" />
                                    )}
                              </div>
                        </button>

                        {/* Secondary Action (Right/Bottom): Toggle Camera */}
                        <button
                              onClick={toggleCameraMode}
                              className={`w-16 h-16 landscape:w-14 landscape:h-14 rounded-full flex items-center justify-center backdrop-blur-md transition-all active:scale-95 ${isCameraOff ? 'bg-orange-500/20 text-orange-500 border-2 border-orange-500' : 'bg-white/10 text-white border-2 border-white/30 hover:bg-white/20'
                                    }`}
                        >
                              {isCameraOff ? <CameraOff className="w-6 h-6 landscape:w-5 landscape:h-5" /> : <CameraIcon className="w-6 h-6 landscape:w-5 landscape:h-5" />}
                        </button>
                  </div>

                  {/* Loader Overlay */}
                  {!isActive && !error && (
                        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black">
                              <div className="w-12 h-12 border-4 border-white/30 border-t-white rounded-full animate-spin" />
                        </div>
                  )}

                  {/* Error Overlay */}
                  {error && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/95">
                              <div className="text-center px-6 text-red-500 font-bold text-lg uppercase tracking-widest border-2 border-red-500 p-6 rounded-xl bg-red-500/10 max-w-[90%]">
                                    <span className="block mb-2 text-xl">SYSTEM ERROR</span>
                                    <span className="text-white/80 text-xs font-normal normal-case block leading-relaxed">{error}</span>
                                    <button
                                          onClick={() => window.location.reload()}
                                          className="mt-6 px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 active:scale-95 transition-all"
                                    >
                                          REBOOT SYSTEM
                                    </button>
                              </div>
                        </div>
                  )}
            </div>
      );
};

export default Camera;