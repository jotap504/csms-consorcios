import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as LabelPrimitive from '@radix-ui/react-label';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { ChevronDown, Check, X, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { subscribeToasts, toast } from '@/lib/toast';

export function Button({
  className, variant = 'default', size = 'default', loading = false, disabled, children, ...props
}) {
  const variants = {
    default: 'rounded-full bg-primary text-primary-foreground hover:bg-primary/90',
    accent: 'rounded-full bg-accent text-accent-foreground hover:bg-accent/90',
    outline: 'rounded-lg border border-border bg-transparent hover:bg-muted',
    ghost: 'rounded-lg hover:bg-muted',
    destructive: 'rounded-lg bg-destructive text-destructive-foreground hover:bg-destructive/90',
  };
  const sizes = {
    default: 'h-10 px-4 py-2 text-sm',
    sm: 'h-9 px-3 text-sm',
    lg: 'h-11 px-6 text-base',
  };
  return (
    <button
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 font-medium transition-colors duration-200 cursor-pointer disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Card({ className, ...props }) {
  return (
    <div
      className={cn('rounded-2xl border border-border/60 bg-card text-card-foreground shadow-[0_1px_3px_rgba(16,40,48,0.06)]', className)}
      {...props}
    />
  );
}
export function CardHeader({ className, ...props }) {
  return <div className={cn('flex flex-col gap-1 p-5', className)} {...props} />;
}
export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-base font-semibold leading-none', className)} {...props} />;
}
export function CardDescription({ className, ...props }) {
  return <p className={cn('text-sm text-muted-foreground', className)} {...props} />;
}
export function CardContent({ className, ...props }) {
  return <div className={cn('p-5 pt-0', className)} {...props} />;
}

export function Input({ className, ...props }) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }) {
  return (
    <LabelPrimitive.Root
      className={cn('text-sm font-medium leading-none mb-1.5 block', className)}
      {...props}
    />
  );
}

export function Badge({ className, variant = 'default', ...props }) {
  const variants = {
    default: 'bg-primary/10 text-primary',
    accent: 'bg-accent/10 text-accent',
    destructive: 'bg-destructive/10 text-destructive',
    muted: 'bg-muted text-muted-foreground',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export function Table({ className, ...props }) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('w-full text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }) {
  return <thead className={cn('border-b border-border bg-muted/60', className)} {...props} />;
}
export function TableBody({ className, ...props }) {
  return <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />;
}
export function TableRow({ className, ...props }) {
  return (
    <tr
      className={cn('border-b border-border transition-colors hover:bg-muted/50', className)}
      {...props}
    />
  );
}
export function TableHead({ className, ...props }) {
  return (
    <th
      className={cn(
        'h-11 px-3 text-left align-middle text-xs font-semibold text-foreground/70',
        className,
      )}
      {...props}
    />
  );
}
export function TableCell({ className, ...props }) {
  return <td className={cn('px-3 py-3 align-middle', className)} {...props} />;
}

export function Dialog({ children, ...props }) {
  return <DialogPrimitive.Root {...props}>{children}</DialogPrimitive.Root>;
}
export const DialogTrigger = DialogPrimitive.Trigger;
export function DialogContent({ className, children, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-card p-4 shadow-lg sm:p-6',
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 cursor-pointer hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <X className="h-4 w-4" />
          <span className="sr-only">Cerrar</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
export function DialogHeader({ className, ...props }) {
  return <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />;
}
export function DialogTitle({ className, ...props }) {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold', className)} {...props} />;
}
export function DialogDescription({ className, ...props }) {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export function Select({ children, ...props }) {
  return <SelectPrimitive.Root {...props}>{children}</SelectPrimitive.Root>;
}
export function SelectTrigger({ className, children, ...props }) {
  return (
    <SelectPrimitive.Trigger
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}
export const SelectValue = SelectPrimitive.Value;
export function SelectContent({ className, children, ...props }) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        className={cn('z-50 overflow-hidden rounded-lg border border-border bg-card shadow-md', className)}
        {...props}
      >
        <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  );
}
export function SelectItem({ className, children, ...props }) {
  return (
    <SelectPrimitive.Item
      className={cn(
        'relative flex cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-3 text-sm outline-none hover:bg-muted data-[state=checked]:font-medium',
        className,
      )}
      {...props}
    >
      <span className="absolute left-2 inline-flex h-4 w-4 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export function Tabs({ className, ...props }) {
  return <TabsPrimitive.Root className={cn('flex flex-col gap-4', className)} {...props} />;
}
export function TabsList({ className, ...props }) {
  return (
    <TabsPrimitive.List
      className={cn('inline-flex max-w-full items-center gap-5 overflow-x-auto border-b border-border', className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'shrink-0 cursor-pointer whitespace-nowrap border-b-2 border-transparent px-1 py-2.5 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:border-accent data-[state=active]:text-accent',
        className,
      )}
      {...props}
    />
  );
}
export function TabsContent({ className, ...props }) {
  return <TabsPrimitive.Content className={cn('outline-none', className)} {...props} />;
}

const STAT_CARD_COLORS = {
  primary: 'from-teal-500 to-cyan-600',
  blue: 'from-sky-500 to-blue-600',
  emerald: 'from-emerald-500 to-teal-600',
  amber: 'from-amber-500 to-orange-500',
  violet: 'from-violet-500 to-purple-600',
  rose: 'from-rose-500 to-pink-600',
};

export function StatCard({
  icon: Icon, label, value, hint, color = 'primary',
}) {
  const gradient = STAT_CARD_COLORS[color] ?? STAT_CARD_COLORS.primary;
  return (
    <div className={cn('flex items-center gap-3.5 overflow-hidden rounded-2xl bg-gradient-to-br p-4.5 text-white shadow-[0_4px_14px_rgba(16,80,90,0.18)]', gradient)}>
      {Icon && (
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon className="h-5.5 w-5.5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-white/85">{label}</p>
        <p className="tabular-nums mt-0.5 text-2xl font-semibold">{value}</p>
        {hint && <p className="mt-0.5 truncate text-xs text-white/75">{hint}</p>}
      </div>
    </div>
  );
}

export function Switch({ className, ...props }) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent transition-colors data-[state=checked]:bg-accent data-[state=unchecked]:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-5 w-5 translate-x-0.5 rounded-full bg-white shadow-sm transition-transform data-[state=checked]:translate-x-[22px]" />
    </SwitchPrimitive.Root>
  );
}

// Feedback global (reemplaza alert()/exito silencioso) - montado una vez en
// Layout, controlado desde cualquier lugar via toast.success()/toast.error().
export function Toaster() {
  const [items, setItems] = React.useState([]);

  React.useEffect(() => subscribeToasts(setItems), []);

  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
      {items.map((item) => (
        <div
          key={item.id}
          role="status"
          aria-live="polite"
          className={cn(
            'pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-card p-3.5 text-sm shadow-lg animate-in fade-in-0 slide-in-from-bottom-2',
            item.variant === 'error' ? 'border-destructive/30' : 'border-accent/30',
          )}
        >
          {item.variant === 'error' ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          )}
          <p className="flex-1 leading-snug text-foreground">{item.message}</p>
          <button
            type="button"
            aria-label="Cerrar notificacion"
            onClick={() => toast.dismiss(item.id)}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
