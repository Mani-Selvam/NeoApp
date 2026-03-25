let currentSession = {
  signupData: null,
};

export const setPhoneVerificationSession = (payload) => {
  currentSession = {
    signupData: payload?.signupData || null,
  };
};

export const getPhoneVerificationSession = () => currentSession;

export const clearPhoneVerificationSession = () => {
  currentSession = {
    signupData: null,
  };
};
