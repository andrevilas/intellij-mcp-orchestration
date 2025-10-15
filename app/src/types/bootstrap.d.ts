declare module 'bootstrap/js/dist/dropdown' {
  export default class Dropdown {
    constructor(element: Element | string, options?: unknown);
    static getInstance(element: Element | string): Dropdown | null;
    static getOrCreateInstance(element: Element | string, options?: unknown): Dropdown;
    dispose(): void;
  }
}

declare module 'bootstrap/js/dist/tooltip' {
  export default class Tooltip {
    constructor(element: Element | string, options?: unknown);
    static getInstance(element: Element | string): Tooltip | null;
    static getOrCreateInstance(element: Element | string, options?: unknown): Tooltip;
    setContent(content: Record<string, string | Element>): void;
    dispose(): void;
  }
}

declare module 'bootstrap/js/dist/collapse';

declare module 'bootstrap/js/dist/modal';
