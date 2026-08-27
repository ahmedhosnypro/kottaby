import type { Translations } from "@/shared/locale/types/message";

export interface NamespaceHandle<TLabels> {
  readonly id: string;
  readonly getLabels: (translations: Translations) => TLabels;
}

export function defineNamespace<TLabels>(
  id: string,
  getLabels: (translations: Translations) => TLabels
): NamespaceHandle<TLabels> {
  return { id, getLabels };
}

export function getNamespaceId<TLabels>(handle: NamespaceHandle<TLabels>): string {
  return handle.id;
}
