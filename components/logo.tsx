import Link from 'next/link';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Orbit, Compass, Box, Zap, LucideIcon } from 'lucide-react';

interface LogoProps {
  className?: string;
  enableLink?: boolean;
  variant?: 'default' | 'icon';
  size?: number;
  icon?: LucideIcon;
}

export function Logo({ className, enableLink = true, variant = 'default', size, icon: CustomIcon }: LogoProps) {
  const isIcon = variant === 'icon';
  const defaultSize = isIcon ? 40 : 120;
  const currentSize = size || defaultSize;
  const Icon = CustomIcon || Orbit;

  const content = (
    <div className={cn(
      "flex items-center justify-center overflow-hidden", 
      isIcon ? "rounded-xl p-1" : "",
      className
    )}>
      <Image
        src="/alon-mark.png"
        alt="ALON POS SYSTEM"
        width={currentSize} 
        height={isIcon ? currentSize : 80} 
        className={cn("object-contain", isIcon ? "p-0.5" : "p-1")}
        priority
      />
    </div>
  );

  if (!enableLink) {
    return content;
  }
  
  return (
    <Link href="/" className="flex items-center">
      {content}
    </Link>
  );
}
