"use client";

import type { ApolloClient, OperationVariables } from "@apollo/client";
import type { useMutation } from "@apollo/client/react";
import { useCallback } from "react";

/**
 * Adapts the Apollo `useMutation` result tuple into a single async callback
 * that takes only the variables. The returned function forwards to the
 * underlying mutate function and returns the same `MutateResult`.
 *
 * The wrapper is stable across renders as long as the mutate reference is
 * stable (Apollo guarantees this when `useMutation` is called with a stable
 * document).
 *
 * @example
 *   const tuple = useMutation(myMutationDocument);
 *   const run = useMutationWrapper(tuple);
 *   await run({ id: "1" });
 */
export function useMutationWrapper<TData, TVariables extends OperationVariables>(
  mutationResult: useMutation.ResultTuple<TData, TVariables>
): (variables: TVariables) => Promise<ApolloClient.MutateResult<TData>> {
  const [mutate] = mutationResult;
  return useCallback(
    (variables: TVariables): Promise<ApolloClient.MutateResult<TData>> => mutate({ variables }),
    [mutate]
  );
}
