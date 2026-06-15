import React, { useEffect, useRef } from 'react';
import { Transaction, StoreConfig, Language, Customer } from '../types';
import { TRANSLATIONS } from '../constants';
import { QRCodeSVG } from 'qrcode.react';
import { Share2, Printer, X, FileCode, CheckCircle } from 'lucide-react';
import { documentShell, openPrintDocument, PrintDocumentOptions } from '../services/printTemplates';
import { APP_LOGO_DATA_URL } from '../services/appLogo';
import { useToast } from './Toast';

interface ReceiptModalProps {
  transaction: Transaction | null;
  customer?: Customer;
  onClose: () => void;
  config: StoreConfig;
  lang: Language;
}

// TLV encoder for simplified Saudi tax invoice QR data.
const convertToTlvBase64 = (sellerName: string, vatNo: string, timestamp: string, total: string, vat: string) => {
  const getTlvPart = (tag: number, val: string) => {
    const hexTag = tag.toString(16).padStart(2, '0');
    const utf8Bytes = Array.from(new TextEncoder().encode(val));
    const hexLength = utf8Bytes.length.toString(16).padStart(2, '0');
    const hexValue = utf8Bytes.map(b => b.toString(16).padStart(2, '0')).join('');
    return hexTag + hexLength + hexValue;
  };
  
  try {
    const tlvHex = getTlvPart(1, sellerName) + 
                   getTlvPart(2, vatNo) + 
                   getTlvPart(3, timestamp) + 
                   getTlvPart(4, total) + 
                   getTlvPart(5, vat);
                   
    const byteArray = new Uint8Array(tlvHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    let binary = '';
    for (let i = 0; i < byteArray.byteLength; i++) {
      binary += String.fromCharCode(byteArray[i]);
    }
    return window.btoa(binary);
  } catch (error) {
    return window.btoa(sellerName + "|" + vatNo + "|" + timestamp + "|" + total + "|" + vat);
  }
};

const arReceipt = {
  receipt: 'الإيصال',
  vatNo: 'الرقم الضريبي',
  phone: 'الجوال',
  invoiceNo: 'رقم الفاتورة',
  customer: 'العميل',
  points: 'النقاط',
  items: 'الصنف',
  qty: 'الكمية',
  price: 'سعر البيع',
  subtotal: 'الإجمالي قبل الضريبة',
  discount: 'الخصم',
  selectiveTax: 'الضريبة الانتقائية',
  vat: 'ضريبة القيمة المضافة',
  total: 'الإجمالي شامل الضريبة',
  paymentMethod: 'طريقة الدفع',
  approvalReference: 'رقم موافقة البطاقة',
  cash: 'نقدي',
  card: 'مدى / بطاقة',
  credit: 'آجل',
  note: 'ملاحظة',
  thankYou: 'شكراً لتسوقكم معنا',
  print: 'طباعة',
  close: 'إغلاق',
};

const formatSar = (amount: number) => `${amount.toFixed(2)} ر.س`;

const ReceiptModal: React.FC<ReceiptModalProps> = ({ transaction, customer, onClose, config, lang }) => {
  const printedRef = useRef<string | null>(null);
  const { toast } = useToast();
  const receiptPrintOptions = (): PrintDocumentOptions => {
    const receipt = document.getElementById('printable-receipt');
    return {
      title: 'فاتورة ضريبية مبسطة',
      body: receipt?.innerHTML || '',
      dir: 'rtl',
      width: 420,
      height: 720,
      compact: true,
      autoPrint: true,
      extraCss: `
        .doc-page { max-width: 310px; }
        .doc-content { padding: 10px 12px; }
        #printable-receipt.receipt-print-root {
          width: 100%;
          max-width: 286px;
          margin: 0 auto;
          padding: 0 !important;
          text-align: center;
          color: #111827;
          font-size: 10.5px;
          line-height: 1.35;
        }
        .receipt-print-logo-box {
          width: 54px !important;
          height: 54px !important;
          margin: 0 auto 8px !important;
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #fff;
        }
        .receipt-print-logo {
          width: 100% !important;
          height: 100% !important;
          max-width: 54px !important;
          max-height: 54px !important;
          object-fit: contain !important;
          padding: 4px !important;
          display: block;
        }
        .receipt-store-name { font-size: 16px; font-weight: 900; margin: 4px 0 2px; }
        .receipt-store-en, .receipt-meta { color: #64748b; font-size: 9px; margin: 1px 0; }
        .receipt-title-ar { font-size: 14px; font-weight: 900; margin: 8px 0 1px; }
        .receipt-title-en { font-size: 9px; font-weight: 800; color: #475569; letter-spacing: .04em; margin: 0; }
        .receipt-dash { border-bottom: 1px dashed #cbd5e1; margin: 9px 0; }
        .receipt-total-box { border: 1px solid #bbf7d0; border-radius: 10px; background: #f8fafc; padding: 8px; margin: 10px 0; }
        .receipt-row { display:flex; justify-content:space-between; gap:8px; align-items:flex-start; }
        .receipt-row + .receipt-row { margin-top: 5px; }
        .receipt-grand { font-size: 13px; font-weight: 900; background:#fff; border:1px solid #d1fae5; border-radius:8px; padding:6px; margin-top:6px; }
        .qr-wrap { margin-top: 12px; display:flex; flex-direction:column; align-items:center; }
        .doc-content table th { background: white; color: #475569; border-bottom: 1px solid #e2e8f0; }
        .doc-content table td { padding: 6px 4px; }
        #printable-receipt svg { max-width: 105px !important; height: auto !important; }
        .doc-hero { display:none; }
      `,
    };
  };

  const handlePrint = async () => {
    const options = receiptPrintOptions();
    return openPrintDocument(options);
  };

  useEffect(() => {
    if (!transaction || printedRef.current === transaction.id) return;
    printedRef.current = transaction.id;
    const timer = window.setTimeout(() => { void handlePrint(); }, 250);
    return () => window.clearTimeout(timer);
  }, [transaction?.id]);

  if (!transaction) return null;

  const t = TRANSLATIONS[lang];
  const sellerName = config.nameAr || config.nameEn || 'البقالة';
  const sellerNameEn = config.nameEn && config.nameEn !== sellerName ? config.nameEn : '';
  const dateStr = new Date(transaction.timestamp).toLocaleDateString('ar-SA');
  const timeStr = new Date(transaction.timestamp).toLocaleTimeString('ar-SA');
  const paymentMethodLabel = transaction.paymentMethod === 'card'
    ? arReceipt.card
    : transaction.paymentMethod === 'credit'
      ? arReceipt.credit
      : arReceipt.cash;

  const handleWhatsApp = () => {
    const text = `
*${sellerName}*
${arReceipt.receipt}: #${transaction.id.slice(-6).toUpperCase()}
${arReceipt.total}: ${formatSar(transaction.total)}
التاريخ: ${dateStr} - ${timeStr}
    `.trim();
    
    const phone = customer?.phone ? `966${customer.phone.substring(1)}` : '';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
  };

  const downloadXml = () => {
    if (!transaction.xmlUbl) return;
    const blob = new Blob([transaction.xmlUbl], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ZATCA-Fatoorah-${transaction.id}.xml`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Generate compliant TLV Base64 QR code representation
  const qrDataB64 = convertToTlvBase64(
    sellerName,
    config.vatNumber,
    new Date(transaction.timestamp).toISOString(),
    transaction.total.toFixed(2),
    transaction.vat.toFixed(2)
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-sm flex flex-col max-h-[90vh]">
        
        {/* Scrollable Receipt Area */}
        <div className="overflow-y-auto p-6 flex-1 bg-white relative receipt-font receipt-print-root" id="printable-receipt" dir="rtl" lang="ar">
          {transaction.status === 'refunded' && (
             <div className="absolute top-4 right-4 -rotate-12 border-2 border-red-500 text-red-500 px-2 py-1 font-bold rounded opacity-50">مرتجع</div>
          )}
          
          <div className="text-center mb-5">
            <div className="receipt-print-logo-box mx-auto mb-2 h-16 w-16 rounded-2xl border border-gray-100 bg-white shadow-sm flex items-center justify-center overflow-hidden">
              <img src={config.logoDataUrl || APP_LOGO_DATA_URL} alt="Store logo" className="receipt-print-logo h-full w-full object-contain p-1.5" />
            </div>
            <h2 className="receipt-store-name font-bold text-xl">{sellerName}</h2>
            {sellerNameEn && <p className="receipt-store-en text-[10px] text-gray-500 uppercase tracking-wide" dir="ltr">{sellerNameEn}</p>}
            <p className="receipt-meta text-xs text-gray-500">{arReceipt.vatNo}: {config.vatNumber}</p>
             {config.phone && <p className="receipt-meta text-xs text-gray-500">{arReceipt.phone}: {config.phone}</p>}
             {config.address && <p className="receipt-meta text-xs text-gray-500">{config.address}</p>}
            <div className="receipt-dash border-b-2 border-dashed border-gray-300 my-3"></div>
            
            {/* Bilingual Header for Simplified Tax Invoice in compliance with MoC */}
            <div className="mb-1">
              <h3 className="receipt-title-ar font-bold text-lg text-primary-900">فاتورة ضريبية مبسطة</h3>
              <h3 className="receipt-title-en font-bold text-[10px] text-gray-500 tracking-wide" dir="ltr">SIMPLIFIED TAX INVOICE</h3>
            </div>
            {transaction.isRefund && (
              <p className="text-xs font-bold text-red-600 bg-red-50 py-0.5 px-2 rounded-full inline-block mt-1">
                إشعار دائن (مرتجع)
              </p>
            )}
            
            <p className="text-xs text-gray-500 mt-2">{dateStr} - {timeStr}</p>
            <p className="text-xs text-gray-500 font-mono">{arReceipt.invoiceNo}: {transaction.id.slice(-6).toUpperCase()}</p>
          </div>

          {customer && (
            <div className="mb-4 text-xs border border-gray-100 bg-gray-50 p-2 rounded flex justify-between">
              <div>
                <span className="text-gray-500">{arReceipt.customer}:</span> <span className="font-bold text-gray-900">{customer.name}</span>
              </div>
              {customer.points !== undefined && (
                <div className="text-green-700 font-medium text-xs">
                  {arReceipt.points}: {customer.points}
                </div>
              )}
            </div>
          )}

          <table className="w-full text-xs mb-4">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="text-start py-2 font-medium">{arReceipt.items}</th>
                <th className="text-center py-2 font-medium">{arReceipt.qty}</th>
                <th className="text-end py-2 font-medium">{arReceipt.price}</th>
              </tr>
            </thead>
            <tbody>
              {transaction.items.map((item, idx) => (
                <tr key={idx} className="border-b border-dashed border-gray-100">
                  <td className="py-2">
                    <div className="font-medium text-gray-900">{item.nameAr || item.nameEn}</div>
                    {item.nameEn && item.nameEn !== item.nameAr && (
                      <div className="text-[10px] text-gray-400" dir="ltr">{item.nameEn}</div>
                    )}
                    {item.selectiveTax && item.selectiveTax !== 'none' && (
                      <span className="text-[10px] bg-amber-50 text-amber-800 border border-amber-200/50 px-1 py-0.2 rounded inline-block mt-0.5">
                        {item.selectiveTax === 'tobacco' ? 'انتقائية 100%' : 'انتقائية 50%'}
                      </span>
                    )}
                  </td>
                  <td className="text-center py-2 text-gray-800">{item.quantity}</td>
                  <td className="text-end py-2 text-gray-800">{formatSar(item.price * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-total-box space-y-1.5 text-xs bg-gradient-to-br from-slate-50 to-emerald-50/40 p-3 rounded-xl border border-emerald-100 mb-4">
            <div className="receipt-row flex justify-between">
              <span className="text-gray-600">{arReceipt.subtotal}</span>
              <span className="text-gray-900">{formatSar(transaction.subtotal)}</span>
            </div>
            
            {transaction.discount > 0 && (
               <div className="receipt-row flex justify-between text-red-500">
                <span>{arReceipt.discount}</span>
                <span>-{formatSar(transaction.discount)}</span>
              </div>
            )}

            {transaction.selectiveTaxAmount !== undefined && transaction.selectiveTaxAmount > 0 && (
              <div className="receipt-row flex justify-between text-amber-700">
                <span>{arReceipt.selectiveTax}</span>
                <span>{formatSar(transaction.selectiveTaxAmount)}</span>
              </div>
            )}

            <div className="receipt-row flex justify-between text-gray-600 border-b border-dashed border-gray-200 pb-1.5 font-sans">
              <span>{arReceipt.vat} (15%)</span>
              <span>{formatSar(transaction.vat)}</span>
            </div>
            
            <div className="receipt-row receipt-grand flex justify-between font-black text-base text-gray-900 pt-1 bg-white rounded-lg px-2 py-1.5 border border-emerald-100">
              <span>{arReceipt.total}</span>
              <span>{formatSar(transaction.total)}</span>
            </div>

            <div className="receipt-row flex justify-between text-[10px] text-gray-500 mt-2 border-t border-gray-100 pt-1.5 leading-tight">
              <span>{arReceipt.paymentMethod}</span>
              <span className="font-semibold text-gray-900">{paymentMethodLabel}</span>
            </div>
            {transaction.paymentApprovalReference && (
              <div className="receipt-row flex justify-between text-[10px] text-gray-500 leading-tight">
                <span>{arReceipt.approvalReference}</span>
                <span className="font-mono font-semibold text-gray-900" dir="ltr">{transaction.paymentApprovalReference}</span>
              </div>
            )}
          </div>

          {transaction.note && (
             <div className="mt-3 p-2 bg-yellow-50 border border-yellow-101 rounded-lg text-xs text-center border-yellow-200">
                <span className="font-bold text-yellow-800">{arReceipt.note}:</span> <span className="text-gray-700">{transaction.note}</span>
             </div>
          )}
          
          {/* Local cryptographic invoice details */}
          {transaction.uuid && (
            <div className="mt-3 py-2 px-2.5 bg-green-50/50 border border-green-100 rounded-lg text-[9px] font-mono text-gray-500 leading-normal mb-4">
              <div className="flex items-center gap-1 text-green-700 font-bold mb-1 text-[10px]">
                <CheckCircle size={10} className="text-green-600" />
                <span>فاتورة موقعة محلياً بانتظار الربط</span>
              </div>
              <p className="truncate"><span className="text-gray-400">UUID:</span> {transaction.uuid}</p>
              <p className="truncate"><span className="text-gray-400">Hash:</span> {transaction.invoiceHash}</p>
              <p className="truncate"><span className="text-gray-400">Signature:</span> {transaction.cryptographicSignature}</p>
              <p><span className="text-gray-400">Seq No:</span> {transaction.invoiceSeqNum} | <span className="text-gray-400">Status:</span> <span className={transaction.zatcaStatus === 'reported' ? 'text-green-600 font-bold' : 'text-amber-600 font-bold font-sans'}>{transaction.zatcaStatus?.toUpperCase()}</span></p>
            </div>
          )}

          <div className="qr-wrap mt-5 flex flex-col items-center justify-center">
            <QRCodeSVG value={qrDataB64} size={110} level="M" />
            <p className="text-[10px] text-gray-400 mt-3 text-center max-w-[200px] leading-relaxed">{config.footerMessage || arReceipt.thankYou}</p>
          </div>
        </div>

        {/* Action Buttons (Hidden on Print) */}
        <div className="p-3 border-t bg-gray-50 rounded-b-lg flex gap-1.5 print:hidden">
          <button 
            onClick={onClose}
            className="flex items-center justify-center w-12 py-2.5 border border-gray-300 bg-white rounded-lg hover:bg-gray-100 text-gray-700 transition-colors"
            title={lang === 'ar' ? 'إغلاق' : 'Close'}
          >
            <X size={18} />
          </button>
          
          {transaction.xmlUbl && (
            <button 
              onClick={downloadXml}
              className="flex items-center justify-center gap-1.5 flex-1 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 text-xs font-semibold shadow-sm transition-colors"
              title="Download Signed XML"
            >
              <FileCode size={16} />
              <span>XML</span>
            </button>
          )}

          <button 
            onClick={handleWhatsApp}
            className="flex items-center justify-center gap-1.5 flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-xs font-semibold shadow-sm transition-colors"
          >
            <Share2 size={16} />
            <span>WhatsApp</span>
          </button>
          
          <button 
            onClick={handlePrint}
            className="flex items-center justify-center gap-1.5 flex-1 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 text-xs font-semibold shadow-sm transition-colors"
          >
            <Printer size={16} />
            <span>{t.print}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptModal;
