import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { ChevronDownIcon } from "./Icons";

export function Button({
  icon,
  label,
  showLabel = true,
  pressed,
  variant = "default",
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  label: string;
  showLabel?: boolean;
  pressed?: boolean;
  variant?: "default" | "primary" | "invisible";
}) {
  return (
    <button
      type="button"
      className={["xv-btn", `xv-btn--${variant}`, showLabel ? "" : "xv-btn--icon", className ?? ""]
        .filter(Boolean)
        .join(" ")}
      aria-label={showLabel ? undefined : label}
      aria-pressed={pressed}
      title={rest.title ?? (showLabel ? undefined : label)}
      {...rest}
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </button>
  );
}

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
}

export function Menu({ label, icon, items }: { label: string; icon?: ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    itemsRef.current[0]?.focus();
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = itemsRef.current.filter(Boolean) as HTMLButtonElement[];
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const next = e.key === "ArrowDown" ? (i + 1) % els.length : (i - 1 + els.length) % els.length;
    els[next]?.focus();
  };

  return (
    <div className="xv-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="xv-btn xv-btn--default"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {icon}
        <span>{label}</span>
        <ChevronDownIcon size={12} />
      </button>
      {open && (
        <div className="xv-menu__list" role="menu" onKeyDown={onMenuKey}>
          {items.map((item, i) => (
            <button
              key={item.id}
              ref={(el) => {
                itemsRef.current[i] = el;
              }}
              type="button"
              role="menuitem"
              className="xv-menu__item"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
                item.onSelect();
              }}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ToastKind = "info" | "error";
interface ToastState {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((message: string, kind: ToastKind = "info") => {
    setToast({ id: Date.now(), message, kind });
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.kind === "error" ? 5000 : 2200);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="xv-toast-region" role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`xv-toast xv-toast--${toast.kind}`}>
            {toast.message}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

export function Spinner({ label }: { label: string }) {
  return (
    <div className="xv-center" role="status">
      <div className="xv-spinner" aria-hidden="true" />
      <p className="xv-muted">{label}</p>
    </div>
  );
}
