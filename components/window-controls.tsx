'use client';

import React, { useEffect, useState } from 'react';
import { Minus, Square, X } from 'lucide-react';

export function WindowControls() {
  const [isElectron, setIsElectron] = useState(false);

  useEffect(() => {
    // Check if running in Electron and if it's frameless
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      if ((window as any).electronAPI.isFrameless()) {
        setIsElectron(true);
      }
    }
  }, []);

  if (!isElectron) return null;

  const handleMinimize = () => {
    (window as any).electronAPI.minimize();
  };

  const handleMaximize = () => {
    (window as any).electronAPI.maximize();
  };

  const handleClose = () => {
    (window as any).electronAPI.close();
  };

  // These sit inside the header card now, not flush against the window corner,
  // so they are rounded buttons rather than edge-to-edge square hit zones.
  const base =
    'flex h-[34px] w-[34px] items-center justify-center rounded-[10px] '
    + 'text-[#3F6E71] transition-colors focus:outline-none '
    + 'hover:bg-[rgba(45,165,176,0.14)] hover:text-[#0E7C86] '
    + 'dark:text-[rgba(192,232,230,0.6)] dark:hover:bg-[rgba(45,165,176,0.20)] dark:hover:text-[#4FC3C9]';

  return (
    <div className="flex items-center gap-1 window-no-drag">
      <button onClick={handleMinimize} className={base} title="Minimize">
        <Minus className="w-4 h-4" />
      </button>
      <button onClick={handleMaximize} className={base} title="Maximize">
        <Square className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={handleClose}
        className={`${base} hover:bg-destructive hover:text-destructive-foreground dark:hover:bg-destructive dark:hover:text-destructive-foreground`}
        title="Close"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
