import type { NamespaceHandle } from "@/shared/locale/namespaces/define-namespace";

export type InferNamespaceLabels<T> = T extends NamespaceHandle<infer L> ? L : never;
