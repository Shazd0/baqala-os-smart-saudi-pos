import React, { useMemo, useState } from 'react';
import { AlertTriangle, Save, Trash2 } from 'lucide-react';
import { Ingredient, Language, Recipe, WastageEntry } from '../types';
import { StorageService } from '../services/storageService';
import { calculateFoodCostPercentage, calculateRecipeCost } from '../services/restaurantService';

interface RecipeInventoryProps {
  lang: Language;
}

function copy(lang: Language, en: string, ar: string) {
  return lang === 'ar' ? ar : en;
}

const Field = ({ label, help, children, className = '' }: { label: string; help: string; children: React.ReactNode; className?: string }) => (
  <div className={`ios-field ${className}`}>
    <label className="ios-label">{label}</label>
    {children}
    <p className="ios-help">{help}</p>
  </div>
);

const RecipeInventory: React.FC<RecipeInventoryProps> = ({ lang }) => {
  const [ingredients, setIngredients] = useState<Ingredient[]>(() => StorageService.getIngredients());
  const [recipes, setRecipes] = useState<Recipe[]>(() => StorageService.getRecipes());
  const [menuItems] = useState(() => StorageService.getMenuItems());
  const [wastage, setWastage] = useState<WastageEntry[]>(() => StorageService.getWastageEntries());
  const [recipeMenuItemId, setRecipeMenuItemId] = useState(menuItems[0]?.id || '');
  const [componentIngredientId, setComponentIngredientId] = useState('');
  const [componentQuantity, setComponentQuantity] = useState(0);

  const selectedRecipe = useMemo(
    () => recipes.find(recipe => recipe.menuItemId === recipeMenuItemId),
    [recipes, recipeMenuItemId]
  );
  const selectedMenuItem = menuItems.find(item => item.id === recipeMenuItemId);

  const addComponent = () => {
    const ingredient = ingredients.find(item => item.id === componentIngredientId);
    const menuItem = menuItems.find(item => item.id === recipeMenuItemId);
    if (!ingredient || !menuItem || componentQuantity <= 0) return;
    const recipe: Recipe = selectedRecipe || {
      id: '',
      menuItemId: menuItem.id,
      menuItemName: menuItem.nameEn,
      components: [],
      targetFoodCostPercentage: 35,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const component = {
      ingredientId: ingredient.id,
      ingredientName: ingredient.nameEn,
      quantity: componentQuantity,
      unitOfMeasure: ingredient.unitOfMeasure,
      deduct: true,
    };
    const nextRecipe = {
      ...recipe,
      components: [...recipe.components.filter(item => item.ingredientId !== ingredient.id), component],
      updatedAt: Date.now(),
    };
    const savedRecipes = StorageService.saveRecipe(nextRecipe);
    setRecipes(savedRecipes);
    setComponentIngredientId('');
    setComponentQuantity(0);
  };

  const removeComponent = (ingredientId: string) => {
    if (!selectedRecipe) return;
    const savedRecipes = StorageService.saveRecipe({ ...selectedRecipe, components: selectedRecipe.components.filter(item => item.ingredientId !== ingredientId), updatedAt: Date.now() });
    setRecipes(savedRecipes);
  };

  const recordWaste = (ingredient: Ingredient) => {
    const quantity = Number(window.prompt(copy(lang, 'Waste quantity', 'كمية الهدر'), '1') || 0);
    if (!quantity || quantity <= 0) return;
    const result = StorageService.addWastageEntry({
      id: '',
      ingredientId: ingredient.id,
      ingredientName: ingredient.nameEn,
      quantity,
      unitOfMeasure: ingredient.unitOfMeasure,
      reason: 'other',
      createdAt: Date.now(),
      createdBy: 'Kitchen',
    });
    setIngredients(result.ingredients);
    setWastage(result.entries);
  };

  const recipeCost = selectedMenuItem ? calculateRecipeCost(selectedRecipe, ingredients) : 0;
  const foodCostPercentage = selectedMenuItem ? calculateFoodCostPercentage(selectedMenuItem, selectedRecipe, ingredients) : 0;

  return (
    <div className="ios-responsive-split-wide">
      <section className="h-full overflow-y-auto p-6">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">{copy(lang, 'Stock control', 'إدارة المخزون')}</p>
          <h1 className="text-3xl font-black text-slate-900">{copy(lang, 'Stock Items and Recipe Costing', 'أصناف المخزون وتكلفة الوصفات')}</h1>
          <p className="ios-help mt-2 max-w-3xl">
            {copy(lang, 'Monitor ingredient stock, identify low levels, record wastage, and connect ingredients to menu recipes for plate-cost visibility.', 'راقب مخزون المكونات، وحدد المستويات المنخفضة، وسجل الهدر، واربط المكونات بوصفات القائمة لمعرفة تكلفة الطبق.')}
          </p>
        </div>

        {ingredients.length === 0 && (
          <div className="ios-card p-8 text-center">
            <AlertTriangle className="mx-auto mb-3 text-[var(--ios-accent)]" size={34} />
            <h2 className="ios-title text-2xl">{copy(lang, 'No stock items yet', 'لا توجد أصناف مخزون بعد')}</h2>
            <p className="ios-help mx-auto mt-2 max-w-xl">
              {copy(lang, 'Stock will appear here after ingredients are created or received through purchase workflows. The screen is ready, but there are no ingredient records to display.', 'سيظهر المخزون هنا بعد إنشاء المكونات أو استلامها عبر عمليات الشراء. الشاشة جاهزة، لكن لا توجد سجلات مكونات لعرضها.')}
            </p>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {ingredients.map(ingredient => {
            const low = ingredient.currentStock <= ingredient.lowStockThreshold;
            return (
              <div key={ingredient.id} className={`rounded-[2rem] border bg-white p-5 shadow-sm ${low ? 'border-red-200' : 'border-white'}`}>
                <div className="mb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-black text-slate-900">{copy(lang, ingredient.nameEn, ingredient.nameAr)}</h2>
                    <p className="text-xs font-bold text-slate-500">{ingredient.unitOfMeasure} / {copy(lang, 'moving avg cost', 'متوسط التكلفة')} {ingredient.movingAverageCost}</p>
                  </div>
                  {low && <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700"><AlertTriangle size={12} className="inline" /> Low</span>}
                </div>
                <div className="mb-4 h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className={`h-full ${low ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${Math.min(100, (ingredient.currentStock / Math.max(ingredient.lowStockThreshold * 2, 1)) * 100)}%` }} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-black text-slate-900">{ingredient.currentStock} {ingredient.unitOfMeasure}</span>
                  <button onClick={() => recordWaste(ingredient)} className="rounded-2xl bg-slate-900 px-4 py-2 text-xs font-black text-white">{copy(lang, 'Record Waste', 'تسجيل هدر')}</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <aside className="h-full overflow-y-auto border-l border-slate-200 bg-white p-5 text-[var(--ios-text)] shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">{copy(lang, 'Recipe builder', 'بناء الوصفة')}</p>
        <h2 className="mb-4 text-2xl font-black text-slate-900">{copy(lang, 'Plate Costing', 'تكلفة الطبق')}</h2>
        <p className="ios-help mb-5">
          {copy(lang, 'Choose a menu item, attach stock ingredients, and enter the exact quantity used in one serving to calculate recipe cost.', 'اختر صنف قائمة، واربط مكونات المخزون، وأدخل الكمية الدقيقة المستخدمة في حصة واحدة لحساب تكلفة الوصفة.')}
        </p>

        <Field
          label={copy(lang, 'Menu item to cost', 'صنف القائمة لحساب التكلفة')}
          help={copy(lang, 'This selects which sellable menu item the recipe components belong to.', 'يحدد صنف القائمة القابل للبيع الذي تنتمي إليه مكونات الوصفة.')}
          className="mb-3"
        >
          <select value={recipeMenuItemId} onChange={event => setRecipeMenuItemId(event.target.value)} className="w-full rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold">
            {menuItems.map(item => <option key={item.id} value={item.id}>{copy(lang, item.nameEn, item.nameAr)}</option>)}
          </select>
        </Field>

        <div className={`mb-4 rounded-3xl p-4 ${foodCostPercentage > 35 ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-800'}`}>
          <p className="text-xs font-black uppercase opacity-70">{copy(lang, 'Food cost', 'تكلفة الطعام')}</p>
          <p className="text-3xl font-black">{foodCostPercentage.toFixed(2)}%</p>
          <p className="text-sm font-bold">{recipeCost.toFixed(2)} SAR {copy(lang, 'recipe cost', 'تكلفة الوصفة')}</p>
        </div>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
          <Field label={copy(lang, 'Stock ingredient', 'مكون المخزون')} help={copy(lang, 'Select the ingredient consumed when one serving is sold.', 'اختر المكون الذي يتم استهلاكه عند بيع حصة واحدة.')}>
            <select value={componentIngredientId} onChange={event => setComponentIngredientId(event.target.value)} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold">
              <option value="">{copy(lang, 'Choose an ingredient', 'اختر مكوناً')}</option>
              {ingredients.map(ingredient => <option key={ingredient.id} value={ingredient.id}>{copy(lang, ingredient.nameEn, ingredient.nameAr)}</option>)}
            </select>
          </Field>
          <Field label={copy(lang, 'Qty', 'الكمية')} help={copy(lang, 'Per serving.', 'لكل حصة.')}>
            <input type="number" value={componentQuantity} onChange={event => setComponentQuantity(Number(event.target.value))} placeholder="e.g., 120" className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-semibold" />
          </Field>
          <button onClick={addComponent} className="col-span-2 flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-sm font-black text-white">
            <Save size={16} /> {copy(lang, 'Add Component', 'إضافة مكون')}
          </button>
        </div>

        <div className="space-y-3">
          {(selectedRecipe?.components || []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-center">
              <p className="text-sm font-black text-slate-700">{copy(lang, 'No recipe components yet', 'لا توجد مكونات وصفة بعد')}</p>
              <p className="ios-help mt-1">{copy(lang, 'Add ingredients above to start calculating food cost for this menu item.', 'أضف المكونات أعلاه لبدء حساب تكلفة الطعام لهذا الصنف.')}</p>
            </div>
          )}
          {(selectedRecipe?.components || []).map(component => (
            <div key={component.ingredientId} className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">
              <div>
                <p className="font-black text-slate-900">{component.ingredientName}</p>
                <p className="text-xs font-semibold text-slate-500">{component.quantity} {component.unitOfMeasure}</p>
              </div>
              <button onClick={() => removeComponent(component.ingredientId)} className="rounded-xl bg-white p-2 text-red-500"><Trash2 size={16} /></button>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h3 className="mb-2 text-sm font-black text-slate-700">{copy(lang, 'Recent wastage', 'آخر الهدر')}</h3>
          <p className="ios-help mb-3">{copy(lang, 'The latest recorded waste entries appear here for quick operational review.', 'تظهر هنا أحدث سجلات الهدر لمراجعة تشغيلية سريعة.')}</p>
          {wastage.length === 0 && (
            <div className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">
              {copy(lang, 'No wastage recorded yet.', 'لم يتم تسجيل هدر بعد.')}
            </div>
          )}
          {wastage.slice(0, 5).map(entry => (
            <div key={entry.id} className="mb-2 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600">
              {entry.ingredientName}: {entry.quantity} {entry.unitOfMeasure}
            </div>
          ))}
        </div>
      </aside>
    </div>
  );
};

export default RecipeInventory;
