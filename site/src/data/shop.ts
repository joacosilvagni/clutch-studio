// Checkout configuration. The PayPal client ID is public by design (it is sent to every browser).
// Prices shown in the cart are informational: the Worker prices every order from its own catalog.
export const shop = {
  paypalClientId:
    import.meta.env.PUBLIC_PAYPAL_CLIENT_ID ??
    'BAABNklSErIZ4x9p3JdeXtMVe4ySKeYfC2PspuKGXJ7rjbcQ6zGRfRuPj52tf1OU1IJfQSoHD0mjTCWISk',
  currency: 'USD',
  sandbox: import.meta.env.PUBLIC_SANDBOX === 'true',
  downloadHours: 72,
  downloadsPerFile: 5,
};
