'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { CustomerDisplayEvent } from '@/hooks/use-customer-display';
import { displayDiscountPercent } from '@/lib/tax-utils';

const CHANNEL_NAME = 'pos-customer-display';
const IDLE_TIMEOUT_MS = 60_000;

type Screen =
  | { kind: 'idle' }
  | { kind: 'cart'; items: any[]; subtotal: number; discount: number; total: number; currency: string }
  | { kind: 'payment'; total: number; tendered: number; change: number; currency: string }
  | { kind: 'complete'; change: number; orNumber: string; currency: string };

interface DisplaySettings {
  message: string;
  showLogo: boolean;
  logoPath: string | null;
  businessName: string;
}

function fmt(n: number, currency = '₱') {
  return `${currency}${n.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;
}

// ─── Theme tokens ────────────────────────────────────────────────────────────

interface Tk {
  // backgrounds
  idleBg: string;
  cartBg: string;
  paymentBg: string;
  completeBg: string;
  // ambient glow behind center content
  idleGlow: string;
  paymentGlow: string;
  completeGlow: string;
  // particles
  particleBorder: string;
  particleFill: string;
  // text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textVeryMuted: string;
  // dividers / borders
  borderColor: string;
  headerBg: string;
  panelBg: string;
  // numbers
  amountColor: string;
  amountGlow: string;
  changeColor: string;
  changeGlow: string;
  changePanelBg: string;
  changePanelBorder: string;
  // discount badge
  discountBg: string;
  discountBorder: string;
  discountText: string;
  // row number
  rowNumColor: string;
  // accent bar on cart header
  accentBar: string;
  // complete check ring
  checkRingBg: string;
  checkRingBorder: string;
  checkIconColor: string;
  // OR pill
  orPillBg: string;
  orPillBorder: string;
  orLabelColor: string;
  orValueColor: string;
  // clock
  clockColor: string;
  clockGlow: string;
  dateColor: string;
  // horizontal divider
  dividerGradient: string;
}

const DARK: Tk = {
  idleBg: 'radial-gradient(ellipse at 50% 40%, #1a1535 0%, #0d0d1f 55%, #07070f 100%)',
  cartBg: 'radial-gradient(ellipse at 50% 0%, #0e1929 0%, #080f1a 55%, #040810 100%)',
  paymentBg: 'radial-gradient(ellipse at 50% 40%, #0b1929 0%, #060f1c 55%, #030810 100%)',
  completeBg: 'radial-gradient(ellipse at 50% 40%, #063020 0%, #041a12 55%, #020d09 100%)',

  idleGlow: 'radial-gradient(circle, rgba(255,255,255,0.06) 0%, transparent 70%)',
  paymentGlow: 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
  completeGlow: 'radial-gradient(circle, rgba(16,185,129,0.14) 0%, transparent 70%)',

  particleBorder: 'rgba(255,255,255,0.05)',
  particleFill: 'rgba(255,255,255,0.03)',

  textPrimary: '#ffffff',
  textSecondary: 'rgba(255,255,255,0.75)',
  textMuted: 'rgba(255,255,255,0.45)',
  textVeryMuted: 'rgba(255,255,255,0.25)',

  borderColor: 'rgba(255,255,255,0.08)',
  headerBg: 'rgba(255,255,255,0.03)',
  panelBg: 'rgba(255,255,255,0.03)',

  amountColor: '#ffffff',
  amountGlow: 'rgba(147,197,253,0.35)',
  changeColor: 'rgb(110,231,183)',
  changeGlow: 'rgba(110,231,183,0.45)',
  changePanelBg: 'rgba(16,185,129,0.10)',
  changePanelBorder: 'rgba(16,185,129,0.22)',

  discountBg: 'rgba(251,191,36,0.15)',
  discountBorder: 'rgba(251,191,36,0.30)',
  discountText: 'rgb(252,211,77)',

  rowNumColor: 'rgba(255,255,255,0.20)',
  accentBar: 'rgba(147,197,253,0.80)',

  checkRingBg: 'rgba(16,185,129,0.15)',
  checkRingBorder: 'rgba(16,185,129,0.35)',
  checkIconColor: 'rgb(52,211,153)',

  orPillBg: 'rgba(255,255,255,0.07)',
  orPillBorder: 'rgba(255,255,255,0.10)',
  orLabelColor: 'rgba(255,255,255,0.35)',
  orValueColor: 'rgba(255,255,255,0.80)',

  clockColor: '#ffffff',
  clockGlow: 'rgba(255,255,255,0.35)',
  dateColor: 'rgba(255,255,255,0.30)',

  dividerGradient: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
};

const LIGHT: Tk = {
  idleBg: 'linear-gradient(145deg, #f0f4ff 0%, #e8eef7 50%, #dde6f3 100%)',
  cartBg: '#f5f7fb',
  paymentBg: 'linear-gradient(145deg, #eef5ff 0%, #ddeeff 100%)',
  completeBg: 'linear-gradient(145deg, #edfff5 0%, #d8f5e8 100%)',

  idleGlow: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
  paymentGlow: 'radial-gradient(circle, rgba(59,130,246,0.10) 0%, transparent 70%)',
  completeGlow: 'radial-gradient(circle, rgba(22,163,74,0.10) 0%, transparent 70%)',

  particleBorder: 'rgba(100,116,139,0.10)',
  particleFill: 'rgba(100,116,139,0.04)',

  textPrimary: '#0f172a',
  textSecondary: '#334155',
  textMuted: '#64748b',
  textVeryMuted: '#94a3b8',

  borderColor: 'rgba(100,116,139,0.13)',
  headerBg: 'rgba(241,245,249,0.80)',
  panelBg: 'rgba(241,245,249,0.90)',

  amountColor: '#1e3a8a',
  amountGlow: 'rgba(30,58,138,0.12)',
  changeColor: '#14532d',
  changeGlow: 'rgba(20,83,45,0.15)',
  changePanelBg: 'rgba(220,252,231,0.70)',
  changePanelBorder: 'rgba(22,163,74,0.25)',

  discountBg: 'rgba(251,191,36,0.15)',
  discountBorder: 'rgba(245,158,11,0.35)',
  discountText: '#92400e',

  rowNumColor: '#cbd5e1',
  accentBar: '#3b82f6',

  checkRingBg: 'rgba(220,252,231,0.80)',
  checkRingBorder: 'rgba(22,163,74,0.30)',
  checkIconColor: '#16a34a',

  orPillBg: 'rgba(100,116,139,0.08)',
  orPillBorder: 'rgba(100,116,139,0.15)',
  orLabelColor: '#94a3b8',
  orValueColor: '#334155',

  clockColor: '#0f172a',
  clockGlow: 'rgba(15,23,42,0.08)',
  dateColor: '#94a3b8',

  dividerGradient: 'linear-gradient(90deg, transparent, rgba(100,116,139,0.25), transparent)',
};

// ─── Shared particle positions (stable across renders) ───────────────────────

const PARTICLES = [
  { size: 80,  left: 5,  top: 12, dur: 18, delay: 0 },
  { size: 120, left: 18, top: 72, dur: 22, delay: 3 },
  { size: 50,  left: 30, top: 35, dur: 15, delay: 7 },
  { size: 95,  left: 45, top: 85, dur: 25, delay: 1 },
  { size: 140, left: 60, top: 18, dur: 20, delay: 9 },
  { size: 60,  left: 72, top: 58, dur: 17, delay: 4 },
  { size: 110, left: 84, top: 42, dur: 23, delay: 6 },
  { size: 70,  left: 92, top: 78, dur: 19, delay: 2 },
  { size: 45,  left: 10, top: 52, dur: 21, delay: 8 },
  { size: 90,  left: 38, top: 22, dur: 16, delay: 5 },
  { size: 65,  left: 62, top: 65, dur: 24, delay: 0 },
  { size: 100, left: 78, top: 10, dur: 18, delay: 3 },
];

// ─── Clock ───────────────────────────────────────────────────────────────────

function Clock({ tk }: { tk: Tk }) {
  const [display, setDisplay] = useState({ main: '', seconds: '', period: '', date: '' });

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const h = now.getHours();
      const m = now.getMinutes();
      const s = now.getSeconds();
      const period = h >= 12 ? 'PM' : 'AM';
      const h12 = h % 12 || 12;
      setDisplay({
        main: `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
        seconds: String(s).padStart(2, '0'),
        period,
        date: now.toLocaleDateString('en-PH', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="text-center select-none">
      <div className="flex items-start justify-center gap-3">
        <span
          className="font-black font-mono tabular-nums leading-none"
          style={{
            fontSize: '5.5rem',
            letterSpacing: '-3px',
            color: tk.clockColor,
            textShadow: `0 0 40px ${tk.clockGlow}`,
          }}
        >
          {display.main}
        </span>
        <div className="flex flex-col pt-2 gap-1">
          <span className="text-4xl font-bold font-mono leading-none tabular-nums" style={{ color: tk.textMuted }}>
            {display.seconds}
          </span>
          <span className="text-sm font-bold uppercase tracking-widest" style={{ color: tk.textVeryMuted }}>
            {display.period}
          </span>
        </div>
      </div>
      <p className="text-sm mt-3 tracking-[0.25em] uppercase font-medium" style={{ color: tk.dateColor }}>
        {display.date}
      </p>
    </div>
  );
}

// ─── Idle ────────────────────────────────────────────────────────────────────

function IdleScreen({ settings, tk }: { settings: DisplaySettings; tk: Tk }) {
  return (
    <div className="flex flex-col items-center justify-center h-full select-none relative overflow-hidden">
      {/* Floating orbs */}
      {PARTICLES.map((p, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.left}%`,
            top: `${p.top}%`,
            background: `radial-gradient(circle, ${tk.particleFill} 0%, transparent 70%)`,
            border: `1px solid ${tk.particleBorder}`,
            animation: `cdFloat ${p.dur}s ease-in-out ${p.delay}s infinite alternate`,
          }}
        />
      ))}

      {/* Center ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 500,
          height: 500,
          borderRadius: '50%',
          background: tk.idleGlow,
          transform: 'translate(-50%, -50%)',
          left: '50%',
          top: '50%',
        }}
      />

      <div className="relative z-10 flex flex-col items-center gap-10">
        {settings.showLogo && settings.logoPath && (
          <div className="relative">
            <div
              className="absolute inset-0 rounded-full blur-3xl scale-150"
              style={{ background: tk.idleGlow }}
            />
            <img
              src={settings.logoPath}
              alt={settings.businessName}
              className="relative max-h-36 max-w-xs object-contain"
              style={{ filter: 'drop-shadow(0 8px 32px rgba(0,0,0,0.18))' }}
            />
          </div>
        )}

        <div className="text-center space-y-3">
          <h1
            className="text-5xl font-black tracking-tight leading-tight px-8 text-center"
            style={{ color: tk.textPrimary, textShadow: `0 4px 24px ${tk.clockGlow}` }}
          >
            {settings.message || 'Welcome!'}
          </h1>
          {settings.businessName && (
            <p className="text-xl font-light tracking-[0.35em] uppercase" style={{ color: tk.textMuted }}>
              {settings.businessName}
            </p>
          )}
        </div>

        <div className="w-20 h-px" style={{ background: tk.dividerGradient }} />

        <Clock tk={tk} />
      </div>
    </div>
  );
}

// ─── Cart ────────────────────────────────────────────────────────────────────

function CartScreen({ screen, tk }: { screen: Extract<Screen, { kind: 'cart' }>; tk: Tk }) {
  const gross = screen.subtotal;
  const discountAmt = gross - screen.total;

  return (
    <div className="flex h-full select-none">
      {/* Items panel */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div
          className="flex items-center gap-3 px-8 py-5"
          style={{ borderBottom: `1px solid ${tk.borderColor}`, background: tk.headerBg }}
        >
          <div className="w-1 h-7 rounded-full" style={{ background: tk.accentBar }} />
          <div>
            <h2
              className="text-lg font-bold uppercase tracking-widest"
              style={{ color: tk.textPrimary }}
            >
              Current Order
            </h2>
            <p className="text-xs font-medium mt-0.5" style={{ color: tk.textMuted }}>
              {screen.items.length} item{screen.items.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>

        {/* Items list */}
        <div className="flex-1 overflow-auto">
          {screen.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-4" style={{ color: tk.textVeryMuted }}>
              <svg className="w-16 h-16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-1.5 7.5M17 13l1.5 7.5M9 21h6" />
              </svg>
              <p className="text-lg font-medium">No items yet</p>
            </div>
          ) : (
            screen.items.map((item, i) => {
              const lineGross = item.price * item.quantity;
              const lineDiscount = (lineGross * item.discount) / 100;
              const lineTotal = lineGross - lineDiscount;
              return (
                <div
                  key={i}
                  className="flex items-center gap-4 px-8 py-4"
                  style={{ borderBottom: `1px solid ${tk.borderColor}` }}
                >
                  <span
                    className="text-xs font-bold w-5 text-right shrink-0 tabular-nums"
                    style={{ color: tk.rowNumColor }}
                  >
                    {i + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base truncate leading-snug" style={{ color: tk.textPrimary }}>
                      {item.name}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-mono tabular-nums" style={{ color: tk.textMuted }}>
                        {fmt(item.price, screen.currency)} × {item.quantity}
                      </span>
                      {item.discount > 0 && (
                        <span
                          className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{
                            background: tk.discountBg,
                            border: `1px solid ${tk.discountBorder}`,
                            color: tk.discountText,
                          }}
                        >
                          -{displayDiscountPercent(item.discount, item.discountType)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-lg font-bold font-mono tabular-nums shrink-0" style={{ color: tk.textPrimary }}>
                    {fmt(lineTotal, screen.currency)}
                  </p>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Summary sidebar */}
      <div
        className="w-72 flex flex-col"
        style={{ borderLeft: `1px solid ${tk.borderColor}`, background: tk.panelBg }}
      >
        <div className="px-6 py-5" style={{ borderBottom: `1px solid ${tk.borderColor}` }}>
          <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: tk.textVeryMuted }}>
            Summary
          </p>
        </div>

        <div className="flex-1 flex flex-col justify-end p-6 gap-5">
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium" style={{ color: tk.textMuted }}>Subtotal</span>
              <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: tk.textSecondary }}>
                {fmt(gross, screen.currency)}
              </span>
            </div>
            {discountAmt > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium" style={{ color: tk.discountText }}>Discount</span>
                <span className="font-mono text-sm font-semibold tabular-nums" style={{ color: tk.discountText }}>
                  −{fmt(discountAmt, screen.currency)}
                </span>
              </div>
            )}
          </div>

          <div className="h-px" style={{ background: tk.dividerGradient }} />

          <div className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-[0.25em]" style={{ color: tk.textVeryMuted }}>
              Total
            </p>
            <p
              className="font-black font-mono tabular-nums leading-none"
              style={{
                fontSize: '2.8rem',
                color: tk.amountColor,
                textShadow: `0 0 30px ${tk.amountGlow}`,
              }}
            >
              {fmt(screen.total, screen.currency)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Payment ─────────────────────────────────────────────────────────────────

function PaymentScreen({ screen, tk }: { screen: Extract<Screen, { kind: 'payment' }>; tk: Tk }) {
  return (
    <div className="flex flex-col h-full select-none relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 700,
          height: 700,
          borderRadius: '50%',
          background: tk.paymentGlow,
          transform: 'translate(-50%, -50%)',
          left: '50%',
          top: '50%',
        }}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-14 relative z-10 px-8">
        {/* Amount due */}
        <div className="text-center space-y-3">
          <p
            className="text-xs font-bold uppercase tracking-[0.5em]"
            style={{ color: tk.textVeryMuted }}
          >
            Amount Due
          </p>
          <p
            className="font-black font-mono tabular-nums leading-none"
            style={{
              fontSize: 'clamp(5rem, 11vw, 9rem)',
              color: tk.amountColor,
              textShadow: `0 0 60px ${tk.amountGlow}`,
            }}
          >
            {fmt(screen.total, screen.currency)}
          </p>
        </div>

        <div className="w-40 h-px" style={{ background: tk.dividerGradient }} />

        {/* Tendered */}
        <div className="text-center space-y-3">
          <p
            className="text-xs font-bold uppercase tracking-[0.5em]"
            style={{ color: tk.textVeryMuted }}
          >
            Cash Tendered
          </p>
          <p className="text-6xl font-bold font-mono tabular-nums" style={{ color: tk.textSecondary }}>
            {fmt(screen.tendered, screen.currency)}
          </p>
        </div>

        {/* Change */}
        {screen.change > 0 && (
          <div
            className="text-center space-y-3 rounded-2xl px-14 py-7"
            style={{ background: tk.changePanelBg, border: `1px solid ${tk.changePanelBorder}` }}
          >
            <p className="text-xs font-bold uppercase tracking-[0.5em]" style={{ color: tk.changeColor, opacity: 0.7 }}>
              Change
            </p>
            <p
              className="text-5xl font-bold font-mono tabular-nums"
              style={{ color: tk.changeColor, textShadow: `0 0 30px ${tk.changeGlow}` }}
            >
              {fmt(screen.change, screen.currency)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Complete ─────────────────────────────────────────────────────────────────

function CompleteScreen({ screen, tk }: { screen: Extract<Screen, { kind: 'complete' }>; tk: Tk }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex flex-col h-full select-none relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute pointer-events-none"
        style={{
          width: 800,
          height: 800,
          borderRadius: '50%',
          background: tk.completeGlow,
          transform: 'translate(-50%, -50%)',
          left: '50%',
          top: '50%',
        }}
      />

      <div className="flex-1 flex flex-col items-center justify-center gap-8 relative z-10">
        {/* Checkmark */}
        <div
          className="flex items-center justify-center"
          style={{
            width: 112,
            height: 112,
            borderRadius: '50%',
            background: tk.checkRingBg,
            border: `2px solid ${tk.checkRingBorder}`,
            animation: 'cdScaleIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
          }}
        >
          <svg
            style={{ width: 56, height: 56, color: tk.checkIconColor }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>

        {/* Change due */}
        <div className="text-center space-y-2">
          <p
            className="text-xs font-bold uppercase tracking-[0.5em]"
            style={{ color: tk.changeColor, opacity: 0.6 }}
          >
            Change Due
          </p>
          <p
            className="font-black font-mono tabular-nums leading-none"
            style={{
              fontSize: 'clamp(5.5rem, 13vw, 10rem)',
              color: tk.changeColor,
              textShadow: `0 0 60px ${tk.changeGlow}`,
            }}
          >
            {fmt(screen.change, screen.currency)}
          </p>
        </div>

        <div className="w-28 h-px" style={{ background: tk.dividerGradient }} />

        {/* Thank you */}
        <div className="text-center space-y-4">
          <h2
            className="text-5xl font-black tracking-tight"
            style={{ color: tk.textPrimary, textShadow: `0 4px 20px ${tk.clockGlow}` }}
          >
            Thank You!
          </h2>
          {screen.orNumber && (
            <div
              className="inline-flex items-center gap-2 rounded-full px-6 py-2"
              style={{ background: tk.orPillBg, border: `1px solid ${tk.orPillBorder}` }}
            >
              <span className="text-xs font-bold uppercase tracking-widest" style={{ color: tk.orLabelColor }}>
                OR#
              </span>
              <span className="font-bold font-mono tracking-wide" style={{ color: tk.orValueColor }}>
                {screen.orNumber}
              </span>
            </div>
          )}
        </div>

        <p className="text-xs tracking-widest uppercase font-medium mt-2" style={{ color: tk.textVeryMuted }}>
          Returning in {countdown}s
        </p>
      </div>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

const BG_KEY: Record<Screen['kind'], keyof Pick<Tk, 'idleBg' | 'cartBg' | 'paymentBg' | 'completeBg'>> = {
  idle: 'idleBg',
  cart: 'cartBg',
  payment: 'paymentBg',
  complete: 'completeBg',
};

function resolveInitialTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function CustomerDisplayPage() {
  const [screen, setScreen] = useState<Screen>({ kind: 'idle' });
  const [settings, setSettings] = useState<DisplaySettings>({
    message: 'Welcome! Thank you for shopping.',
    showLogo: true,
    logoPath: null,
    businessName: '',
  });
  const [isDark, setIsDark] = useState(true);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Read theme from localStorage on mount (next-themes writes to 'theme' key)
  useEffect(() => {
    setIsDark(resolveInitialTheme() === 'dark');

    // Storage events fire when another window (POS) changes localStorage
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setIsDark(e.newValue === 'dark');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => setScreen({ kind: 'idle' }), IDLE_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    fetch(getApiUrl('/pos-settings'))
      .then((r) => r.json())
      .then((result) => {
        if (result.success) {
          setSettings({
            message: result.data.customerDisplayMessage || 'Welcome! Thank you for shopping.',
            showLogo: result.data.customerDisplayShowLogo !== false,
            logoPath: result.data.logoPath || null,
            businessName: result.data.businessName || '',
          });
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage({ type: 'READY' });

    channel.onmessage = (event: MessageEvent<CustomerDisplayEvent>) => {
      const data = event.data;
      switch (data.type) {
        case 'IDLE':
          setScreen({ kind: 'idle' });
          if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
          break;
        case 'CART_UPDATE':
          setScreen({
            kind: 'cart',
            items: data.items,
            subtotal: data.subtotal,
            discount: data.discount,
            total: data.total,
            currency: data.currency,
          });
          resetIdleTimer();
          break;
        case 'PAYMENT_START':
          setScreen({
            kind: 'payment',
            total: data.total,
            tendered: data.tendered,
            change: Math.max(0, data.tendered - data.total),
            currency: data.currency,
          });
          resetIdleTimer();
          break;
        case 'PAYMENT_UPDATE':
          setScreen((prev) => {
            if (prev.kind !== 'payment') return prev;
            return { ...prev, tendered: data.tendered, change: data.change };
          });
          break;
        case 'PAYMENT_COMPLETE':
          setScreen({
            kind: 'complete',
            change: data.change,
            orNumber: data.orNumber,
            currency: data.currency,
          });
          setTimeout(() => setScreen({ kind: 'idle' }), 5000);
          break;
        case 'SETTINGS':
          setSettings({
            message: data.message,
            showLogo: data.showLogo,
            logoPath: data.logoPath,
            businessName: data.businessName,
          });
          break;
        case 'THEME':
          setIsDark(data.theme === 'dark');
          break;
      }
    };

    return () => {
      channel.close();
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [resetIdleTimer]);

  const tk = isDark ? DARK : LIGHT;

  return (
    <>
      <style>{`
        @keyframes cdFloat {
          0%   { transform: translateY(0px) scale(1);    opacity: 0.6; }
          100% { transform: translateY(-28px) scale(1.08); opacity: 1; }
        }
        @keyframes cdScaleIn {
          0%   { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div
        className="fixed inset-0 transition-all duration-700"
        style={{ background: tk[BG_KEY[screen.kind]] }}
      >
        {screen.kind === 'idle'     && <IdleScreen    settings={settings} tk={tk} />}
        {screen.kind === 'cart'     && <CartScreen    screen={screen}     tk={tk} />}
        {screen.kind === 'payment'  && <PaymentScreen screen={screen}     tk={tk} />}
        {screen.kind === 'complete' && <CompleteScreen screen={screen}    tk={tk} />}
      </div>
    </>
  );
}
