import type { PluginObj, PluginPass } from "@babel/core";
import type { types as BabelTypes } from "@babel/core";

type Babel = { types: typeof BabelTypes };

function isMdxFile(filename: string | undefined): boolean {
  return typeof filename === "string" && /\.mdx?$/.test(filename);
}

function memberToExpression(
  t: typeof BabelTypes,
  node: BabelTypes.JSXIdentifier | BabelTypes.JSXMemberExpression,
): BabelTypes.Expression {
  if (t.isJSXIdentifier(node)) return t.identifier(node.name);
  return t.memberExpression(memberToExpression(t, node.object), t.identifier(node.property.name));
}

/**
 * MDX emits intrinsic elements as `< _components.h1 >` rather than `<h1>` so that
 * consumers can override them via the `components` prop. `babel-preset-solid`
 * treats member expressions as components and emits `createComponent("h1")`,
 * which fails at runtime. Rewrite those tags to `<Dynamic component={_components.h1}>`
 * so Solid renders them as either a native tag or a component.
 *
 * The rewrite happens in a nested traversal during `Program.enter` because
 * `babel-preset-solid` replaces whole JSX subtrees when it runs, which prevents
 * a sibling `JSXElement` visitor from ever seeing nested elements. A nested
 * `path.traverse` only runs this plugin's visitor, so it always runs first.
 */
export function solidMdxDynamicPlugin({ types: t }: Babel): PluginObj {
  return {
    name: "anaemia-mdx-dynamic-elements",
    visitor: {
      Program: {
        enter(path, state: PluginPass) {
          if (!isMdxFile(state.filename)) return;

          state.set("anaemiaMdxNeedsDynamic", false);

          path.traverse({
            JSXElement(elementPath) {
              const name = elementPath.node.openingElement.name;
              if (!t.isJSXMemberExpression(name)) return;
              if (!t.isJSXIdentifier(name.object, { name: "_components" })) return;

              const component = memberToExpression(t, name);

              elementPath.node.openingElement.name = t.jsxIdentifier("Dynamic");
              if (elementPath.node.closingElement) {
                elementPath.node.closingElement.name = t.jsxIdentifier("Dynamic");
              }
              elementPath.node.openingElement.attributes.unshift(
                t.jsxAttribute(t.jsxIdentifier("component"), t.jsxExpressionContainer(component)),
              );

              state.set("anaemiaMdxNeedsDynamic", true);
            },
          });

          if (state.get("anaemiaMdxNeedsDynamic") && !path.scope.hasBinding("Dynamic")) {
            path.unshiftContainer(
              "body",
              t.importDeclaration(
                [t.importSpecifier(t.identifier("Dynamic"), t.identifier("Dynamic"))],
                t.stringLiteral("solid-js/web"),
              ),
            );
          }
        },
      },
    },
  };
}
