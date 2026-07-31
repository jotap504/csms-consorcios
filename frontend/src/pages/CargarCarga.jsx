import { useParams } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { clearSession } from '@/lib/auth';
import CargadorControl from '@/components/CargadorControl';

export default function CargarCarga() {
  const { ocppId } = useParams();

  return (
    <div className="flex min-h-dvh flex-col items-center bg-background px-4 py-6">
      <div className="flex w-full max-w-sm items-center justify-between">
        <img src="/logo.png" alt="Bilon Smart Buildings" className="h-7 w-auto" />
        <button
          onClick={() => { clearSession(); window.location.href = '/login'; }}
          className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <LogOut className="h-3.5 w-3.5" />
          Salir
        </button>
      </div>

      <div className="mt-6 w-full max-w-sm">
        <CargadorControl ocppId={ocppId} />
      </div>
    </div>
  );
}
