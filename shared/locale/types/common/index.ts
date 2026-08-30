export interface CommonLabels {
  readonly title: string;
  readonly description: string;
  readonly welcome: string;
  readonly loading: string;
  readonly error: string;
  readonly retry: string;
  readonly cancel: string;
  readonly save: string;
  readonly delete: string;
  readonly edit: string;
  readonly back: string;
  /** Pagination — previous-page affordance (feeds/lists with offset paging). */
  readonly previousPage: string;
  /** Pagination — next-page affordance (feeds/lists with offset paging). */
  readonly nextPage: string;
  readonly close: string;
  readonly search: string;
  readonly noResults: string;
  /** Collapsed-filter affordance label (mobile filter toggle rows). */
  readonly filters: string;
  readonly documentTitleTemplate: (title: string) => string;
  /** Connectivity labels — used by the Apollo provider stack (AppApolloProvider, useApolloConnectivity). */
  readonly serverNotAvailable: string;
  readonly serverConnectionLost: string;
  readonly checkNetworkConnection: string;
  readonly connectionRestored: string;
}
