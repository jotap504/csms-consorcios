import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Input, Label,
} from '@/components/ui';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

// Cambio de contrasena autogestionado, disponible para cualquier rol logueado
// (se monta desde el menu de AdminLayout y de Layout). Distinto del flujo
// olvide-mi-contrasena por email: aca el usuario ya esta adentro y confirma
// su clave actual contra POST /auth/change-password.
export default function ChangePasswordDialog({ trigger }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [guardando, setGuardando] = useState(false);

  function actualizar(campo, valor) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (form.newPassword.length < 8) {
      toast.error('La nueva contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      toast.error('Las contrasenas nuevas no coinciden.');
      return;
    }
    setGuardando(true);
    try {
      await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success('Contrasena actualizada.');
      setForm(EMPTY);
      setOpen(false);
    } catch (err) {
      toast.error(err.response?.data?.error ?? 'No se pudo cambiar la contrasena.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setForm(EMPTY); }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <button
            type="button"
            className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:justify-start md:py-2"
          >
            <KeyRound className="h-5 w-5 shrink-0 md:h-4 md:w-4" />
            <span className="hidden md:inline">Cambiar contrasena</span>
          </button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar contrasena</DialogTitle>
          <DialogDescription>Confirma tu contrasena actual y elegi una nueva (minimo 8 caracteres).</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="currentPassword">Contrasena actual</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => actualizar('currentPassword', e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="newPassword">Nueva contrasena</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.newPassword}
              onChange={(e) => actualizar('newPassword', e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirmPassword">Repetir nueva contrasena</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={form.confirmPassword}
              onChange={(e) => actualizar('confirmPassword', e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={guardando} className="self-end">
            {guardando ? 'Guardando...' : 'Guardar'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
