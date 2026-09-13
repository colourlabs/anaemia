export type SSRDocumentAttributeValue = string | boolean | number | null | undefined;

export type SSRDocumentAttributes = Record<string, SSRDocumentAttributeValue>;

export interface SSRDocumentHead {
  title?: string;
  meta: SSRDocumentAttributes[];
  links: SSRDocumentAttributes[];
  scripts: Array<SSRDocumentAttributes & { children?: string }>;
  nodes: string[];
}

export interface SSRDocument {
  htmlAttrs: SSRDocumentAttributes;
  head: SSRDocumentHead;
  bodyAttrs: SSRDocumentAttributes;
  bodyStart: string[];
  bodyEnd: string[];
}

export interface SSRDocumentContext {
  request: Request;
  url: URL;
  pathname: string;
  params: Record<string, string>;
  routePattern: string;
  isDev: boolean;
}
