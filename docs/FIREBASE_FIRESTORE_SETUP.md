# Firebase Firestore Setup

This app can mirror POS data to Firebase Firestore and use Firestore realtime kitchen tickets when Firebase is configured.

## 1. Create Firebase Project

1. Go to Firebase Console.
2. Create a project.
3. Add a Web App.
4. Copy the Firebase web config values.

## 2. Create `.env`

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Fill in:

```text
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

Restart the dev server after changing `.env`.

## 3. Firestore Collections

The app writes these collections:

```text
branches
tables
menuCategories
menuItems
restaurantOrders
kitchenTickets
staffMembers
branchStaffAssignments
healthCertificates
transactions
```

## 4. Recommended Firestore Rules For First Private Test

Use this only while testing with trusted devices:

```text
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

For production, replace this with Firebase Authentication and role-based rules before putting real customer or financial data in Firestore.

## 5. Test

1. Add `.env`.
2. Run `npm run dev`.
3. Add a menu item, staff member, or order.
4. Check Firestore collections in Firebase Console.
5. Open Kitchen Display and confirm realtime tickets appear.
