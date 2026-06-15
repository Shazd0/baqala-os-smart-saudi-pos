import {
  Ingredient,
  KitchenTicket,
  MenuItem,
  Recipe,
  RestaurantOrder,
  RestaurantOrderItem,
  SfdaNutritionProfile,
  StaffMember,
} from '../types';
import { roundMoney } from './pricing';

export const CAFFEINE_WARNING_EN = 'The maximum daily caffeine intake for adults is 400 mg. For pregnant and lactating women, intake should not exceed 200 mg.';
export const CAFFEINE_WARNING_AR = 'الحد الأقصى اليومي للكافيين للبالغين هو 400 ملجم. للحوامل والمرضعات يجب ألا يتجاوز الاستهلاك 200 ملجم.';

export function calculateBurnMinutes(caloriesKcal: number) {
  return {
    walking: Math.ceil(Number(caloriesKcal || 0) / 5),
    running: Math.ceil(Number(caloriesKcal || 0) / 11.4),
  };
}

export function getSfdaFlags(nutrition: SfdaNutritionProfile) {
  const burn = calculateBurnMinutes(nutrition.caloriesKcal);
  return {
    highSodium: Number(nutrition.sodiumMilligrams || 0) > 2000,
    hasCaffeine: Number(nutrition.caffeineMilligrams || 0) > 0,
    burn,
  };
}

export function modifierTotal(item: RestaurantOrderItem) {
  return (item.modifiers || []).reduce((sum, modifier) => sum + Number(modifier.priceDelta || 0), 0);
}

export function orderItemUnitTotal(item: RestaurantOrderItem) {
  return roundMoney(Number(item.unitPrice || 0) + modifierTotal(item));
}

export function calculateRestaurantOrderTotals(items: RestaurantOrderItem[], discount = 0, vatRate = 0.15) {
  const gross = items.reduce((sum, item) => sum + orderItemUnitTotal(item) * Number(item.quantity || 0), 0);
  const boundedDiscount = Math.min(Math.max(Number(discount || 0), 0), gross);
  const total = gross - boundedDiscount;
  const subtotal = total / (1 + vatRate);
  const vat = total - subtotal;

  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(boundedDiscount),
    vat: roundMoney(vat),
    total: roundMoney(total),
  };
}

export function buildKitchenTickets(order: RestaurantOrder): KitchenTicket[] {
  const firedItems = order.items.filter(item => item.status === 'fired');
  const stationMap = new Map<string, RestaurantOrderItem[]>();
  firedItems.forEach(item => {
    const stationItems = stationMap.get(item.station) || [];
    stationItems.push(item);
    stationMap.set(item.station, stationItems);
  });

  return [...stationMap.entries()].map(([station, items]) => ({
    id: `KOT-${order.id}-${station}`,
    orderId: order.id,
    orderNumber: order.orderNumber,
    station: station as KitchenTicket['station'],
    tableLabel: order.tableLabel,
    status: 'new',
    items: items.map(item => ({
      orderItemId: item.id,
      nameEn: item.nameEn,
      nameAr: item.nameAr,
      quantity: item.quantity,
      modifiers: item.modifiers,
      note: item.note,
    })),
    firedAt: Date.now(),
    dueAt: Date.now() + 12 * 60 * 1000,
    source: order.orderType,
  }));
}

export function calculateRecipeCost(recipe: Recipe | undefined, ingredients: Ingredient[]) {
  if (!recipe) return 0;
  return roundMoney(recipe.components.reduce((sum, component) => {
    const ingredient = ingredients.find(item => item.id === component.ingredientId);
    return sum + (ingredient ? Number(ingredient.movingAverageCost || 0) * Number(component.quantity || 0) : 0);
  }, 0));
}

export function calculateFoodCostPercentage(menuItem: MenuItem, recipe: Recipe | undefined, ingredients: Ingredient[]) {
  const cost = calculateRecipeCost(recipe, ingredients);
  if (!menuItem.basePrice) return 0;
  return roundMoney((cost / menuItem.basePrice) * 100);
}

export function healthCardStatus(staff: StaffMember) {
  const expiry = staff.healthCertificate?.expiresAt;
  if (!expiry) return 'missing' as const;
  const expiresAt = new Date(expiry).getTime();
  const days = Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return 'expired' as const;
  if (days <= 30) return 'expiring_soon' as const;
  return 'valid' as const;
}
