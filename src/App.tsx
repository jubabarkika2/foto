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
  ArrowRight
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
  }, []);

  // App-specific states
  const [selectedMode, setSelectedMode] = useState<"camera" | "upload">("camera");
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendingError, setSendingError] = useState<string | null>(null);

  // Camera states
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isCameraLoading, setIsCameraLoading] = useState(false);

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
        setEmailSubject(`Foto de Email - ${formatter.format(now)}`);
        setEmailBody("Olá! Segue em anexo a foto enviada diretamente através do aplicativo Foto para E-mail.");
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

  // Sync camera when mode transitions to "camera"
  useEffect(() => {
    if (selectedMode === "camera" && !needsAuth && !capturedPhoto) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [selectedMode, needsAuth, capturedPhoto]);

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
        setEmailSubject(`Foto de Email - ${formatter.format(now)}`);
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
      setCapturedPhoto(null);
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

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
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
        // Mirrored if using human-facing camera? No, standard draw is clear.
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
        setCapturedPhoto(dataUrl);
        stopCamera();
      }
    }
  };

  // Upload handling
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCapturedPhoto(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerUploadClick = () => {
    fileInputRef.current?.click();
  };

  // Email sending orchestration
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !capturedPhoto) return;

    // Mutating/sending verification
    const confirmed = window.confirm(
      `Deseja enviar esta foto para o e-mail: ${recipientEmail}?`
    );
    if (!confirmed) return;

    setIsSending(true);
    setSendingError(null);

    try {
      // Strip off "data:image/jpeg;base64," prefix for the Gmail REST call
      const match = capturedPhoto.match(/^data:(image\/[a-zA-Z+.-]+);base64,(.+)$/);
      if (!match) {
        throw new Error("Formato de imagem inválido.");
      }

      const fileType = match[1];
      const base64Content = match[2];
      
      const attachment: GmailAttachment = {
        fileName: `foto_capturada_${Date.now()}.jpg`,
        fileType: fileType,
        base64Content: base64Content
      };

      await sendGmailMessage(
        token,
        recipientEmail,
        emailSubject || "Foto Enviada",
        emailBody || "",
        [attachment]
      );

      setSendSuccess(true);
    } catch (err: any) {
      console.error("Failed to send email:", err);
      setSendingError(
        err.message || "Erro desconhecido ao enviar e-mail. Verifique a conexão ou tente efetuar login novamente."
      );
    } finally {
      setIsSending(false);
    }
  };

  const resetState = () => {
    setCapturedPhoto(null);
    setSendSuccess(false);
    setSendingError(null);
    
    // Refresh datetime strings
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    });
    setEmailSubject(`Foto de Email - ${formatter.format(now)}`);
    
    if (selectedMode === "camera") {
      startCamera();
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col font-sans transition-colors duration-200" id="main_container">
      {/* Top Professional Header */}
      <header className="bg-white border-b border-slate-200 py-4 px-6 sticky top-0 z-10 shadow-xs" id="app_header">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2.5 rounded-xl shadow-sm" id="logo_container">
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-sans font-semibold text-lg tracking-tight text-slate-950" id="app_title">
                Foto para E-mail
              </h1>
              <p className="text-xs text-slate-500 font-medium" id="app_subtitle">
                Tire fotos e salve instantaneamente na sua caixa postal
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {user && (
              <div className="flex items-center gap-3 bg-slate-100 py-1.5 pl-3 pr-2 rounded-full border border-slate-200" id="user_profile_badge">
                <div className="text-right hidden sm:block">
                  <div className="text-xs font-semibold text-slate-900 leading-tight">{user.displayName}</div>
                  <div className="text-[10px] text-slate-500 font-mono leading-none">{user.email}</div>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Foto Perfil" className="w-8 h-8 rounded-full border border-white object-cover shadow-xs" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-sm">
                    {user.displayName?.charAt(0) || <User className="w-4 h-4" />}
                  </div>
                )}
                <button 
                  onClick={handleLogout} 
                  className="p-1 text-slate-500 hover:text-red-600 transition-colors duration-150 rounded-full hover:bg-slate-200"
                  title="Sair da Conta"
                  id="logout_button"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
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
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                    <span>Tutorial: Como Resolver no Celular</span>
                  </div>
                  <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                    Se você está no celular ou de dentro de redes sociais (WhatsApp, Instagram, etc.), o navegador interno bloqueia a janela de login do Google por segurança.
                  </p>
                  <p className="text-[11px] text-amber-700 leading-relaxed font-bold">
                    Para funcionar 100%: toque no botão abaixo para abrir diretamente no seu navegador padrão (Safari ou Chrome), ou copie o link e cole no navegador!
                  </p>
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => window.open(window.location.href, "_blank")}
                      className="flex-1 py-2 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-all shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>Abrir Nova Aba</span>
                      <ArrowRight className="w-3 h-3 rotate-[-45deg]" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(window.location.href);
                        setIsCopied(true);
                        setTimeout(() => setIsCopied(false), 2000);
                      }}
                      className="flex-1 py-2 bg-white border border-amber-300 hover:bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      {isCopied ? "Copiado!" : "Copiar Link"}
                    </button>
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

              <div className="mt-8 text-[11px] text-slate-400 font-medium" id="terms_badge">
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
                  className="bg-white border border-slate-200 rounded-3xl p-8 sm:p-12 text-center shadow-lg max-w-md mx-auto"
                  id="success_card"
                >
                  <div className="w-20 h-20 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6 border border-green-100">
                    <CheckCircle className="w-10 h-10" />
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight text-slate-900 mb-2" id="success_heading">
                    E-mail Enviado!
                  </h2>
                  <p className="text-slate-600 text-sm mb-6" id="success_description">
                    Sua foto foi enviada com sucesso para <strong className="text-slate-900 break-all">{recipientEmail}</strong> de forma direta e segura.
                  </p>

                  {capturedPhoto && (
                    <div className="w-full h-40 rounded-2xl overflow-hidden border border-slate-200 mb-6 bg-slate-50 relative">
                      <img src={capturedPhoto} alt="Foto Enviada" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="flex flex-col gap-3">
                    <button
                      onClick={resetState}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-sm"
                      id="shoot_again_button"
                    >
                      <Camera className="w-4 h-4" />
                      Capturar Outra Foto
                    </button>
                    <button
                      onClick={() => setSendSuccess(false)}
                      className="w-full py-3 text-slate-500 hover:text-slate-900 hover:bg-slate-100 font-medium rounded-xl transition-all text-sm"
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
                    <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-xs">
                      {/* Mode Tab Option selectors */}
                      {!capturedPhoto && (
                        <div className="flex bg-slate-100 p-1 rounded-xl mb-4" id="mode_tabs">
                          <button
                            onClick={() => setSelectedMode("camera")}
                            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                              selectedMode === "camera"
                                ? "bg-white text-slate-900 shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            id="mode_tab_camera"
                          >
                            <Camera className="w-4 h-4" />
                            Câmera
                          </button>
                          <button
                            onClick={() => setSelectedMode("upload")}
                            className={`flex-1 py-2 text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition-all ${
                              selectedMode === "upload"
                                ? "bg-white text-slate-900 shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                            }`}
                            id="mode_tab_upload"
                          >
                            <Upload className="w-4 h-4" />
                            Upload de Arquivo
                          </button>
                        </div>
                      )}

                      {/* WORKZONE STAGE */}
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center group" id="workzone_stage">
                        <AnimatePresence mode="wait">
                          {capturedPhoto ? (
                            /* Preview Stage content */
                            <motion.div
                              key="captured-preview"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                              className="absolute inset-0 w-full h-full flex flex-col"
                            >
                              <img src={capturedPhoto} alt="Preview" className="w-full h-full object-cover" />
                              <div className="absolute top-3 right-3 flex items-center gap-2">
                                <button
                                  onClick={() => setCapturedPhoto(null)}
                                  className="bg-black/60 hover:bg-red-600/90 text-white p-2.5 rounded-full transition-all duration-150 backdrop-blur-md hover:scale-105"
                                  title="Excluir Imagem"
                                  id="delete_photo_button"
                                >
                                  <Trash2 className="w-4.5 h-4.5" />
                                </button>
                              </div>
                              <div className="absolute bottom-3 left-3 bg-black/60 text-white px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-md">
                                Pronto para enviar
                              </div>
                            </motion.div>
                          ) : selectedMode === "camera" ? (
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
                                  />
                                  {/* Overlay Shutter overlay triggers */}
                                  <div className="absolute bottom-4 left-0 right-0 flex justify-center">
                                    <button
                                      onClick={capturePhoto}
                                      className="w-16 h-16 bg-white hover:bg-red-55 px-2 rounded-full border-4 border-slate-300 flex items-center justify-center shadow-lg transform active:scale-95 transition-all cursor-pointer hover:border-slate-100"
                                      title="Capturar Foto"
                                      id="shutter_button"
                                    >
                                      <div className="w-10 h-10 bg-red-600 rounded-full" />
                                    </button>
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
                                Clique para selecionar uma foto
                              </p>
                              <p className="text-slate-500 text-[11px]">
                                Formatos aceitos: JPEG, PNG
                              </p>
                              <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                onChange={handleFileChange}
                                className="hidden"
                                id="hidden_input_file"
                              />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Auxiliary helper details */}
                      {!capturedPhoto && selectedMode === "camera" && (
                        <p className="text-[11px] text-slate-400 mt-2.5 text-center flex items-center justify-center gap-1">
                          <Sparkles className="w-3.5 h-3.5 text-yellow-500 shrink-0" />
                          Aponte para o objeto que você quer registrar e clique no botão circular vermelho para capturar.
                        </p>
                      )}
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
                      {!capturedPhoto && (
                        <div className="p-3.5 text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-2xl flex gap-2" id="photo_warning">
                          <AlertCircle className="w-5 h-5 shrink-0 text-amber-600" />
                          <span className="leading-snug">Você precisa <strong>capturar uma foto com a câmera</strong> ou <strong>fazer upload de uma imagem</strong> antes de poder enviar.</span>
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
                          <span className="text-[10px] text-slate-400">Default preenchido com a sua conta logada.</span>
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
                            placeholder="Escreva uma observação sobre esta foto..."
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
                        disabled={isSending || !capturedPhoto}
                        className="w-full mt-2 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-all shadow-md active:shadow-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        id="submit_email_button"
                      >
                        {isSending ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" /> Enviando Foto...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" /> Enviar para o E-mail
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

      {/* Hidden helper elements canvas schema */}
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
