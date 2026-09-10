import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder';
import { format } from 'date-fns';
import { SystemSettings } from './types';
import { formatSINumber } from './si-number';

const DEFAULT_COLS = 32;

export interface CreditSlipData {
    creditSlipId: string;
    /** SI number of the ORIGINAL sale being returned — what the customer's receipt shows. */
    originalSiNumber?: string | number | null;
    originalSoNumber: string;
    customerName: string;
    date: string;
    expiryDate: string;
    cashierName: string;
    items: {
        name: string;
        quantity: number;
        unitOfMeasure?: string;
        price: number;
        total: number;
    }[];
    totalAmount: number;
    businessSettings?: SystemSettings | null;
}

export class CreditSlipGenerator {
    private encoder: any;

    constructor() { }

    private getLayout(settings?: SystemSettings | null) {
        const paperSize = settings?.paperSize || '58mm';
        if (paperSize === '80mm') {
            const COLS = 48;
            const QTY_W = 8;
            const AMT_W = 12;
            const NAME_W = COLS - QTY_W - AMT_W;
            return { COLS, QTY_W, AMT_W, NAME_W };
        }
        // Default 58mm
        const COLS = 32;
        const QTY_W = 7;
        const AMT_W = 9;
        const NAME_W = COLS - QTY_W - AMT_W;
        return { COLS, QTY_W, AMT_W, NAME_W };
    }

    public generate(data: CreditSlipData): Uint8Array {
        const settings = data.businessSettings;
        const { COLS, QTY_W, AMT_W, NAME_W } = this.getLayout(settings);
        
        this.encoder = new ReceiptPrinterEncoder({
            language: 'esc-pos',
            codepageMapping: 'epson',
            width: COLS,
        });

        const {
            creditSlipId,
            originalSiNumber,
            originalSoNumber,
            customerName,
            date,
            cashierName,
            items,
            totalAmount
        } = data;
        
        const dateStr = format(new Date(date), 'PP p');

        const enc = this.encoder.initialize().codepage('cp437');

        const bizName = settings?.businessName?.trim() || 'ALON POS SYSTEM';
        const address = settings?.address?.trim() || 'General Merchandise';
        const minNumber = settings?.minNumber || '1234567890';
        const serialNumber = settings?.serialNumber || '0987654321-11';
        
        // ─── HEADER (centered) ───────────────────────────────────────────
        enc.raw([0x1b, 0x61, 0x31]); // Native Center
        enc.line(bizName);
        enc.line(address);
        if (settings?.contactNumber) enc.line(settings.contactNumber);
        if (settings?.tin)           enc.line(`VAT REG TIN: ${settings.tin}`);
        enc.line(`MIN: ${minNumber}`);
        enc.line(`S/N: ${serialNumber}`);
        enc.line(dateStr);
        enc.raw([0x1b, 0x61, 0x30]); // Native Left
        enc.newline();

        // ─── SLIP HEADER ───────────────────────────────────────────
        enc.raw([0x1b, 0x61, 0x31]).line('RETURN SALES SLIP').raw([0x1b, 0x61, 0x30]);
        // SI NO. must match the original receipt's SI number, not the internal credit-slip ID.
        enc.line(`SI NO.: ${formatSINumber(originalSiNumber || originalSoNumber)}`);
        // Labelled "MC NO." to match the Return Sales report column, so
        // staff can match a paper slip to the report row by the same name.
        enc.line(`MC NO.: ${creditSlipId}`);
        enc.line(`Cust: ${customerName}`);
        enc.line(`Cashier: ${cashierName}`);
        if (data.expiryDate) {
            enc.line(`Expires: ${format(new Date(data.expiryDate), 'MM/dd/yy')}`);
        }
        enc.line('-'.repeat(COLS)); // dashed border

        // ─── ITEM TABLE HEADER ────────────────────────────────────────────
        const pad = ' '; 
        const hdrQty  = 'Qty'.padEnd(QTY_W, pad);
        const hdrName = 'Item'.padEnd(NAME_W, pad);
        const hdrAmt  = 'Amt'.padStart(AMT_W, pad);
        enc.bold(true).line(`${hdrQty}${hdrName}${hdrAmt}`).bold(false);
        enc.rule({ style: 'single' });

        const marginLeftDots = QTY_W * 12; 
        const nl = marginLeftDots % 256;
        const nh = Math.floor(marginLeftDots / 256);
        const absoluteIndent = () => {
             enc.raw([0x1b, 0x24, nl, nh]);
        };

        // ─── ITEMS ────────────────────────────────────────────────────────
        items.forEach(item => {
            const uomAbbr = this.abbreviateUOM(item.unitOfMeasure);
            const qtyStr  = `${item.quantity}${uomAbbr ? ' ' + uomAbbr : ''}`;
            const qty     = qtyStr.length > QTY_W ? qtyStr.substring(0, QTY_W) : qtyStr.padEnd(QTY_W, pad);
            const amtStr  = this.fmt(item.total);
            const amt     = amtStr.length > AMT_W ? amtStr.substring(0, AMT_W) : amtStr.padStart(AMT_W, pad);

            const chunks  = this.wrap(item.name.trim(), NAME_W);
            const padName = (s: string) => s.length >= NAME_W ? s.substring(0, NAME_W) : s.padEnd(NAME_W, pad);

            enc.line(`${qty}${padName(chunks[0] || '')}${amt}`);
            for (let i = 1; i < chunks.length; i++) {
                absoluteIndent();
                enc.line(chunks[i]);
            }
            absoluteIndent();
            enc.line(`@ ${this.fmt(item.price)}`);
        });

        // ─── TOTALS ───────────────────────────────────
        enc.line('-'.repeat(COLS));
        enc.bold(true).line(this.row('TOTAL CREDIT:', `₱${this.fmt(totalAmount)}`)).bold(false);
        enc.line('-'.repeat(COLS));

        // ─── SIGNATURES ────────────────────────────────────────────
        enc.newline();
        enc.newline();
        enc.align('center');
        enc.line('__________________________');
        enc.line('Customer Signature');
        enc.newline();
        enc.line('__________________________');
        enc.line('Authorized Signature');
        enc.newline();

        // ─── FOOTER ────────────────────────────────────────────
        enc.align('center');
        enc.line('Return Sales');
        enc.line('Transaction Record');
        enc.line('Printed: ' + format(new Date(), 'MM/dd/yy h:mm a'));
        enc.line('Pos System by Bhagoh');

        enc.newline().newline().newline();
        enc.cut();

        return enc.encode();
    }

    private abbreviateUOM(uom?: string): string {
        if (!uom) return '';
        const map: Record<string, string> = {
            'Pieces': 'pcs',
            'Piece': 'pc',
            'Kilograms': 'kg',
            'Kilogram': 'kg',
            'Kilos': 'kg',
            'Kilo': 'kg',
            'Grams': 'g',
            'Gram': 'g',
            'Meters': 'm',
            'Meter': 'm',
            'Liters': 'L',
            'Liter': 'L',
            'Boxes': 'bx',
            'Box': 'bx',
            'Case': 'cs',
            'Cases': 'cs',
            'Pack': 'pk',
            'Packs': 'pk',
            'Bottle': 'btl',
            'Bottles': 'btl',
            'Can': 'cn',
            'Cans': 'cn',
            'Milliliters': 'ml',
            'Milliliter': 'ml'
        };
        const trimmed = uom.trim();
        const upper = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
        return map[upper] || trimmed.toLowerCase();
    }

    private fmt(amount: number): string {
        return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    private row(left: string, right: string, width: number = DEFAULT_COLS): string {
        const spaces = width - left.length - right.length;
        if (spaces <= 0) return `${left} ${right}`.substring(0, width);
        return `${left}${' '.repeat(spaces)}${right}`;
    }

    private wrap(text: string, maxWidth: number): string[] {
        const words  = text.split(' ');
        const lines: string[] = [];
        let   current = '';
        for (const word of words) {
            if (word.length > maxWidth) {
                if (current) { lines.push(current); current = ''; }
                let rest = word;
                while (rest.length > maxWidth) {
                    lines.push(rest.substring(0, maxWidth));
                    rest = rest.substring(maxWidth);
                }
                current = rest;
                continue;
            }
            const candidate = current ? `${current} ${word}` : word;
            if (candidate.length > maxWidth) {
                lines.push(current);
                current = word;
            } else {
                current = candidate;
            }
        }
        if (current) lines.push(current);
        return lines.length ? lines : [''];
    }
}
