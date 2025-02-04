import ts from "typescript";
import { existsSync, readFileSync } from "fs";
import path from "path";
import { createHash } from "crypto";
import { parse } from "node-html-parser";
import sass from "sass";
import stylus from "stylus";

const cache = new Map();

function generateScopeId(filePath) {
  return (
    "data-v-" + createHash("md5").update(filePath).digest("hex").slice(0, 8)
  );
}

function scopeStyles(css, scopeId) {
  // Very naive scoping: skip @ rules, skip :global(...), skip :host
  return css.replace(/([^}]+){/g, (match, selector) => {
    if (selector.includes("@")) return match;
    const selectors = selector.split(",").map((s) => s.trim());
    const scoped = selectors
      .map((s) => {
        if (s.startsWith(":global")) {
          return s.replace(":global", "");
        }
        if (s.startsWith(":host")) {
          return s.replace(":host", `[${scopeId}]`);
        }
        if (s === "html" || s === "body") {
          return s;
        }
        return `${s}[${scopeId}]`;
      })
      .join(", ");
    return `${scoped} {`;
  });
}

function processCss(css, lang, styleOptions = {}) {
  if (
    styleOptions.preprocessors &&
    typeof styleOptions.preprocessors[lang] === "function"
  ) {
    return styleOptions.preprocessors[lang](css, styleOptions);
  }
  switch (lang) {
    case "scss":
    case "sass":
      return sass.compileString(css, styleOptions).css;
    case "stylus": {
      let output = "";
      const s = stylus(css);
      if (styleOptions && typeof styleOptions === "object") {
        for (const [key, value] of Object.entries(styleOptions)) {
          s.set(key, value);
        }
      }
      s.render((err, retCss) => {
        if (err) throw err;
        output = retCss;
      });
      return output;
    }
    default:
      return css;
  }
}

function getCacheKey(filePath, options, code) {
  return createHash("md5")
    .update(filePath + JSON.stringify(options) + code)
    .digest("hex");
}

export default function aureliaSingleFileComponent(options = {}) {
  return {
    name: "vite-plugin-aurelia-sfc",
    enforce: "pre",

    configureServer(server) {
      return () => {
        server._ssrExternals = server._ssrExternals || {};
      };
    },

    resolveId(id, importer) {
      if (id.endsWith(".au.css")) {
        const auFile = id.replace(".css", "");
        if (auFile.startsWith("./") || auFile.startsWith("../")) {
          const resolvedPath = path.resolve(path.dirname(importer), auFile);
          return `virtual:${resolvedPath}.css`;
        }
        return `virtual:${id}`;
      }
      if (id.endsWith(".au")) {
        if (id.startsWith("./") || id.startsWith("../")) {
          const resolvedPath = path.resolve(path.dirname(importer), id);
          return `virtual:${resolvedPath}`;
        }
        return `virtual:${id}`;
      }
      return null;
    },

    load(id) {
      if (!id.startsWith("virtual:")) return null;
      const filePath = id.replace("virtual:", "");
      const fileContent = existsSync(filePath)
        ? readFileSync(filePath, "utf-8")
        : "";
      const cacheKey = getCacheKey(filePath, options, fileContent);
      if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
      }

      // 1) Handle .au.css
      if (filePath.endsWith(".au.css")) {
        const auFilePath = filePath.replace(".css", "");
        if (!existsSync(auFilePath)) {
          throw new Error(`Could not find .au file at ${auFilePath}`);
        }
        const code = readFileSync(auFilePath, "utf-8");
        const root = parse(code);
        const styleTags = root.querySelectorAll("style");
        if (!styleTags.length) return "";
        let finalCss = "";
        for (const styleTag of styleTags) {
          let css = styleTag.innerText.trim();
          if (!css) continue;
          const lang = styleTag.getAttribute("lang");
          if (lang) {
            css = processCss(css, lang, options.style);
          }
          if (styleTag.rawAttrs.includes("scoped")) {
            const scopeId = generateScopeId(auFilePath);
            css = scopeStyles(css, scopeId);
          }
          finalCss += "\n" + css;
        }
        const processedContent = finalCss;
        cache.set(cacheKey, processedContent);
        return processedContent;
      }

      // 2) Handle .au
      if (!filePath.endsWith(".au")) return null;
      if (!existsSync(filePath)) {
        throw new Error(`Could not find .au file at ${filePath}`);
      }
      const code = readFileSync(filePath, "utf-8");
      const root = parse(code);
      const scriptTag = root.querySelector("script");
      const templateTag = root.querySelector("template");
      if (!scriptTag || !templateTag) {
        throw new Error(
          "A `.au` file must contain at least <script> and <template> sections."
        );
      }
      let scriptCode = scriptTag.innerText.trim();
      const scriptLang = scriptTag.getAttribute("lang") || "js";
      const rawTemplate = templateTag.innerHTML.trim();
      const styleTags = root.querySelectorAll("style");
      let scoped = false;
      for (const styleTag of styleTags) {
        if (styleTag.rawAttrs.includes("scoped")) {
          scoped = true;
          break;
        }
      }
      const scopeId = scoped ? generateScopeId(filePath) : null;
      const styleImport = styleTags.length
        ? `import '${filePath}.css';`
        : "";
      const { imports, classContent } = extractImportsAndContent(scriptCode);
      let rawName = extractElementName(classContent);
      if (!rawName) {
        const className = extractClassName(classContent);
        rawName = kebabCase(className);
      }
      const finalTemplate = scoped
        ? injectScopeAttribute(rawTemplate, scopeId)
        : rawTemplate;
      const joinedImports = new Set([
        ...imports,
        "import { customElement, bindable } from 'aurelia';"
      ]);
      const finalScript = `
        ${Array.from(joinedImports).join("\n")}
        ${styleImport}

        const template = \`${escapeTemplate(finalTemplate)}\`;

        @customElement({ name: '${rawName}', template })
        ${classContent}
      `;
      const transpiled = ts.transpileModule(finalScript, {
        compilerOptions: {
          allowJs: true,
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          sourceMap: true
        },
        fileName: filePath
      });
      let finalOutput;
      if (transpiled.sourceMapText) {
        finalOutput =
          transpiled.outputText +
          `\n//# sourceMappingURL=data:application/json;base64,` +
          Buffer.from(transpiled.sourceMapText).toString("base64");
      } else {
        finalOutput = transpiled.outputText;
      }
      cache.set(cacheKey, finalOutput);
      return finalOutput;
    }
  };
}

/** Extract import statements and remaining script content. */
function extractImportsAndContent(script) {
  const imports = [];
  const contentLines = [];
  for (const line of script.split("\n")) {
    if (line.trim().startsWith("import ")) {
      imports.push(line.trim());
    } else {
      contentLines.push(line);
    }
  }
  return {
    imports,
    classContent: contentLines.join("\n")
  };
}

/**
 * If user typed:
 *   @customElement({ name: "something" })
 * then parse the name.
 */
function extractElementName(script) {
  const match = script.match(
    /@customElement\s*\(\s*\{\s*name:\s*['"`](.+?)['"`]/
  );
  return match ? match[1].trim() : null;
}

function extractClassName(script) {
  const match = script.match(/export\s+default\s+class\s+(\w+)/);
  return match ? match[1] : "AnonymousComponent";
}

function kebabCase(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function escapeTemplate(tpl) {
  return tpl.replace(/[`\\]/g, "\\$&").replace(/\${/g, "\\${");
}

/**
 * Naively injects the scope attribute on the first top-level element.
 */
function injectScopeAttribute(templateStr, scopeId) {
  const root = parse(templateStr);
  root.childNodes.forEach((node) => {
    if (node.nodeType === 1 && node.tagName) {
      node.setAttribute(scopeId, "");
    }
  });
  return root.toString();
}
