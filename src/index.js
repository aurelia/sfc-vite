import ts from 'typescript';
import { existsSync, readFileSync, statSync } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { parse } from 'node-html-parser';
import sass from 'sass';
import stylus from 'stylus';

class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (this.cache.has(key)) {
      const value = this.cache.get(key);
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }
    return undefined;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove least recently used (first item)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }
}

const cache = new LRUCache(200);
const fileTimeCache = new Map();

function createLogger(pluginName) {
  return {
    error: (msg, ...args) => console.error(`[${pluginName}] ${msg}`, ...args),
    warn: (msg, ...args) => console.warn(`[${pluginName}] ${msg}`, ...args),
    info: (msg, ...args) => console.info(`[${pluginName}] ${msg}`, ...args),
  };
}

const logger = createLogger('vite-plugin-aurelia-sfc');

function generateScopeId(filePath) {
  return (
    'data-v-' + createHash('md5').update(filePath).digest('hex').slice(0, 8)
  );
}

function scopeStyles(css, scopeId) {
  try {
    return css.replace(/([^{}@]*?)\s*{/g, (match, selector) => {
      // Skip at-rules entirely
      if (selector.includes('@')) return match;
      
      const selectors = selector.split(',').map((s) => s.trim());
      const scoped = selectors
        .map((s) => {
          // Handle empty selectors
          if (!s) return s;
          
          // Handle :global() pseudo-selector
          if (s.includes(':global(')) {
            return s.replace(/:global\(([^)]+)\)/g, '$1');
          }
          
          // Handle :host selector
          if (s.startsWith(':host')) {
            return s.replace(':host', `[${scopeId}]`);
          }
          
          // Skip html, body, and other global selectors
          if (['html', 'body', '*', '::before', '::after'].includes(s.trim())) {
            return s;
          }
          
          // Handle keyframe selectors and other special cases
          if (s.includes('%') || /^\d+%$/.test(s.trim()) || s === 'from' || s === 'to') {
            return s;
          }
          
          // Add scope attribute to regular selectors
          return `${s}[${scopeId}]`;
        })
        .join(', ');
      
      return `${scoped} {`;
    });
  } catch (error) {
    logger.warn(`Failed to scope CSS: ${error.message}`);
    return css;
  }
}

async function processCss(css, lang, styleOptions = {}) {
  try {
    // Custom preprocessor support
    if (
      styleOptions.preprocessors &&
      typeof styleOptions.preprocessors[lang] === 'function'
    ) {
      return await styleOptions.preprocessors[lang](css, styleOptions);
    }

    switch (lang) {
    case 'scss':
    case 'sass':
      return sass.compileString(css, {
        ...styleOptions,
        sourceMap: true,
        sourceMapIncludeSources: true,
      }).css;
      
    case 'stylus':
      return new Promise((resolve, reject) => {
        const s = stylus(css);
        if (styleOptions && typeof styleOptions === 'object') {
          for (const [key, value] of Object.entries(styleOptions)) {
            if (typeof s.set === 'function') {
              s.set(key, value);
            }
          }
        }
        s.render((err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
      
    case 'less':
      // Support for Less if added as dependency
      if (styleOptions.lessEngine) {
        return styleOptions.lessEngine.render(css, styleOptions);
      }
      return css;
      
    default:
      return css;
    }
  } catch (error) {
    logger.error(`CSS preprocessing failed for ${lang}: ${error.message}`);
    throw new Error(`CSS preprocessing failed: ${error.message}`);
  }
}

function getCacheKey(filePath, options, code, fileStats) {
  const optionsStr = JSON.stringify(options);
  const statsStr = fileStats ? `${fileStats.mtime.getTime()}-${fileStats.size}` : '';
  return createHash('md5')
    .update(`${filePath}|${optionsStr}|${code}|${statsStr}`)
    .digest('hex');
}

function validateSFCStructure(root, filePath) {
  const scriptTags = root.querySelectorAll('script');
  const templateTags = root.querySelectorAll('template');
  
  if (scriptTags.length === 0) {
    throw new Error(`Missing <script> section in ${filePath}`);
  }
  
  if (scriptTags.length > 1) {
    logger.warn(`Multiple <script> tags found in ${filePath}, using the first one`);
  }
  
  if (templateTags.length === 0) {
    throw new Error(`Missing <template> section in ${filePath}`);
  }
  
  if (templateTags.length > 1) {
    logger.warn(`Multiple <template> tags found in ${filePath}, using the first one`);
  }

  return {
    script: scriptTags[0],
    template: templateTags[0],
    styles: root.querySelectorAll('style'),
  };
}

function extractImportsAndContent(script) {
  const imports = [];
  const contentLines = [];
  const lines = script.split('\n');
  
  let inMultiLineImport = false;
  let currentImport = '';
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Handle multi-line imports
    if (inMultiLineImport) {
      currentImport += '\n' + line;
      if (trimmedLine.includes(';') || trimmedLine.includes('from')) {
        imports.push(currentImport.trim());
        currentImport = '';
        inMultiLineImport = false;
      }
      continue;
    }
    
    // Single line import
    if (trimmedLine.startsWith('import ')) {
      if (!trimmedLine.includes(';') && !trimmedLine.includes('from')) {
        // Start of multi-line import
        inMultiLineImport = true;
        currentImport = line;
      } else {
        imports.push(line.trim());
      }
    } else {
      contentLines.push(line);
    }
  }
  
  return {
    imports: [...new Set(imports)], // Remove duplicates
    classContent: contentLines.join('\n').trim(),
  };
}

function extractElementName(script) {
  // More robust pattern matching for element names
  const patterns = [
    /@customElement\s*\(\s*\{\s*name:\s*['"`]([^'"`]+)['"`]/,
    /@customElement\s*\(\s*['"`]([^'"`]+)['"`]/,
    // Handle template literals
    /@customElement\s*\(\s*\{\s*name:\s*`([^`]+)`/,
  ];
  
  for (const pattern of patterns) {
    const match = script.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }
  
  return null;
}

function extractClassName(script) {
  const patterns = [
    /export\s+default\s+class\s+(\w+)/,
    /class\s+(\w+)[^{]*{/,
    /export\s+class\s+(\w+)/,
  ];
  
  for (const pattern of patterns) {
    const match = script.match(pattern);
    if (match) {
      return match[1];
    }
  }
  
  return 'AnonymousComponent';
}

function kebabCase(str) {
  return str
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function escapeTemplate(template) {
  return template
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
  // Note: We escape ${} so they're treated as Aurelia binding expressions, not JS template literals
}

function injectScopeAttribute(templateStr, scopeId) {
  try {
    const root = parse(templateStr);
    
    // Apply scope to all top-level elements
    root.childNodes.forEach((node) => {
      if (node.nodeType === 1 && node.tagName) {
        // Don't scope certain elements
        const excludeTags = ['html', 'head', 'body', 'meta', 'title', 'link', 'script', 'style'];
        if (!excludeTags.includes(node.tagName.toLowerCase())) {
          node.setAttribute(scopeId, '');
        }
      }
    });
    
    return root.toString();
  } catch (error) {
    logger.warn(`Failed to inject scope attribute: ${error.message}`);
    return templateStr;
  }
}

function shouldRecompile(filePath, cacheKey) {
  try {
    if (!cache.has(cacheKey)) return true;
    
    const stats = statSync(filePath);
    const cachedTime = fileTimeCache.get(filePath);
    
    if (!cachedTime || stats.mtime.getTime() > cachedTime) {
      fileTimeCache.set(filePath, stats.mtime.getTime());
      return true;
    }
    
    return false;
  } catch {
    return true;
  }
}

/** 
 * @param {Object} options - Plugin options.
 * @returns {import('vite').Plugin}
 */
export default function aureliaSingleFileComponent(options = {}) {
  const pluginOptions = {
    include: /\.au$/,
    exclude: /node_modules/,
    style: {},
    ...options,
  };

  return {
    name: 'vite-plugin-aurelia-sfc',
    enforce: 'pre',

    configureServer(server) {
      // Clear cache on server restart
      cache.clear();
      fileTimeCache.clear();
      
      return () => {
        server._ssrExternals = server._ssrExternals || {};
      };
    },

    handleHotUpdate(ctx) {
      if (ctx.file.endsWith('.au')) {
        // Clear related cache entries
        const cacheKeysToDelete = [];
        for (const [key] of cache.cache) {
          if (key.includes(ctx.file)) {
            cacheKeysToDelete.push(key);
          }
        }
        cacheKeysToDelete.forEach(key => cache.cache.delete(key));
        fileTimeCache.delete(ctx.file);
        
        // Update all modules that import this SFC
        const modules = [...ctx.modules];
        ctx.server.reloadModule(ctx.modules[0]);
        return modules;
      }
    },

    resolveId(id, importer) {
      try {
        if (id.endsWith('.au.css')) {
          const auFile = id.replace('.css', '');
          if (auFile.startsWith('./') || auFile.startsWith('../')) {
            const resolvedPath = path.resolve(path.dirname(importer || ''), auFile);
            return `virtual:${resolvedPath}.css`;
          }
          return `virtual:${id}`;
        }
        
        if (id.endsWith('.au')) {
          if (id.startsWith('./') || id.startsWith('../')) {
            const resolvedPath = path.resolve(path.dirname(importer || ''), id);
            return `virtual:${resolvedPath}`;
          }
          return `virtual:${id}`;
        }
        
        return null;
      } catch (error) {
        logger.error(`Error resolving ${id}: ${error.message}`);
        return null;
      }
    },

    async load(id) {
      if (!id.startsWith('virtual:')) return null;
      
      const filePath = id.replace('virtual:', '');
      
      try {
        // Handle .au.css files (virtual files generated from .au files)
        if (filePath.endsWith('.au.css')) {
          const auFilePath = filePath.replace('.css', '');
          
          if (!existsSync(auFilePath)) {
            throw new Error(`Could not find .au file at ${auFilePath}`);
          }

          const code = readFileSync(auFilePath, 'utf-8');
          const fileStats = statSync(auFilePath);
          const cacheKey = getCacheKey(auFilePath, pluginOptions, code, fileStats);

          if (!shouldRecompile(auFilePath, cacheKey)) {
            return cache.get(cacheKey);
          }

          const root = parse(code);
          const styleTags = root.querySelectorAll('style');
          
          if (!styleTags.length) {
            cache.set(cacheKey, '');
            return '';
          }

          let finalCss = '';
          
          for (const styleTag of styleTags) {
            let css = styleTag.innerText.trim();
            if (!css) continue;

            const lang = styleTag.getAttribute('lang') || 'css';
            
            try {
              if (lang !== 'css') {
                css = await processCss(css, lang, pluginOptions.style);
              }

              if (styleTag.rawAttrs.includes('scoped')) {
                const scopeId = generateScopeId(auFilePath);
                css = scopeStyles(css, scopeId);
              }

              finalCss += (finalCss ? '\n' : '') + css;
            } catch (error) {
              logger.error(`Error processing style block in ${auFilePath}: ${error.message}`);
              throw error;
            }
          }

          cache.set(cacheKey, finalCss);
          return finalCss;
        }

        // Handle .au files
        if (filePath.endsWith('.au')) {
          if (!existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }

          const fileContent = readFileSync(filePath, 'utf-8');
          const fileStats = statSync(filePath);
          const cacheKey = getCacheKey(filePath, pluginOptions, fileContent, fileStats);

          if (!shouldRecompile(filePath, cacheKey)) {
            return cache.get(cacheKey);
          }

          const root = parse(fileContent);
          const { script, template, styles } = validateSFCStructure(root, filePath);

          const scriptCode = script.innerText.trim();
          const rawTemplate = template.innerHTML.trim();

          // Check for scoped styles
          const hasScoped = styles.some(styleTag => 
            styleTag.rawAttrs.includes('scoped')
          );
          
          const scopeId = hasScoped ? generateScopeId(filePath) : null;
          const styleImport = styles.length ? `import '${filePath}.css';` : '';

          const { imports, classContent } = extractImportsAndContent(scriptCode);
          
          // Determine component name
          let componentName = extractElementName(classContent);
          if (!componentName) {
            const className = extractClassName(classContent);
            componentName = kebabCase(className);
          }

          // Process template
          const processedTemplate = hasScoped
            ? injectScopeAttribute(rawTemplate, scopeId)
            : rawTemplate;

          // Build final imports
          const allImports = new Set([
            ...imports,
            "import { customElement } from 'aurelia';"
          ]);

          // Apply decorator to the class
          const decoratedClassContent = classContent.replace(
            /export\s+default\s+class\s+(\w+)/,
            `@customElement({ name: '${componentName}', template })\nexport default class $1`
          );

          // Generate final script
          const finalScript = [
            Array.from(allImports).join('\n'),
            styleImport,
            '',
            `const template = \`${escapeTemplate(processedTemplate)}\`;`,
            '',
            decoratedClassContent
          ].filter(Boolean).join('\n');

          // Transpile TypeScript/JavaScript
          const transpileOptions = {
            compilerOptions: {
              allowJs: true,
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
              sourceMap: true,
              ...pluginOptions.typescript
            },
            fileName: filePath,
          };

          const transpiled = ts.transpileModule(finalScript, transpileOptions);
          
          let finalOutput = transpiled.outputText;
          
          if (transpiled.sourceMapText) {
            const sourceMapBase64 = Buffer.from(transpiled.sourceMapText).toString('base64');
            finalOutput += `\n//# sourceMappingURL=data:application/json;base64,${sourceMapBase64}`;
          }

          cache.set(cacheKey, finalOutput);
          return finalOutput;
        }

        return null;
      } catch (error) {
        logger.error(`Error processing ${filePath}: ${error.message}`);
        this.error(`Failed to process ${filePath}: ${error.message}`);
      }
    }
  };
}
