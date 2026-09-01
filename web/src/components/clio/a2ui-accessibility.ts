export interface A2UIAccessibility {
  description?: unknown;
  label?: unknown;
}

/** Returns the resolved protocol label, omitting unresolved bindings. */
export function a2uiAccessibilityLabel(accessibility?: A2UIAccessibility): string | undefined {
  return typeof accessibility?.label === 'string' ? accessibility.label : undefined;
}

/** Returns the resolved protocol description, omitting unresolved bindings. */
export function a2uiAccessibilityDescription(
  accessibility?: A2UIAccessibility,
): string | undefined {
  return typeof accessibility?.description === 'string' ? accessibility.description : undefined;
}

/** Maps protocol accessibility metadata to the host element without inventing copy. */
export function a2uiAccessibilityProps(accessibility?: A2UIAccessibility): {
  'aria-description'?: string;
  'aria-label'?: string;
} {
  return {
    'aria-description': a2uiAccessibilityDescription(accessibility),
    'aria-label': a2uiAccessibilityLabel(accessibility),
  };
}
