/** converts any string (kebab, snake, camel) to kebab-case (e.g., "user-profile") */
export function toKebabCase(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

/** converts any string to PascalCase (e.g., "UserProfile") */
export function toPascalCase(str: string): string {
  return toKebabCase(str)
    .split("-")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export function toCamelCase(str: string): string {
  const pascal = toPascalCase(str);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}