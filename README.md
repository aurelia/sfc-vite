# Aurelia 2 Single File Components Vite Plugin

> **This is a work in progress and not ready for production use. Experimental and subject to change.**

## Overview

This Vite plugin adds robust support for Single File Components (SFCs) in Aurelia 2 applications using the `.au` format. It allows developers to define `<script>`, `<template>`, and optional `<style>` tags within a single file, which are then processed into valid Aurelia 2 components with advanced features and optimizations.

## Features

- **Single File Components**: Define your component's logic, template, and styles in one `.au` file
- **Enhanced Scoped Styles**: Robust CSS scoping with support for `:global()`, `:host`, and complex selectors
- **Advanced Preprocessor Support**: Sass, SCSS, Stylus, Less, and custom preprocessors with async support
- **Intelligent Component Naming**: Automatic inference from class names with kebab-case conversion
- **Performance Optimized**: LRU caching, file change detection, and efficient recompilation
- **Hot Module Replacement**: Full HMR support with cache invalidation
- **TypeScript Integration**: Enhanced TypeScript support with decorator metadata
- **Better Error Handling**: Comprehensive error reporting and validation
- **Source Maps**: Full source map support for both JavaScript and CSS
- **Memory Management**: Automatic cache cleanup and size limits

## Installation

```shell
npm install @aurelia/sfc-vite --save-dev
```

## Basic Usage

In your `vite.config.js` or `vite.config.ts`:

```javascript
import { defineConfig } from 'vite';
import aurelia from '@aurelia/vite-plugin';
import aureliaSingleFileComponent from '@aurelia/sfc-vite';

export default defineConfig({
  plugins: [
    aurelia(),
    aureliaSingleFileComponent({
      // Plugin options (see below)
    })
  ]
});
```

## Example `.au` File

```vue
<script lang="ts">
  import { bindable } from 'aurelia';

  export interface User {
    name: string;
    email: string;
  }

  export default class UserCard {
    @bindable user: User = { name: 'John Doe', email: 'john@example.com' };
    @bindable variant: 'primary' | 'secondary' = 'primary';
    
    private isExpanded = false;

    toggleExpanded(): void {
      this.isExpanded = !this.isExpanded;
    }

    get cardClasses(): string {
      return `user-card ${this.variant} ${this.isExpanded ? 'expanded' : ''}`;
    }
  }
</script>

<template>
  <div class="${cardClasses}" click.delegate="toggleExpanded()">
    <div class="header">
      <h3>${user.name}</h3>
      <span class="toggle">${isExpanded ? '−' : '+'}</span>
    </div>
    
    <div class="content" show.bind="isExpanded">
      <p>Email: <a href="mailto:${user.email}">${user.email}</a></p>
      <slot name="additional-info"></slot>
    </div>
  </div>
</template>

<style lang="scss" scoped>
$primary-color: #3498db;
$border-radius: 8px;

.user-card {
  border: 1px solid #e1e1e1;
  border-radius: $border-radius;
  padding: 16px;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
  
  &.primary .header h3 {
    color: $primary-color;
  }
  
  .toggle {
    cursor: pointer;
    user-select: none;
  }
}

// Global styles using :global()
:global(.user-card-container) {
  max-width: 400px;
  margin: 0 auto;
}
</style>
```

## Advanced Plugin Options

```javascript
import aureliaSingleFileComponent from '@aurelia/sfc-vite';

export default defineConfig({
  plugins: [
    aureliaSingleFileComponent({
      // File inclusion/exclusion patterns
      include: /\.au$/,
      exclude: /node_modules/,
      
      // Style preprocessing options
      style: {
        // Custom preprocessors
        preprocessors: {
          scss: async (code, options) => {
            const sass = await import('sass');
            return sass.compileString(code, options).css;
          },
          stylus: async (code, options) => {
            const stylus = await import('stylus');
            return new Promise((resolve, reject) => {
              stylus.render(code, options, (err, css) => {
                if (err) reject(err);
                else resolve(css);
              });
            });
          },
          less: async (code, options) => {
            const less = await import('less');
            const result = await less.render(code, options);
            return result.css;
          }
        },
        
        // Sass/SCSS options
        includePaths: ['src/styles'],
        outputStyle: 'compressed',
        
        // Stylus options
        compress: true,
        include: ['src/styles']
      },
      
      // TypeScript compiler options
      typescript: {
        target: 'ES2022',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strict: true
      }
    })
  ]
});
```

## Scoped Styles

The plugin provides enhanced scoped styling with several features:

### Basic Scoping
```scss
<style scoped>
.component {
  color: blue; // Becomes .component[data-v-xxxxxxxx]
}
</style>
```

### Global Styles
```scss
<style scoped>
:global(.global-class) {
  color: red; // Remains .global-class (not scoped)
}

:global(.container .item) {
  margin: 10px; // Complex selectors supported
}
</style>
```

### Host Styles
```scss
<style scoped>
:host {
  display: block; // Becomes [data-v-xxxxxxxx]
}

:host(.active) {
  background: yellow; // Becomes [data-v-xxxxxxxx].active
}
</style>
```

## Style Preprocessors

### SCSS/Sass
```scss
<style lang="scss" scoped>
$primary: #3498db;

.component {
  color: $primary;
  
  &:hover {
    color: darken($primary, 10%);
  }
}
</style>
```

### Stylus
```stylus
<style lang="stylus" scoped>
primary-color = #3498db

.component
  color primary-color
  
  &:hover
    color darken(primary-color, 10%)
</style>
```

### Less
```less
<style lang="less" scoped>
@primary-color: #3498db;

.component {
  color: @primary-color;
  
  &:hover {
    color: darken(@primary-color, 10%);
  }
}
</style>
```

## Component Naming

The plugin intelligently determines component names:

1. **Explicit naming**: `@customElement({ name: 'my-component' })`
2. **Class name inference**: `class UserProfile` → `user-profile`
3. **Fallback**: `AnonymousComponent` → `anonymous-component`

## Performance Features

- **LRU Caching**: Intelligent cache management with size limits
- **File Change Detection**: Only recompiles when files actually change
- **Parallel Processing**: Async processing for better performance
- **Memory Management**: Automatic cleanup of old cache entries
- **Hot Module Replacement**: Fast development with instant updates

## Error Handling

The plugin provides comprehensive error reporting:

- **Validation Errors**: Missing script/template sections
- **Preprocessing Errors**: CSS/SCSS compilation issues
- **TypeScript Errors**: Type checking and compilation errors
- **Template Errors**: Malformed HTML templates
- **File System Errors**: Missing files or permission issues

## Limitations

- Requires both `<script>` and `<template>` sections
- One script and template block per file (multiple style blocks supported)
- Scoped styles apply to top-level template elements only
- Source maps available for TypeScript compilation (CSS source maps in development)

## Migration from v0.0.1

The enhanced version is backward compatible, but offers these new features:

- Improved CSS scoping algorithm
- Better error messages and validation
- Performance optimizations
- HMR support
- Enhanced TypeScript integration
- Memory management improvements

## Troubleshooting

### Common Issues

1. **Import errors**: Ensure Aurelia imports are correct
2. **Style preprocessing**: Check preprocessor dependencies are installed
3. **TypeScript errors**: Verify TypeScript configuration
4. **Cache issues**: Clear cache by restarting dev server

### Debug Mode

Enable debug logging:

```javascript
aureliaSingleFileComponent({
  debug: true // Enables detailed logging
})
```

## Contributing

Contributions are welcome! Please ensure:

- TypeScript types are maintained
- Tests pass for all features
- Error handling is comprehensive
- Performance optimizations are preserved

## License

MIT License - see LICENSE file for details.
