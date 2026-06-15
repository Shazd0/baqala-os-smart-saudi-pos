import { initializeApp, getApps } from 'firebase/app';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
  type Unsubscribe,
} from 'firebase/firestore';

export type FirestoreCollection =
  | 'appState'
  | 'storeConfig'
  | 'users'
  | 'expenses'
  | 'shifts'
  | 'heldCarts'
  | 'auditLogs'
  | 'hardwareConfig'
  | 'zatcaState'
  | 'suppliers'
  | 'stockAdjustments'
  | 'purchaseInvoices'
  | 'creditEntries'
  | 'creditTransactions'
  | 'deals'
  | 'ingredients'
  | 'recipes'
  | 'wastageEntries'
  | 'products'
  | 'customers'
  | 'branches'
  | 'tables'
  | 'menuCategories'
  | 'menuItems'
  | 'modifierGroups'
  | 'diningAreas'
  | 'restaurantOrders'
  | 'kitchenTickets'
  | 'staffMembers'
  | 'branchStaffAssignments'
  | 'healthCertificates'
  | 'syncQueue'
  | 'zatcaSubmissions'
  | 'restaurantGroups'
  | 'cloudStorageConfig'
  | 'cloudSyncStatus'
  | 'guestTabs'
  | 'reservations'
  | 'loyaltyProfiles'
  | 'transactions'
  | 'deliveryChannels'
  | 'externalDeliveryOrders'
  | 'deliveryProviderEvents'
  | 'promotions'
  | 'serviceChargeConfigs';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function configured() {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
}

let firestore: Firestore | null = null;

function db() {
  if (!configured()) return null;
  if (!firestore) {
    const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    firestore = getFirestore(app);
  }
  return firestore;
}

function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefined) as T;
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, stripUndefined(entry)])
  ) as T;
}

export const FirebaseService = {
  isConfigured: configured,

  save: async <T extends { id: string }>(collectionName: FirestoreCollection, value: T): Promise<void> => {
    const database = db();
    if (!database || !value.id) return;
    await setDoc(doc(database, collectionName, value.id), stripUndefined({ ...value, syncedAt: Date.now() }), { merge: true });
  },

  saveMany: async <T extends { id: string }>(collectionName: FirestoreCollection, values: T[]): Promise<void> => {
    if (!configured()) return;
    await Promise.all(values.filter(value => value.id).map(value => FirebaseService.save(collectionName, value)));
  },

  delete: async (collectionName: FirestoreCollection, id: string): Promise<void> => {
    const database = db();
    if (!database || !id) return;
    await deleteDoc(doc(database, collectionName, id));
  },

  list: async <T>(collectionName: FirestoreCollection): Promise<T[]> => {
    const database = db();
    if (!database) return [];
    const snapshot = await getDocs(collection(database, collectionName));
    return snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as T);
  },

  subscribe: <T>(collectionName: FirestoreCollection, onData: (items: T[]) => void, sortBy?: string): Unsubscribe => {
    const database = db();
    if (!database) return () => undefined;
    const ref = collection(database, collectionName);
    const refQuery = sortBy ? query(ref, orderBy(sortBy)) : ref;
    return onSnapshot(refQuery, snapshot => {
      onData(snapshot.docs.map(item => ({ id: item.id, ...item.data() }) as T));
    });
  },
};
