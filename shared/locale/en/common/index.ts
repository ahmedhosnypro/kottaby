import type { CommonLabels } from "@/shared/locale/types/common";

export const commonEn: CommonLabels = {
  title: "Kottaby Academy",
  description: "Kottaby Academy Learning Management System",
  welcome: "Welcome!",
  loading: "Loading...",
  error: "Something went wrong. Please try again.",
  retry: "Retry",
  cancel: "Cancel",
  save: "Save",
  delete: "Delete",
  edit: "Edit",
  back: "Back",
  close: "Close",
  search: "Search",
  noResults: "No results found",
  documentTitleTemplate: (title: string) => `${title} | Kottaby Academy`,
  serverNotAvailable: "Server not available",
  serverConnectionLost: "Server connection lost",
  checkNetworkConnection: "Please check your network connection",
  connectionRestored: "Connection restored",
};
