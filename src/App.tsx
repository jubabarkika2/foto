import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  Upload, 
  Mail, 
  RefreshCw, 
  LogOut, 
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Send, 
  Sparkles, 
  User,
  ArrowRight,
  X,
  Eye,
  Settings,
  SwitchCamera,
  Video
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { googleSignIn, logout, initAuth } from "./utils/firebaseAuth";
import { sendGmailMessage, GmailAttachment } from "./utils/gmail";
import { User as FirebaseUser } from "firebase/auth";

export default function App() {
  // Authentication states
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Backend SMTP feature configuration
  const [hasSmtp, setHasSmtp] = useState(false);
  const [smtpUser, setSmtpUser] = useState<string | null>(null);
  const [checkingSmtp, setCheckingSmtp] = useState(true);

  // Iframe sandboxing detect and helper state
  const [isInIframe, setIsInIframe] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [showHelper, setShowHelper] = useState(false);

  useEffect(() => {
    try {
      setIsInIframe(window.self !== window.top);
    } catch (e) {
      setIsInIframe(true);
    }

    // Check backend SMTP configuration status
    async function checkSmtpConfig() {
      try {
        const res = await fetch("/api/config-status");
        if (res.ok) {
          const data = await res.json();
          if (data.status === "ok") {
            setHasSmtp(data.hasSmtp);
            setSmtpUser(data.smtpUser);
            // If server has SMTP pre-configured, we bypass the absolute login wall!
            if (data.hasSmtp) {
              setNeedsAuth(false);
            }
          }
        }
      } catch (e) {
        console.error("Erro ao verificar configuração SMTP do servidor:", e);
      } finally {
        setCheckingSmtp(false);
      }
    }
    checkSmtpConfig();
  }, []);

  const copyToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        return;
      }
    } catch (e) {
      console.warn("navigator.clipboard failed, trying fallback: ", e);
    }

    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.top = "0";
      textArea.style.left = "0";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const success = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (success) {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000);
        return;
      }
    } catch (err) {
      console.error("Fallback copy failed: ", err);
    }

    // Direct user prompt if both failed
    window.prompt("Não foi possível copiar automaticamente no seu celular. Por favor, copie o link abaixo manualmente:", text);
  };

  // App-specific states
  const [selectedMode, setSelectedMode] = useState<"camera" | "upload">("camera");
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<string[]>([]);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [cameraFlash, setCameraFlash] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState(() => {
    return localStorage.getItem("last_recipient_email") || "";
  });
  const [emailSubject, setEmailSubject] = useState(() => {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    });
    return `Fotos de Email - ${formatter.format(now)}`;
  });
  const [emailBody, setEmailBody] = useState("Olá! Seguem em anexo as fotos enviadas diretamente através do aplicativo Foto para E-mail.");
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendingError, setSendingError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [sentPhotosCount, setSentPhotosCount] = useState(0);
  const [sentPhotosPreview, setSentPhotosPreview] = useState<string[]>([]);

  // Camera states
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<"user" | "environment">("environment");
  const [zoomLevel, setZoomLevel] = useState<number>(1.0);

  // Video recording states and refs
  const [cameraMode, setCameraMode] = useState<"photo" | "video">("photo");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // iPhone-style Zoom Dial Controls
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  const zoomOptionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const isScrollingProgrammatically = useRef(false);
  const initialScrollDone = useRef(false);

  const ZOOM_OPTIONS = [0.5, 1.0, 3.0, 5.0, 10.0, 15.0];

  const selectZoom = (val: number, index: number) => {
    setZoomLevel(val);
    isScrollingProgrammatically.current = true;
    const btn = zoomOptionRefs.current[index];
    if (btn) {
      btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    }
    setTimeout(() => {
      isScrollingProgrammatically.current = false;
    }, 450);
  };

  const handleZoomScroll = () => {
    if (isScrollingProgrammatically.current) return;
    if (!zoomContainerRef.current) return;

    const container = zoomContainerRef.current;
    const containerCenter = container.scrollLeft + container.clientWidth / 2;

    let closestIndex = 1; // Default to 1.0x
    let minDiff = Infinity;

    zoomOptionRefs.current.forEach((btn, idx) => {
      if (!btn) return;
      const btnCenter = btn.offsetLeft + btn.clientWidth / 2;
      const diff = Math.abs(containerCenter - btnCenter);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = idx;
      }
    });

    const targetZoom = ZOOM_OPTIONS[closestIndex];
    if (targetZoom !== undefined && targetZoom !== zoomLevel) {
      setZoomLevel(targetZoom);
    }
  };

  // Refs for camera element
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setNeedsAuth(false);
        // Pre-fill email state
        if (currentUser.email) {
          setRecipientEmail(currentUser.email);
        }
        // Set default prefilled subject
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short"
        });
        setEmailSubject(`Fotos de Email - ${formatter.format(now)}`);
        setEmailBody("Olá! Seguem em anexo as fotos enviadas diretamente através do aplicativo Foto para E-mail.");
      },
      () => {
        setNeedsAuth(true);
        setUser(null);
        setToken(null);
      }
    );

    return () => {
      unsubscribe();
      // Make sure we stop camera triggers if app unmounts
      stopCamera();
    };
  }, []);

  // Save recipientEmail to localStorage whenever it changes
  useEffect(() => {
    if (recipientEmail) {
      localStorage.setItem("last_recipient_email", recipientEmail);
    }
  }, [recipientEmail]);

  // Sync camera when mode transitions to "camera"
  useEffect(() => {
    if (selectedMode === "camera" && !needsAuth) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [selectedMode, needsAuth, cameraFacingMode]);

  // Center scroll the zoom selector automatically on stream startup or camera initialization
  useEffect(() => {
    if (selectedMode === "camera") {
      const timer = setTimeout(() => {
        const btn = zoomOptionRefs.current[1]; // Index 1 is 1.0x
        if (btn) {
          btn.scrollIntoView({ behavior: "instant" as any, inline: "center", block: "nearest" });
        }
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [selectedMode, cameraFacingMode]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);
        if (result.user.email) {
          setRecipientEmail(result.user.email);
        }
        const now = new Date();
        const formatter = new Intl.DateTimeFormat("pt-BR", {
          dateStyle: "short",
          timeStyle: "short"
        });
        setEmailSubject(`Fotos de Email - ${formatter.format(now)}`);
      }
    } catch (err: any) {
      console.error("Login failed:", err);
      setAuthError("Falha na autenticação do Google. Verifique e tente novamente.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      stopCamera();
      await logout();
      setCapturedPhotos([]);
      setPreviewPhoto(null);
      setSendSuccess(false);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Camera handling routines
  const startCamera = async () => {
    setCameraError(null);
    setIsCameraLoading(true);
    try {
      // Release any existing tracks before starting
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }

      // Resilient check to request audio track for video support, falling back to video-only if denied
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: { ideal: cameraFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: true
        });
      } catch (audioErr) {
        console.warn("Microphone access denied or unavailable, falling back to video only:", audioErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: { ideal: cameraFacingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });
      }

      setCameraStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Simple delay to ensure playback loads nicely
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.play().catch(e => console.error("Error playing stream:", e));
          }
        }, 150);
      }
    } catch (err: any) {
      console.error("Camera access failed:", err);
      setCameraError(
        "Acesso à câmera bloqueado ou indisponível. Altere suas permissões ou use o modo Envio de Arquivos."
      );
      // Fallback
      setSelectedMode("upload");
    } finally {
      setIsCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    if (isRecording) {
      stopRecording();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const formatDuration = (sec: number) => {
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  };

  const startRecording = () => {
    if (!cameraStream) return;
    recordedChunksRef.current = [];
    
    try {
      let options = { mimeType: "video/webm;codecs=vp9" };
      if (typeof MediaRecorder !== "undefined") {
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "video/webm;codecs=vp8" };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "video/webm" };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "video/mp4" };
        }
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
          options = { mimeType: "" };
        }
      }

      const recorder = new MediaRecorder(cameraStream, options);
      
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const videoBlob = new Blob(recordedChunksRef.current, { type: recorder.mimeType || "video/webm" });
        const reader = new FileReader();
        reader.onloadend = () => {
          const dataUrl = reader.result as string;
          setCapturedPhotos(prev => [...prev, dataUrl]);
        };
        reader.readAsDataURL(videoBlob);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);

    } catch (err) {
      console.error("Failed to start media recorder:", err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  };

  const handleShutterClick = () => {
    if (cameraMode === "photo") {
      capturePhoto();
    } else {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      
      canvas.width = width;
      canvas.height = height;
      
      if (ctx) {
        ctx.save();
        if (cameraFacingMode === "user") {
          // Mirror the image horizontally
          ctx.translate(width, 0);
          ctx.scale(-1, 1);
        }
        if (zoomLevel > 1) {
          const cropWidth = width / zoomLevel;
          const cropHeight = height / zoomLevel;
          const cropX = (width - cropWidth) / 2;
          const cropY = (height - cropHeight) / 2;
          ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height);
        } else if (zoomLevel < 1) {
          // Digital zoom-out wide-angle simulation for 0.5x
          ctx.fillStyle = "#020617";
          ctx.fillRect(0, 0, width, height);
          const newWidth = width * zoomLevel;
          const newHeight = height * zoomLevel;
          const x = (width - newWidth) / 2;
          const y = (height - newHeight) / 2;
          ctx.drawImage(video, x, y, newWidth, newHeight);
        } else {
          ctx.drawImage(video, 0, 0, width, height);
        }
        ctx.restore();
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setCapturedPhotos(prev => [...prev, dataUrl]);
        
        // Visually trigger a quick flash
        setCameraFlash(true);
        setTimeout(() => setCameraFlash(false), 200);
      }
    }
  };

  // Upload handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      (Array.from(files) as File[]).forEach(file => {
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setCapturedPhotos(prev => [...prev, event.target.result as string]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
    if (e.target) {
      e.target.value = "";
    }
  };

  const triggerUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Email sending orchestration
  const handleSendEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (capturedPhotos.length === 0) return;

    if (!recipientEmail) {
      setSendingError("Por favor, preencha o e-mail de destino.");
      return;
    }

    // Envia diretamente sem prompt de confirmação
    setIsSending(true);
    setSendingError(null);

    // Dynamic timestamp with seconds to guarantee a brand new, separate e-mail thread in Gmail/Outlook
    const now = new Date();
    const secondsStamp = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const finalSubject = `${emailSubject || "Fotos de Email"} (${secondsStamp})`;

    try {
      if (hasSmtp) {
        // Envio direto via SMTP no backend (Sem login no celular!)
        const response = await fetch("/api/send-email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: recipientEmail,
            subject: finalSubject,
            body: emailBody || "",
            imagesBase64: capturedPhotos,
          }),
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error || "Falha ao enviar através do SMTP do servidor.");
        }
      } else {
        // Envio clássico via API do Gmail (Requer Token do Google OAuth)
        if (!token) {
          throw new Error("Sessão expirada ou sem login. Por favor, conecte com o Google antes de enviar.");
        }

        const attachments: GmailAttachment[] = [];

        capturedPhotos.forEach((photo, index) => {
          const match = photo.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
          if (!match) {
            throw new Error(`Formato de imagem inválido na foto ${index + 1}.`);
          }

          const fileType = match[1];
          const base64Content = match[2];
          
          attachments.push({
            fileName: `foto_${index + 1}_${Date.now()}.jpg`,
            fileType: fileType,
            base64Content: base64Content
          });
        });

        await sendGmailMessage(
          token,
          recipientEmail,
          finalSubject,
          emailBody || "",
          attachments
        );
      }

      // Success Operations - caching preview info so the success screen displays perfectly
      setSentPhotosPreview([...capturedPhotos]);
      setSentPhotosCount(capturedPhotos.length);
      
      // Auto-clear original photos right now, so they're completely empty and never accumulate size for the next turn
      setCapturedPhotos([]);
      setPreviewPhoto(null);
      
      // Update default subject base with current short timestamp
      const formatter = new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
      });
      setEmailSubject(`Fotos de Email - ${formatter.format(now)}`);

      // Trigger beautiful floating Toast & Success screen
      setToastMessage(`Enviado! ${capturedPhotos.length} foto(s) enviada(s) com sucesso.`);
      setShowToast(true);
      setSendSuccess(true);

      // Dismiss Toast after 4 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 4000);

    } catch (err: any) {
      console.error("Failed to send email:", err);
      setSendingError(
        err.message || "Erro desconhecido ao enviar e-mail. Verifique a conexão ou tente novamente."
      );
    } finally {
      setIsSending(false);
    }
  };

  const resetState = () => {
    setCapturedPhotos([]);
    setSendSuccess(false);
    setSendingError(null);
    setPreviewPhoto(null);
    
    // Refresh datetime strings
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    });
    setEmailSubject(`Fotos de Email - ${formatter.format(now)}`);
    
    if (selectedMode === "camera") {
      startCamera();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans transition-colors duration-200" id="main_container">
      {/* Dynamic Success Toast */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-green-600 text-white px-5 py-3 rounded-2xl shadow-2xl font-bold flex items-center gap-2 max-w-sm w-11/12 border border-green-500"
            id="success_toast"
          >
            <CheckCircle className="w-5 h-5 shrink-0 text-white animate-bounce" />
            <span className="text-[11px] font-sans leading-snug">{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Professional Header */}
      <header className="bg-white border-b border-slate-200 py-1.5 px-3 sm:py-2 sm:px-4 sticky top-0 z-10 shadow-xs" id="app_header">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="bg-blue-600 text-white p-1 sm:p-1.5 rounded-lg shadow-xs" id="logo_container">
              <Camera className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h1 className="font-sans font-semibold text-xs sm:text-sm tracking-tight text-slate-950 whitespace-nowrap" id="app_title">
                Foto para E-mail
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {hasSmtp && (
              <div 
                className="flex items-center gap-1 bg-emerald-50 text-emerald-800 text-[10px] font-bold p-1 sm:px-2 sm:py-1 rounded-full border border-emerald-200 shadow-2xs" 
                title="Envio Direto Ativo"
                id="smtp_active_badge"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="hidden md:inline whitespace-nowrap">Envio Direto Ativo</span>
              </div>
            )}
            
            {user ? (
              <div className="flex items-center gap-1 sm:gap-2 bg-slate-100 py-0.5 sm:py-1 pl-1.5 pr-1 sm:pl-2.5 sm:pr-1.5 rounded-full border border-slate-200" id="user_profile_badge">
                <div className="text-right hidden sm:block">
                  <div className="text-[10px] font-semibold text-slate-900 leading-tight">{user.displayName}</div>
                  <div className="text-[9px] text-slate-500 font-mono leading-none">{user.email}</div>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Foto Perfil" className="w-5.5 h-5.5 sm:w-6.5 sm:h-6.5 rounded-full border border-white object-cover shadow-xs" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-5.5 h-5.5 sm:w-6.5 sm:h-6.5 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-[9px] sm:text-[10px]">
                    {user.displayName?.charAt(0) || <User className="w-3 h-3" />}
                  </div>
                )}
                <button 
                  onClick={handleLogout} 
                  className="p-1 text-slate-500 hover:text-red-600 transition-colors duration-150 rounded-full hover:bg-slate-200 cursor-pointer"
                  title="Sair da Conta"
                  id="logout_button"
                >
                  <LogOut className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                </button>
              </div>
            ) : hasSmtp && (
              <div className="flex items-center gap-1 sm:gap-1.5">
                <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                  Modo Autônomo
                </span>
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="px-2.5 py-1 text-[10px] sm:px-3 sm:py-1 sm:text-[11px] bg-slate-950 border border-slate-900 text-white hover:bg-slate-800 rounded-lg font-semibold transition-all shadow-2xs hover:shadow-xs cursor-pointer flex items-center gap-1 whitespace-nowrap"
                >
                  {isLoggingIn ? "..." : "Entrar com Google"}
                </button>
              </div>
            )}

            {/* Compact Header Send Button */}
            {!needsAuth && (
              <button
                type="button"
                onClick={() => {
                  if (capturedPhotos.length === 0) {
                    setToastMessage("Capture ou mude para Arquivo(s) e adicione fotos antes de enviar!");
                    setShowToast(true);
                    setTimeout(() => {
                      setShowToast(false);
                    }, 4000);
                    return;
                  }
                  handleSendEmail();
                }}
                disabled={isSending}
                className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 rounded-xl text-xs font-black transition-all duration-150 cursor-pointer bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white shadow-xs hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                id="header_send_button"
              >
                {isSending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span className="text-[11px]">Enviando...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span className="text-[11px]">Enviar</span>
                    {capturedPhotos.length > 0 && (
                      <span className="ml-1 bg-white text-emerald-700 font-black px-1.5 py-0.25 rounded-full text-[9px] min-w-4 flex items-center justify-center shadow-2xs">
                        {capturedPhotos.length}
                      </span>
                    )}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Workstation */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center" id="app_main">
        <AnimatePresence mode="wait">
          {/* 1. STATE: UNAUTHENTICATED (Sign-in required) */}
          {needsAuth ? (
            <motion.div
              key="auth-card"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="w-full max-w-md bg-white border border-slate-200 p-8 rounded-3xl shadow-xl flex flex-col items-center text-center"
              id="auth_card"
            >
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-6 border border-blue-100">
                <Sparkles className="w-8 h-8 animate-pulse" />
              </div>
              <h2 className="text-2xl font-sans font-semibold tracking-tight text-slate-900 mb-2" id="auth_heading">
                Conecte seu E-mail
              </h2>
              <p className="text-slate-600 text-sm max-w-xs mb-6" id="auth_description">
                Para tirar ou enviar fotos direto para a sua caixa de entrada, faça login com sua conta do Google.
              </p>

              {/* aviso explicativo para o iframe ou celular */}
              {(isInIframe || showHelper) && (
                <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-4 text-left mb-6 flex flex-col gap-2.5" id="iframe_sandbox_warning">
                  <div className="flex gap-2 text-amber-800 text-xs font-semibold items-center">
                    <AlertCircle className="w-4 h-4 text-amber-600 animate-pulse" />
                    <span>Tutorial: Como Resolver no Celular</span>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                    Se você está no celular ou redes sociais (WhatsApp, Instagram, etc.), o navegador interno delas bloqueia o login do Google por segurança.
                  </p>
                  <p className="text-[11px] text-amber-700 leading-relaxed font-bold">
                    Para funcionar 100%, toque abaixo para abrir no Chrome/Safari do seu celular, ou use um dos botões de cópia:
                  </p>
                  
                  <div className="flex gap-2 mt-1">
                    <a
                      href={window.location.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer text-center"
                    >
                      <span>Abrir no Navegador</span>
                      <ArrowRight className="w-3 h-3 rotate-[-45deg]" />
                    </a>
                    
                    <button
                      type="button"
                      onClick={() => copyToClipboard(window.location.href)}
                      className="flex-1 py-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {isCopied ? "Copiado!" : "Copiar Link"}
                    </button>
                  </div>

                  {/* Campo de Texto selecionável adicional como backup absoluto! */}
                  <div className="mt-2 pt-2 border-t border-amber-200 flex flex-col gap-1.5">
                    <span className="text-[10px] text-amber-800 font-bold">Copiar manualmente (Dê um toque longo ou duplo clique abaixo):</span>
                    <input
                      type="text"
                      readOnly
                      value={window.location.href}
                      onClick={(e) => {
                        (e.target as HTMLInputElement).select();
                        copyToClipboard(window.location.href);
                      }}
                      className="w-full px-2.5 py-1.5 text-[10px] font-mono border border-amber-300 bg-white rounded-lg text-slate-700 outline-hidden select-all"
                    />
                  </div>
                </div>
              )}

              {/* Verified Google Sign-In Button */}
              <button
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="gsi-material-button flex items-center justify-center gap-3 px-6 py-3 w-full bg-slate-900 hover:bg-slate-800 text-white font-medium text-sm rounded-2xl shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 cursor-pointer"
                id="google_signin_button"
              >
                {isLoggingIn ? (
                  <RefreshCw className="w-5 h-5 animate-spin" />
                ) : (
                  <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-5 h-5">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  </svg>
                )}
                <span>{isLoggingIn ? "Autenticando..." : "Entrar com o Google"}</span>
              </button>

              {/* Botão de Ajuda Alternativo para abrir no celular se der erro */}
              {!showHelper && !isInIframe && (
                <button
                  type="button"
                  onClick={() => setShowHelper(true)}
                  className="mt-4 text-xs text-blue-600 hover:text-blue-800 font-medium underline cursor-pointer"
                  id="alternative_help_toggle"
                >
                  Problemas ao entrar ou usando pelo celular? Toque aqui.
                </button>
              )}

              {authError && (
                <div className="mt-4 flex items-center gap-2 text-xs text-red-600 bg-red-50 p-3 rounded-xl border border-red-100" id="auth_error_container">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{authError}</span>
                </div>
              )}

              {/* Informação sobre Envio Direto (Sem login) */}
              <div className="mt-6 pt-5 border-t border-slate-100 text-left w-full" id="smtp_info_block">
                <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-3.5 flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    💡 Dica: Use sem precisar de Login!
                  </span>
                  <p className="text-[11px] text-blue-700/90 leading-relaxed">
                    Você pode pular o login do Google no celular configurando o <strong>Envio Direto (SMTP)</strong>. 
                    Adicione as variáveis nos <strong>Secrets</strong> do AI Studio:
                  </p>
                  <div className="grid grid-cols-2 gap-1.5 mt-1 font-mono text-[9px] text-blue-800">
                    <div className="bg-blue-100/60 px-2 py-1 rounded border border-blue-200">SMTP_USER</div>
                    <div className="bg-blue-100/60 px-2 py-1 rounded border border-blue-200">SMTP_PASS</div>
                  </div>
                  <p className="text-[10px] text-blue-600/95 italic mt-1">
                    Isso resolve 100% dos bloqueios de navegadores no celular!
                  </p>
                </div>
              </div>

              <div className="mt-6 text-[11px] text-slate-400 font-medium" id="terms_badge">
                Conexão oficial segura usando Google OAuth e Firebase.
              </div>
            </motion.div>
          ) : (
            /* 2. STATE: USER IS AUTHENTICATED */
            <div className="w-full flex flex-col gap-6" id="authenticated_workspace">
              {/* If Email Send Success Dashboard */}
              {sendSuccess ? (
                <motion.div
                  key="success-card"
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center shadow-lg max-w-xl mx-auto w-full"
                  id="success_card"
                >
                  <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-100">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2" id="success_heading">
                    Tudo Enviado!
                  </h2>
                  <p className="text-slate-600 text-sm mb-6" id="success_description">
                    Seu lote de <strong>{sentPhotosCount} foto(s)</strong> foi enviado com sucesso para <strong className="text-slate-900 break-all">{recipientEmail}</strong> de forma direta e segura.
                  </p>

                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 border border-slate-100 rounded-2xl mb-6">
                    {sentPhotosPreview.map((photo, idx) => {
                      const isVideo = photo.startsWith("data:video/");
                      return (
                        <div key={idx} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 shadow-2xs bg-slate-900 flex items-center justify-center">
                          {isVideo ? (
                            <video src={photo} className="w-full h-full object-cover" muted loop playsInline />
                          ) : (
                            <img src={photo} alt={`Media enviada ${idx + 1}`} className="w-full h-full object-cover" />
                          )}
                          <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[8px] font-bold bg-black/70 text-white rounded-md flex items-center gap-1">
                            {isVideo && <Video className="w-2.5 h-2.5 text-yellow-400" />}
                            #{idx + 1}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      onClick={resetState}
                      className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm cursor-pointer"
                      id="shoot_again_button"
                    >
                      <Camera className="w-4 h-4" />
                      Capturar Novas Fotos
                    </button>
                    <button
                      onClick={() => setSendSuccess(false)}
                      className="flex-1 py-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 font-medium rounded-xl transition-all text-sm cursor-pointer"
                      id="view_fields_button"
                    >
                      Voltar aos detalhes
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Primary Workspace Grid */
                <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start" id="workspace_grid">
                  
                  {/* Photo Acquisition Block (Col-Span 7 / 12) */}
                  <div className="md:col-span-7 flex flex-col gap-4" id="photo_block">
                    <div className="flex flex-col gap-4">
                      {/* WORKZONE STAGE */}
                      <div className="relative aspect-[9/16] sm:aspect-[4/3] rounded-2xl overflow-hidden bg-slate-950 flex items-center justify-center group" id="workzone_stage">
                        {/* Shutter flash animation effect overlay */}
                        <AnimatePresence>
                          {cameraFlash && (
                            <motion.div
                              initial={{ opacity: 1 }}
                              animate={{ opacity: 0 }}
                              exit={{ opacity: 0 }}
                              transition={{ duration: 0.15 }}
                              className="absolute inset-0 bg-white z-50 pointer-events-none"
                            />
                          )}
                        </AnimatePresence>

                        <AnimatePresence mode="wait">
                          {selectedMode === "camera" ? (
                            /* Camera Live Feed view */
                            <motion.div
                              key="camera-view"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 w-full h-full flex items-center justify-center"
                            >
                              {cameraError ? (
                                <div className="p-6 text-center text-slate-400 flex flex-col items-center gap-3">
                                  <AlertCircle className="w-10 h-10 text-red-500" />
                                  <p className="text-xs max-w-xs">{cameraError}</p>
                                  <button
                                    type="button"
                                    onClick={startCamera}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg transition-all"
                                    id="retry_camera_button"
                                  >
                                    Tentar novamente
                                  </button>
                                </div>
                              ) : (
                                <div className="absolute inset-0 w-full h-full">
                                  {isCameraLoading && (
                                    <div className="absolute inset-0 bg-slate-950 flex items-center justify-center text-slate-400 text-xs gap-2">
                                      <RefreshCw className="w-4 h-4 animate-spin" /> Carregando câmera...
                                    </div>
                                  )}
                                  <video
                                    ref={videoRef}
                                    autoPlay
                                    playsInline
                                    muted
                                    className="w-full h-full object-cover"
                                    style={{ 
                                      transform: `${cameraFacingMode === "user" ? "scaleX(-1)" : ""} scale(${zoomLevel})`,
                                      transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                                    }}
                                  />
                                  {/* Botão flutuante discreto para inverter câmera (frontal / traseira) */}
                                  {isRecording && (
                                    <div className="absolute top-3 left-3 bg-red-650/95 text-white font-mono text-[10px] font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-lg z-20 animate-pulse border border-red-500/25 select-none whitespace-nowrap">
                                      <span className="w-1.5 h-1.5 bg-white rounded-full inline-block animate-ping" />
                                      GRAVANDO &bull; {formatDuration(recordingDuration)}
                                    </div>
                                  )}
                                  {!isRecording && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setCameraFacingMode(prev => prev === "environment" ? "user" : "environment");
                                        selectZoom(1.0, 1); // Reset zoom dynamically and scroll to center 1.0x option
                                      }}
                                      className="absolute top-3 right-3 bg-slate-950/60 hover:bg-slate-950/80 text-white p-2 rounded-full shadow-lg backdrop-blur-xs transition-all border border-white/10 active:scale-95 cursor-pointer flex items-center justify-center z-10"
                                      title={cameraFacingMode === "environment" ? "Câmera Frontal (Selfie)" : "Câmera Traseira"}
                                      id="toggle_camera_facing_button"
                                    >
                                      <SwitchCamera className="w-4 h-4" />
                                    </button>
                                  )}
                                                                {/* Bottom controls panel containing Left: Mode Selector, Center: Shutter Button, Right: Zoom Wheel */}
                                  <div className="absolute bottom-4 left-0 right-0 px-3 flex items-center justify-between gap-2 z-10 select-none">
                                    
                                    {/* Left Side: FOTO / VÍDEO Mode Selector */}
                                    <div className="w-1/3 flex justify-start pl-1">
                                      {!isRecording ? (
                                        <div className="flex gap-1 p-0.75 bg-slate-950/80 border border-white/10 rounded-full shadow-lg backdrop-blur-md">
                                          <button
                                            type="button"
                                            onClick={() => setCameraMode("photo")}
                                            className={`px-3 py-1.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest transition-all duration-150 cursor-pointer ${
                                              cameraMode === "photo" 
                                                ? "bg-yellow-500 text-slate-950 scale-105 shadow-sm font-black" 
                                                : "text-white/45 hover:text-white"
                                            }`}
                                          >
                                            Foto
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setCameraMode("video")}
                                            className={`px-3 py-1.5 rounded-full text-[9px] font-extrabold uppercase tracking-widest transition-all duration-150 cursor-pointer ${
                                              cameraMode === "video" 
                                                ? "bg-yellow-500 text-slate-950 scale-105 shadow-sm font-black" 
                                                : "text-white/45 hover:text-white"
                                            }`}
                                          >
                                            Vídeo
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="bg-red-950/50 border border-red-500/20 px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-md">
                                          <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                                          <span className="text-[8px] text-red-400 font-black uppercase tracking-wider">Gravando</span>
                                        </div>
                                      )}
                                    </div>

                                    {/* Center Side: Shutter Button */}
                                    <div className="w-1/3 flex justify-center">
                                      <button
                                        type="button"
                                        onClick={handleShutterClick}
                                        className={`relative w-16 h-16 p-1 rounded-full border-4 flex items-center justify-center shadow-lg transform active:scale-95 transition-all duration-300 cursor-pointer ${
                                          isRecording 
                                            ? "bg-white/20 border-red-500 scale-110" 
                                            : cameraMode === "video"
                                              ? "bg-white border-slate-300 hover:bg-red-50 hover:border-slate-100"
                                              : "bg-white hover:bg-red-50 border-slate-300 hover:border-slate-100"
                                        }`}
                                        title={cameraMode === "photo" ? "Capturar Foto" : isRecording ? "Parar Gravação" : "Iniciar Gravação de Vídeo"}
                                        id="shutter_button"
                                      >
                                        {cameraMode === "photo" ? (
                                          <div className="w-10 h-10 bg-red-650 rounded-full" />
                                        ) : isRecording ? (
                                          <div className="w-5 h-5 bg-red-650 rounded-xs animate-pulse" />
                                        ) : (
                                          <div className="w-10 h-10 bg-red-600 rounded-full hover:bg-red-700 transition-all shadow-inner border border-red-700" />
                                        )}
                                      </button>
                                    </div>

                                    {/* Right Side: Zoom Wheel/Pills Selector */}
                                    <div className="w-1/3 flex justify-end pr-1">
                                      <div className="relative w-32 h-8 bg-slate-950/85 border border-white/10 rounded-full flex items-center shadow-2xl backdrop-blur-md" id="zoom_pills_wrapper">
                                        {/* Left Overlay Gradient */}
                                        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-slate-950 to-transparent pointer-events-none rounded-l-full z-15" />
                                        
                                        {/* Right Overlay Gradient */}
                                        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-slate-950 to-transparent pointer-events-none rounded-r-full z-15" />

                                        {/* Horizontal scroll container with custom scrollPadding and snap properties */}
                                        <div 
                                          ref={zoomContainerRef}
                                          onScroll={handleZoomScroll}
                                          className="w-full h-full flex items-center gap-1 overflow-x-auto scrollbar-none snap-x snap-mandatory px-[50px]"
                                          style={{ scrollPadding: "0 50px" }}
                                          id="zoom_pills_container"
                                        >
                                          {ZOOM_OPTIONS.map((val, idx) => {
                                            const isSelected = zoomLevel === val;
                                            return (
                                              <button
                                                key={val}
                                                ref={(el) => { zoomOptionRefs.current[idx] = el; }}
                                                type="button"
                                                onClick={() => selectZoom(val, idx)}
                                                className={`w-7 h-7 rounded-full text-[8.5px] font-black tracking-tighter transition-all duration-200 cursor-pointer flex-shrink-0 flex items-center justify-center snap-center ${
                                                  isSelected
                                                    ? "bg-yellow-500 text-slate-950 scale-105 shadow-md ring-2 ring-yellow-400/20 z-10 font-bold"
                                                    : "text-white/40 scale-90 hover:text-white"
                                                }`}
                                                title={`Zoom ${val === 0.5 ? "0.5x" : `${val}x`}`}
                                              >
                                                {val === 0.5 ? "0,5" : `${val}x`}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    </div>

                                  </div>
                                </div>
                              )}
                            </motion.div>
                          ) : (
                            /* Local File Upload view */
                            <motion.div
                              key="upload-view"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="p-6 text-center flex flex-col items-center justify-center h-full w-full cursor-pointer hover:bg-slate-900/50 transition-colors"
                              onClick={triggerUploadClick}
                              id="upload_drop_zone"
                            >
                              <div className="w-14 h-14 bg-slate-800 text-slate-300 rounded-full flex items-center justify-center mb-3">
                                <Upload className="w-6 h-6" />
                              </div>
                              <p className="text-slate-300 text-xs font-semibold mb-1">
                                Clique para selecionar fotos
                              </p>
                              <p className="text-slate-500 text-[11px]">
                                Você pode selecionar várias fotos de uma vez!
                              </p>
                              <p className="text-slate-600 text-[10px] mt-1 italic">
                                Formatos aceitos: JPEG, PNG
                              </p>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleFileChange}
                                className="hidden"
                                id="hidden_input_file"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Mode Switcher Buttons (replaces the instructions text) */}
                      <div className="mt-4 mb-1 flex justify-center" id="workspace_mode_switcher_panel">
                        <div className="bg-slate-100 p-0.75 rounded-2xl flex items-center border border-slate-200/60 shadow-inner w-52 justify-between">
                          <button
                            type="button"
                            onClick={() => setSelectedMode("camera")}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer ${
                              selectedMode === "camera"
                                ? "bg-white text-blue-600 shadow-xs scale-102"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            id="workspace_mode_camera"
                          >
                            <Camera className={`w-4 h-4 ${selectedMode === "camera" ? "text-blue-600" : "text-slate-450"}`} />
                            <span>Foto</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMode("upload")}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-xl text-xs font-black transition-all duration-200 cursor-pointer ${
                              selectedMode === "upload"
                                ? "bg-white text-blue-600 shadow-xs scale-102"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            id="workspace_mode_upload"
                          >
                            <Upload className={`w-4 h-4 ${selectedMode === "upload" ? "text-blue-600" : "text-slate-450"}`} />
                            <span>Arq</span>
                          </button>
                        </div>
                      </div>

                      {/* LIVE GALLERY DRAWER SECTION */}
                      <div className="mt-5 border-t border-slate-100 pt-4" id="gallery_drawer">
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                            Galeria Temporária ({capturedPhotos.length} item{capturedPhotos.length !== 1 ? "s" : ""})
                          </label>
                          {capturedPhotos.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setCapturedPhotos([])}
                              className="text-[10px] text-red-500 hover:text-red-700 font-bold transition-colors cursor-pointer"
                              id="clear_gallery_btn"
                            >
                              Limpar Tudo
                            </button>
                          )}
                        </div>

                        {capturedPhotos.length > 0 ? (
                          <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-40 overflow-y-auto p-1 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                            {capturedPhotos.map((photo, idx) => {
                              const isVideo = photo.startsWith("data:video/");
                              return (
                                <div 
                                  key={idx} 
                                  onClick={() => setPreviewPhoto(photo)}
                                  className="relative aspect-square group border border-slate-200 hover:border-blue-500 rounded-lg overflow-hidden bg-slate-950 shadow-2xs flex items-center justify-center cursor-zoom-in transition-all duration-200"
                                >
                                  {isVideo ? (
                                    <video src={photo} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" muted loop playsInline />
                                  ) : (
                                    <img src={photo} alt={`Item ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105" />
                                  )}
                                  
                                  {/* Subtly darkened overlay on hover with Eye icon in the client-side center */}
                                  <div className="absolute inset-0 bg-slate-900/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                    <div className="p-1.5 bg-white/90 text-slate-800 rounded-full shadow-md">
                                      <Eye className="w-4 h-4" />
                                    </div>
                                  </div>

                                  {/* Absolute Delete Button with safe stopPropagation */}
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation(); // Prevents triggering previewPhoto click
                                      setCapturedPhotos(prev => prev.filter((_, i) => i !== idx));
                                    }}
                                    className="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded-full hover:bg-red-700 transition-colors cursor-pointer z-10 shadow-md"
                                    title="Excluir"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>

                                  <span className="absolute bottom-1 right-1 px-1 text-[8px] font-bold bg-slate-900/70 text-white rounded flex items-center gap-1 leading-none">
                                    {isVideo && <Video className="w-2.5 h-2.5 text-yellow-400" />}
                                    #{idx + 1}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-6 bg-slate-50 border border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center gap-1.5 text-slate-400">
                            <Camera className="w-6 h-6 opacity-40 text-slate-500" />
                            <span className="text-[11px] font-semibold text-slate-500">Nenhuma foto capturada ainda</span>
                            <span className="text-[10px] px-4 leading-relaxed">Suas fotos aparecerão aqui em lote pronto para envio e verificação.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Mail Setup and dispatch dashboard (Col-Span 5 / 12) */}
                  <div className="md:col-span-5" id="form_block">
                    <form onSubmit={handleSendEmail} className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col gap-4">
                      <div>
                        <h3 className="font-sans font-semibold text-base text-slate-900 tracking-tight flex items-center gap-1.5" id="form_heading">
                          <Mail className="w-4.5 h-4.5 text-blue-600" /> Detalhes do Envio
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">Preencha os campos para salvar a foto direto no e-mail</p>
                      </div>

                      {/* Photo verification notification */}
                      {capturedPhotos.length === 0 && (
                        <div className="p-3.5 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl flex gap-2 animate-snappy" id="photo_warning">
                          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                          <span className="leading-snug">Você precisa realizar <strong>pelo menos uma captura com a câmera</strong> ou <strong>fazer upload de arquivos</strong> antes de prosseguir com o envio.</span>
                        </div>
                      )}

                      {/* Input fields */}
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-700" htmlFor="recipient_email">
                            E-mail de Destino
                          </label>
                          <div className="relative">
                            <input
                              type="email"
                              id="recipient_email"
                              required
                              value={recipientEmail}
                              onChange={(e) => setRecipientEmail(e.target.value)}
                              placeholder="exemplo@gmail.com"
                              className="w-full text-sm pl-9 pr-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-600 font-medium"
                            />
                            <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                          </div>
                          {user ? (
                            <span className="text-[10px] text-slate-400">Preenchido com a sua conta Google conectada.</span>
                          ) : (
                            <span className="text-[10px] text-emerald-600 font-medium">⚡ Modo Envio Direto ativo! Digite qualquer e-mail de destino.</span>
                          )}
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-700" htmlFor="email_subject">
                            Assunto do E-mail
                          </label>
                          <input
                            type="text"
                            id="email_subject"
                            required
                            value={emailSubject}
                            onChange={(e) => setEmailSubject(e.target.value)}
                            placeholder="Assunto da mensagem"
                            className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-600 font-medium"
                          />
                        </div>

                        <div className="flex flex-col gap-1">
                          <label className="text-xs font-semibold text-slate-700" htmlFor="email_body">
                            Mensagem (Opcional)
                          </label>
                          <textarea
                            id="email_body"
                            rows={3}
                            value={emailBody}
                            onChange={(e) => setEmailBody(e.target.value)}
                            placeholder="Escreva uma observação sobre este lote de fotos..."
                            className="w-full text-sm px-3 py-2 border border-slate-200 rounded-xl focus:outline-hidden focus:border-blue-600 resize-none font-medium"
                          />
                        </div>
                      </div>

                      {sendingError && (
                        <div className="p-3 text-xs bg-red-50 text-red-600 border border-red-100 rounded-xl flex items-center gap-2">
                          <AlertCircle className="w-4.5 h-4.5 shrink-0" />
                          <span>{sendingError}</span>
                        </div>
                      )}

                      {/* Send submit button */}
                      <button
                        type="submit"
                        disabled={isSending || capturedPhotos.length === 0}
                        className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md active:shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        id="submit_email_button"
                      >
                        {isSending ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Enviando {capturedPhotos.length} Foto(s)...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" /> Enviar {capturedPhotos.length > 0 ? `${capturedPhotos.length} foto(s)` : ""} para o E-mail
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                </div>
              )}
            </div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer copyright and detailings */}
      <footer className="py-6 px-4 text-center border-t border-slate-200 bg-white" id="app_footer">
        <p className="text-xs text-slate-400 font-medium">
          Foto para E-mail &bull; Desenvolvido com segurança utilizando as APIs oficiais do Google Workspace.
        </p>
      </footer>

      {/* Ligtbox overlay */}
      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
            onClick={() => setPreviewPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="relative max-w-3xl w-full max-h-[85vh] rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="absolute top-4 right-4 z-10">
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="p-2 bg-black/60 text-white hover:bg-red-650 rounded-full transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 bg-slate-950/25 backdrop-blur-md absolute bottom-0 inset-x-0 text-white text-xs select-none">
                Visualização em tamanho real
              </div>
              <div className="flex-1 overflow-auto flex items-center justify-center min-h-[40vh] p-4">
                {previewPhoto.startsWith("data:video/") ? (
                  <video src={previewPhoto} controls autoPlay className="max-w-full max-h-[75vh] rounded-lg shadow-2xl" id="lightbox_video" />
                ) : (
                  <img src={previewPhoto} alt="Exibição em tamanho real" className="max-w-full max-h-[80vh] object-contain shadow-2xl" />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden helper elements canvas schema */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
