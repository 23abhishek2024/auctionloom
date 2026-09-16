/**
 * Dynamically loads Razorpay Checkout SDK script with safety timeout
 * Ensures promises never hang even if adblocker or network drops the request
 * @returns {Promise<boolean>}
 */
export const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') return resolve(false);
    if (window.Razorpay) {
      return resolve(true);
    }

    const timer = setTimeout(() => {
      resolve(false);
    }, 2500);

    try {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => {
        clearTimeout(timer);
        resolve(true);
      };
      script.onerror = () => {
        clearTimeout(timer);
        resolve(false);
      };
      document.body.appendChild(script);
    } catch {
      clearTimeout(timer);
      resolve(false);
    }
  });
};
