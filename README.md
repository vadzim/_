# Boilerplate of `gulpfile.js` with babel + flow-type + webpack

## Problem:

Babel has no plugin for static type-checking. Flow is great, but it parses files itself and do not care about babel extensions.

## Goals:

* use modules from `src/` with no relative stuff, e.g.: `import Main from "app/main"`, not `import Main from "../app/main"`;
* integrate flow into make process;
* allow type checking in `src/` without need to write damn `@flow` garbage in an every file, but do not check files outside of `src/`;
* allow type checking of JS with experimental features from `stage-0`;
* disable type checking all the files in the current directory, but only in `src/` directory;
* dev server;
* restart gulp in dev mode if `gulpfile.js` is changed;
* write actual building status (compiling, success, error) to a file to be able to watch it in an editor.

Compile: `npm run make`

Run dev server: `npm run dev`

# TODO:

* Server side rendering of react components.
* Running server.js and connecting to it via dev server.
* redux.
* async generators.
* calculatable properties.
