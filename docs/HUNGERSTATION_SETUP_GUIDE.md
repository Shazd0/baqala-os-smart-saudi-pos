# HungerStation Live Integration Setup Guide

This app is ready for a live HungerStation integration through a configurable API or middleware endpoint. It does not use sandbox or mock orders.

## What You Need

Ask HungerStation or your delivery middleware provider for:

- Live API base URL
- Merchant ID
- Branch ID for each restaurant branch
- API token or API key
- Expected request and response payloads for orders, acceptance, rejection, status updates, and menu availability

## App Setup

1. Open the app.
2. Go to `Restaurant Operations`.
3. Find `Live HungerStation`.
4. Enter:
   - `Endpoint URL`
   - `Merchant ID`
   - `HungerStation Branch ID`
   - `API token / key`
   - `Timeout seconds`
5. Click `Save Config`.
6. Click `Test Live`.

If any required value is missing, the app shows `Not configured` and blocks live sync actions.

## Expected Middleware Routes

Until the official HungerStation API details are provided, the app expects a middleware with these live routes:

```text
GET  /health
GET  /orders?merchantId=<merchantId>&branchId=<branchId>&status=new
POST /orders/:externalOrderId/accept
POST /orders/:externalOrderId/reject
POST /orders/:externalOrderId/status
POST /menu/availability
```

Every request sends:

```text
Authorization: Bearer <apiKey>
X-Merchant-Id: <merchantId>
X-Branch-Id: <externalBranchId>
Content-Type: application/json
```

## Order Flow

1. Click `Pull Orders`.
2. Live HungerStation orders appear in the integration card.
3. Click `Accept`.
4. The app imports the order as a normal delivery order.
5. The order is sent to KDS automatically.
6. Preparing and Ready actions in KDS send status updates back to HungerStation.

Rejected orders call the live reject endpoint and are not imported into KDS.

## Menu Mapping

1. Go to `Menu and Nutrition`.
2. Open a menu item.
3. In the `HungerStation` section, enter the real HungerStation item ID.
4. Keep `Included in HungerStation sync` enabled.
5. Save the menu item.
6. Return to `Restaurant Operations`.
7. Click `Sync Menu`.

The app sends active branch menu items to the configured `/menu/availability` endpoint.

## Live Order Payload Shape

The app accepts common order response shapes. A middleware response can be either an array or an object with `orders`, `data`, or `data.orders`.

Recommended order payload:

```json
{
  "orders": [
    {
      "externalOrderId": "HS-123456",
      "status": "new",
      "customerName": "Customer Name",
      "customerPhone": "+966500000000",
      "deliveryAddress": "Riyadh, Saudi Arabia",
      "subtotal": 50,
      "discount": 0,
      "vat": 7.5,
      "total": 57.5,
      "note": "No onions",
      "items": [
        {
          "id": "line-1",
          "externalMenuItemId": "HS-ITEM-10042",
          "name": "Chicken Shawarma",
          "quantity": 2,
          "unitPrice": 20,
          "note": "Spicy"
        }
      ]
    }
  ]
}
```

## Status Updates

When KDS changes a HungerStation order:

- `Preparing` sends `preparing`
- `Ready` sends `ready_for_pickup`

If the live API call fails after configuration, the app records a provider event as pending or failed so staff can see the issue.

## Troubleshooting

- `Not configured`: fill all required HungerStation fields and save.
- `Test Live` fails: check endpoint URL, token, merchant ID, branch ID, and network access.
- Orders do not appear: confirm the middleware returns orders under `orders`, `data`, or `data.orders`.
- Items show as unmapped: add the HungerStation item ID to the matching menu item.
- KDS status is not reaching HungerStation: check the provider events log in `Restaurant Operations`.

