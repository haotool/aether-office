// The tests import the web app's and the scene's own copies of react, react-dom and three by file path (the repo root has
// none, and `vi.mock` must name the file the source imports). The types are the packages' usual ones.
declare module '*/three/build/three.module.js' {
  export * from 'three';
}
declare module '*/node_modules/react' {
  import React = require('react');
  export = React;
}
declare module '*/react-dom/server.node.js' {
  export * from 'react-dom/server';
}
