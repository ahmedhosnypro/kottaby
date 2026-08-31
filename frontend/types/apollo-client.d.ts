import "@apollo/client";

declare module "@apollo/client" {
  namespace ApolloClient {
    namespace DeclareDefaultOptions {
      interface WatchQuery {
        errorPolicy?: "none" | "ignore" | "all";
      }
      interface Query {
        errorPolicy?: "none" | "ignore" | "all";
      }
      interface Mutate {
        errorPolicy?: "none" | "ignore" | "all";
      }
    }
  }
}
