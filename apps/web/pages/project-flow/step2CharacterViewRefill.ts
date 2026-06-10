export interface Step2CharacterViewItem {
  id: string;
  label: string;
  imageUrl: string;
  viewKey?: string;
}

interface ResolveStep2CharacterViewsInput {
  responseCharacterViews: Step2CharacterViewItem[];
  fallbackCharacterViews: Step2CharacterViewItem[];
}

function filterUsableViews(items: Step2CharacterViewItem[]): Step2CharacterViewItem[] {
  return items.filter((item) => typeof item.imageUrl === "string" && item.imageUrl.trim().length > 0);
}

export function resolveStep2CharacterViewsForPreview(input: ResolveStep2CharacterViewsInput): Step2CharacterViewItem[] {
  const responseViews = filterUsableViews(input.responseCharacterViews);
  if (responseViews.length > 0) {
    return responseViews;
  }
  return filterUsableViews(input.fallbackCharacterViews);
}

