import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Zap, ArrowLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle, CardDescription, Input, Label } from '@/components/ui';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
    } finally {
      setLoading(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Zap className="h-5 w-5" />
          </div>
          <CardTitle className="text-xl">Recuperar contrasena</CardTitle>
          <CardDescription>Te enviamos un link para elegir una nueva</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col gap-4 text-center">
              <p className="text-sm text-muted-foreground">
                Si el email existe en el sistema, te llegara un link de recuperacion valido por 1 hora.
              </p>
              <Link to="/login" className="text-sm font-medium text-primary hover:underline">
                Volver a iniciar sesion
              </Link>
            </div>
          ) : (
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
              <Button type="submit" size="lg" disabled={loading} className="mt-1">
                {loading ? 'Enviando...' : 'Enviar link'}
              </Button>
              <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver a iniciar sesion
              </Link>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
