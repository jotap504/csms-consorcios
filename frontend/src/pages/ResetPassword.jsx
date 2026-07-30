import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Zap, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label } from '@/components/ui';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Las contrasenas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error ?? 'No se pudo actualizar la contrasena.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Elegi tu contrasena</CardTitle>
          <CardDescription>Minimo 8 caracteres</CardDescription>
        </CardHeader>
        <CardContent>
          {!token ? (
            <p className="text-sm text-destructive">Link invalido: falta el token.</p>
          ) : done ? (
            <div role="status" className="flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm text-accent">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              Contrasena actualizada. Redirigiendo...
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
              <div>
                <Label htmlFor="password">Nueva contrasena</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="confirm">Confirmar contrasena</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {error && (
                <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}
              <Button type="submit" size="lg" disabled={loading} className="mt-1">
                {loading ? 'Guardando...' : 'Guardar contrasena'}
              </Button>
              <Link to="/login" className="text-center text-sm text-muted-foreground hover:text-foreground">
                Volver a iniciar sesion
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
