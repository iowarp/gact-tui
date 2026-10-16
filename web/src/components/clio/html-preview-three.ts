import source from '../../../node_modules/three/build/three.cjs?raw';
import orbitControls from 'three/addons/controls/OrbitControls.js?raw';

/** Pinned offline Three.js, usable by classic scripts and modern module imports. */
export function threePreviewBootstrap(): string {
  const names = [...source.matchAll(/^exports\.(\w+) = /gm)].map((match) => match[1]);
  const module = names.map((name) => `export const ${name}=globalThis.THREE.${name};`).join('\n');
  return `(function(){const exports={};(function(exports){${source}\n})(exports);
    globalThis.THREE=exports;
    const makeModule=(text)=>URL.createObjectURL(new Blob([text],{type:'text/javascript'}));
    const imports={three:makeModule(${JSON.stringify(module)}),
      'three/addons/controls/OrbitControls.js':makeModule(${JSON.stringify(orbitControls)}),
      'three/examples/jsm/controls/OrbitControls.js':makeModule(${JSON.stringify(orbitControls)}),
      'three/addons/':'https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/'};
    const map=document.createElement('script');map.type='importmap';
    map.textContent=JSON.stringify({imports});document.head.append(map);
  })();`;
}
