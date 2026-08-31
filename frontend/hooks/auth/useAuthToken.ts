import { useNetworkConnectivity } from "@/frontend/hooks/connectivity";

// Convenience functions for global access to auth token management
export const useAuthToken = () => {
  const { authToken, updateAuthToken, clearAuthData } = useNetworkConnectivity();
  return {
    authToken,
    updateAuthToken,
    clearAuthData,
  };
};
