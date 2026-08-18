import { format } from 'date-fns';

interface ReportHeaderProps {
  title: string;
  subtitle?: string;
  period?: string;
  businessName?: string;
  address?: string;
  contactNumber?: string;
  tin?: string;
}

export function ReportHeader({ 
  title, 
  subtitle, 
  period,
  businessName = 'Alon POS System',
  address,
  contactNumber,
  tin
}: ReportHeaderProps) {
  return (
    <div className="hidden print:block mb-10">
      <div className="flex justify-between items-start border-b-2 border-primary/20 pb-6 mb-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-extrabold uppercase tracking-tighter text-primary">{businessName}</h1>
          {address && <p className="text-sm font-medium">{address}</p>}
          <div className="flex gap-4 text-xs text-muted-foreground font-medium">
            {contactNumber && <span>Tel: {contactNumber}</span>}
            {tin && <span>TIN: {tin}</span>}
          </div>
        </div>
        <div className="text-right space-y-1">
          <div className="bg-primary/5 px-3 py-1 rounded-full inline-block">
            <p className="text-[10px] uppercase font-bold tracking-widest text-primary/70">Inventory Report</p>
          </div>
          <p className="text-sm font-bold mt-2">{format(new Date(), 'MMMM dd, yyyy')}</p>
          <p className="text-[10px] text-muted-foreground uppercase">{format(new Date(), 'hh:mm aa')}</p>
        </div>
      </div>
      
      <div className="relative">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{title}</h2>
        {subtitle && <p className="text-slate-500 text-sm mt-1 max-w-2xl leading-relaxed">{subtitle}</p>}
        {period && (
          <div className="absolute top-0 right-0">
             <span className="text-[10px] font-bold uppercase tracking-widest bg-slate-100 px-2 py-1 rounded">Period: {period}</span>
          </div>
        )}
      </div>
    </div>
  );
}

