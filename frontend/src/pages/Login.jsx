import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { api } from '@/lib/api';
import { saveSession, homeForRole } from '@/lib/auth';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label } from '@/components/ui';
import ThemeToggle from '@/components/ThemeToggle';
import Logo from '@/components/Logo';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const googleButtonRef = useRef(null);

  async function afterLogin(data) {
    saveSession(data);
    const next = searchParams.get('next');
    navigate(next && next.startsWith('/') ? next : homeForRole(data.rol));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      await afterLogin(data);
    } catch {
      setError('Email o contrasena incorrectos.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || showIntro) return undefined;

    async function handleGoogleCredential(response) {
      setError('');
      try {
        const { data } = await api.post('/auth/google', { credential: response.credential });
        await afterLogin(data);
      } catch (err) {
        setError(err.response?.data?.error || 'No se pudo iniciar sesion con Google.');
      }
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      if (!googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleGoogleCredential,
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, {
        theme: 'outline',
        size: 'large',
        width: Math.min(320, googleButtonRef.current.offsetWidth),
        text: 'signin_with',
        locale: 'es',
      });
    };
    document.head.appendChild(script);
    return () => script.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showIntro]);

  if (showIntro) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <video
          className="h-full w-full object-contain"
          src="/intromob.mp4"
          autoPlay
          muted
          playsInline
          onEnded={() => setShowIntro(false)}
        />
        <button
          onClick={() => setShowIntro(false)}
          className="absolute right-4 top-4 cursor-pointer rounded-lg bg-white/10 px-3 py-1.5 text-sm text-white backdrop-blur transition-colors hover:bg-white/20"
        >
          Saltar
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <ThemeToggle className="fixed right-4 top-4" />
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <Logo className="mb-2 h-12 w-auto" />
          <CardTitle className="text-xl">CSMS Consorcios</CardTitle>
          <CardDescription>Ingresa a tu cuenta para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="password">Contrasena</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <Link to="/forgot-password" className="mt-1.5 inline-block text-xs text-muted-foreground hover:text-primary hover:underline">
                Olvidaste tu contrasena?
              </Link>
            </div>

            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button type="submit" size="lg" disabled={loading} className="mt-1">
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </form>

          {GOOGLE_CLIENT_ID && (
            <>
              <div className="my-4 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">o</span>
                <span className="h-px flex-1 bg-border" />
              </div>
              <div ref={googleButtonRef} className="flex justify-center" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
