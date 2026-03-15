let handler = null;

export const setAuthErrorHandler = (nextHandler) => {
  handler = typeof nextHandler === "function" ? nextHandler : null;
};

export const clearAuthErrorHandler = () => {
  handler = null;
};

export const emitAuthError = (payload) => {
  try {
    if (handler) handler(payload);
  } catch (_e) {
    // ignore handler errors
  }
};

