import React, { useEffect, useState } from 'react';
import { CustomerDisplayService } from '../services/printerService';

interface CartDisplayData {
  storeName: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  subtotal?: number;
  vat?: number;
  discount?: number;
}

const CustomerDisplay: React.FC = () => {
  const [cart, setCart] = useState<CartDisplayData | null>(null);

  useEffect(() => {
    const unsub = CustomerDisplayService.onCartUpdate(setCart);
    return unsub;
  }, []);

  return (
    <div className="flex h-screen flex-col bg-[#0D1B2A] text-white">
      {/* Header */}
      <div className="flex items-center justify-center bg-[#1A3A2A] px-6 py-4">
        <span className="text-2xl font-black tracking-wide text-[#4ADE80]">
          {cart?.storeName || 'Baqala OS'}
        </span>
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-6">
        {cart?.items.length ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/50">
                <th className="pb-2">Item</th>
                <th className="pb-2 text-center">Qty</th>
                <th className="pb-2 text-right">Price</th>
              </tr>
            </thead>
            <tbody>
              {cart.items.map((item, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="py-2 font-medium">{item.name}</td>
                  <td className="py-2 text-center text-white/60">{item.qty}</td>
                  <td className="py-2 text-right">{(item.price * item.qty).toFixed(2)} SAR</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="flex h-full items-center justify-center text-white/30 text-lg">
            Welcome / أهلاً وسهلاً
          </div>
        )}
      </div>

      {/* Total */}
      <div className="bg-[#1A3A2A] p-6">
        <div className="flex items-center justify-between">
          <span className="text-lg text-white/60">Total / المجموع</span>
          <span className="text-5xl font-black text-[#4ADE80]">
            {cart ? cart.total.toFixed(2) : '0.00'} <span className="text-2xl">SAR</span>
          </span>
        </div>
        {cart?.vat != null && (
          <p className="mt-1 text-right text-sm text-white/40">
            Including VAT: {cart.vat.toFixed(2)} SAR
          </p>
        )}
      </div>
    </div>
  );
};

export default CustomerDisplay;
