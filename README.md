# Aurelia 2 Single File Components Vite Plugin

>Please note this is an experimental plugin and not stable yet.

## Overview

This Vite plugin adds support for Single File Components (SFCs) in Aurelia 2 applications using the .au format. It allows developers to define `<script>`, `<template>`, and optional `<style>` tags within a single file, which are then processed into valid Aurelia 2 components.

## Features

- Single File Components: Define your component's logic, template, and styles in one `.au` file.
- Scoped Styles: Supports scoped styles with automatic scoping using unique identifiers.
- Preprocessor Support: Supports Sass, Stylus, and custom preprocessors.
- Automatic Component Naming: If a component name is not explicitly set, it is inferred from the class name.
- Optimized for Vite: Uses virtual modules for fast hot module replacement (HMR) and efficient bundling.

## Installation

```shell
npm install @aurelia/sfc-vite --save-dev
```

## Usage

In your `vite.config.js` or `vite.config.ts`:

```javascript
import { defineConfig } from 'vite';
import aurelia from '@aurelia/vite-plugin';
import aureliaSingleFileComponent from '@aurelia/sfc-vite';

export default defineConfig({
  plugins: [
    aurelia(),
    aureliaSingleFileComponent()
  ]
});
```

## Example `.au` File

```
<script lang="ts">
  import { bindable } from 'aurelia';

  export default class MyComponent {
    @bindable name = 'World';
  }
</script>

<template>
  <h1>Hello, ${name}!</h1>
</template>

<style scoped>
  h1 {
    color: blue;
  }
</style>
```

## Scoped Styles

If a `<style scoped>` tag is used, a unique attribute (e.g., data-v-xxxxx) is automatically applied to the component's root template element, ensuring styles remain encapsulated.

## Style Preprocessors

The plugin supports preprocessing for:

- Sass/SCSS (lang="scss" or lang="sass")
- Stylus (lang="stylus")
- Custom Preprocessors via plugin options

Example:

```
<style lang="scss" scoped>
  $primary: red;
  h1 {
    color: $primary;
  }
</style>
```

## Plugin Options

You can customize the plugin with options in vite.config.js:

```
import aureliaSingleFileComponent from '@aurelia/sfc-vite';

export default defineConfig({
  plugins: [
    aureliaSingleFileComponent({
      style: {
        preprocessors: {
          scss: (code, options) => require('sass').compileString(code, options).css,
          stylus: (code, options) => require('stylus').render(code, options)
        }
      }
    })
  ]
});
```

## Limitations

- The `<script>` and `<template>` sections are required.
- Only one `<script>` and `<template>` block per `.au` file.
- Limited support for multi-root templates.
- Basic style scoping (no deep selectors or advanced nesting behavior).
